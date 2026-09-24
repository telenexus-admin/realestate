import { Router } from 'express';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { hashPassword, requirePermission, type AuthedRequest } from './auth.js';
import { query, withTransaction } from './db.js';

const router=Router();
function org(req:AuthedRequest){if(!req.auth?.organizationId)throw new Error('Organization context missing');return req.auth.organizationId;}

router.get('/team',requirePermission('team.write'),async(req:AuthedRequest,res)=>{
  const result=await query(`SELECT u.id,u.first_name,u.last_name,u.email,u.phone,u.status,ou.role,ou.property_scope,
    coalesce((SELECT json_agg(json_build_object('id',p.id,'name',p.name) ORDER BY p.name) FROM properties p WHERE p.organization_id=$1 AND p.id=ANY(coalesce(ou.property_scope,'{}'::uuid[]))),'[]'::json) assigned_properties
    FROM organization_users ou JOIN users u ON u.id=ou.user_id WHERE ou.organization_id=$1 ORDER BY u.first_name,u.last_name`,[org(req)]);
  res.json(result.rows);
});

router.post('/team/caretakers',requirePermission('team.write'),async(req:AuthedRequest,res)=>{
  const input=z.object({firstName:z.string().trim().min(1).max(80),lastName:z.string().trim().min(1).max(80),email:z.string().trim().toLowerCase().email(),phone:z.string().trim().min(6).max(30),temporaryPassword:z.string().min(12).max(200),propertyIds:z.array(z.string().uuid()).min(1).max(100)}).safeParse(req.body);
  if(!input.success)return res.status(400).json({error:'Please complete all caretaker details',fields:input.error.flatten().fieldErrors});
  const d=input.data;
  try{
    const caretaker=await withTransaction(async client=>{
      const properties=await client.query(`SELECT id FROM properties WHERE organization_id=$1 AND id=ANY($2::uuid[])`,[org(req),d.propertyIds]);
      if(properties.rowCount!==new Set(d.propertyIds).size)throw Object.assign(new Error('One or more assigned properties were not found'),{status:400});
      const duplicate=await client.query<{role:string|null}>(`SELECT ou.role FROM users u LEFT JOIN organization_users ou ON ou.user_id=u.id AND ou.organization_id=$1 WHERE lower(u.email)=$2 LIMIT 1`,[org(req),d.email]);
      if(duplicate.rowCount){
        const role=duplicate.rows[0].role?.replaceAll('_',' ');
        const message=role?`This email already belongs to the ${role} account in this workspace. Use a different email for the caretaker.`:'This email already has a PropOS account. Use a different email for the caretaker.';
        throw Object.assign(new Error(message),{status:409});
      }
      const user=await client.query<{id:string}>(`INSERT INTO users(email,password_hash,first_name,last_name,phone) VALUES($1,$2,$3,$4,$5) RETURNING id`,[d.email,hashPassword(d.temporaryPassword),d.firstName,d.lastName,d.phone]);
      await client.query(`INSERT INTO organization_users(organization_id,user_id,role,property_scope) VALUES($1,$2,'caretaker',$3::uuid[])`,[org(req),user.rows[0].id,d.propertyIds]);
      await client.query(`INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'team.caretaker_created','user',$3,$4::jsonb)`,[org(req),req.auth!.userId,user.rows[0].id,JSON.stringify({email:d.email,propertyIds:d.propertyIds})]);
      return {id:user.rows[0].id,first_name:d.firstName,last_name:d.lastName,email:d.email,phone:d.phone,role:'caretaker',property_scope:d.propertyIds,status:'active'};
    });
    res.status(201).json(caretaker);
  }catch(error){
    const e=error as Error&{status?:number;code?:string};
    if(e.status)return res.status(e.status).json({error:e.message});
    if(e.code==='23505')return res.status(409).json({error:'That email address already has an account'});
    throw error;
  }
});

router.post('/team/tenant-portal',requirePermission('team.write'),async(req:AuthedRequest,res)=>{
  const input=z.object({tenantId:z.string().uuid(),email:z.string().trim().toLowerCase().email(),temporaryPassword:z.string().min(12).max(200)}).safeParse(req.body);
  if(!input.success)return res.status(400).json({error:'Enter a valid email and a temporary password of at least 12 characters',fields:input.error.flatten().fieldErrors});
  const d=input.data;
  try{
    const account=await withTransaction(async client=>{
      const tenant=await client.query<any>(`SELECT id,first_name,last_name,phone FROM rental_tenants WHERE id=$1 AND organization_id=$2`,[d.tenantId,org(req)]);
      if(!tenant.rowCount)throw Object.assign(new Error('Tenant not found'),{status:404});
      const linked=await client.query(`SELECT 1 FROM tenant_portal_accounts WHERE organization_id=$1 AND tenant_id=$2`,[org(req),d.tenantId]);
      if(linked.rowCount)throw Object.assign(new Error('This tenant already has portal access'),{status:409});
      const duplicate=await client.query(`SELECT 1 FROM users WHERE lower(email)=$1`,[d.email]);
      if(duplicate.rowCount)throw Object.assign(new Error('That email address already has an account'),{status:409});
      const person=tenant.rows[0];
      const user=await client.query<{id:string}>(`INSERT INTO users(email,password_hash,first_name,last_name,phone) VALUES($1,$2,$3,$4,$5) RETURNING id`,[d.email,hashPassword(d.temporaryPassword),person.first_name,person.last_name,person.phone]);
      await client.query(`INSERT INTO organization_users(organization_id,user_id,role,property_scope) VALUES($1,$2,'tenant','{}'::uuid[])`,[org(req),user.rows[0].id]);
      await client.query(`INSERT INTO tenant_portal_accounts(organization_id,tenant_id,user_id,created_by) VALUES($1,$2,$3,$4)`,[org(req),d.tenantId,user.rows[0].id,req.auth!.userId]);
      await client.query(`UPDATE rental_tenants SET email=coalesce(email,$1) WHERE id=$2 AND organization_id=$3`,[d.email,d.tenantId,org(req)]);
      await client.query(`INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'tenant.portal_created','tenant',$3,$4::jsonb)`,[org(req),req.auth!.userId,d.tenantId,JSON.stringify({email:d.email,userId:user.rows[0].id})]);
      return {tenantId:d.tenantId,userId:user.rows[0].id,email:d.email,role:'tenant'};
    });
    res.status(201).json(account);
  }catch(error){
    const e=error as Error&{status?:number;code?:string};
    if(e.status)return res.status(e.status).json({error:e.message});
    if(e.code==='23505')return res.status(409).json({error:'This tenant or email already has portal access'});
    throw error;
  }
});

router.post('/team/tenant/:tenantId/documents',requirePermission('team.write'),async(req:AuthedRequest,res)=>{
  const tenantId=z.string().uuid().safeParse(req.params.tenantId);
  const input=z.object({fileName:z.string().trim().min(1).max(180),mimeType:z.enum(['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),contentBase64:z.string().min(1)}).safeParse(req.body);
  if(!tenantId.success||!input.success)return res.status(400).json({error:'Choose a PDF, Word document, JPG or PNG file'});
  const tenant=await query(`SELECT id FROM rental_tenants WHERE id=$1 AND organization_id=$2`,[tenantId.data,org(req)]);
  if(!tenant.rowCount)return res.status(404).json({error:'Tenant not found'});
  const content=Buffer.from(input.data.contentBase64,'base64');
  if(!content.length||content.length>5*1024*1024)return res.status(400).json({error:'Document must be smaller than 5 MB'});
  const extensions:Record<string,string>={'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png','application/msword':'.doc','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'.docx'};
  const root=process.env.DOCUMENT_STORAGE_ROOT||'/opt/realestate/uploads';
  const relative=join('tenant-documents',org(req),`${randomUUID()}${extensions[input.data.mimeType]}`);
  await mkdir(join(root,'tenant-documents',org(req)),{recursive:true});
  await writeFile(join(root,relative),content,{flag:'wx'});
  const result=await query(`INSERT INTO documents(organization_id,entity_type,entity_id,file_name,storage_key,mime_type,size_bytes,uploaded_by) VALUES($1,'tenant',$2,$3,$4,$5,$6,$7) RETURNING id,file_name,mime_type,size_bytes,created_at`,[org(req),tenantId.data,input.data.fileName,relative,input.data.mimeType,content.length,req.auth!.userId]);
  await query(`INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'tenant.document_uploaded','document',$3,$4::jsonb)`,[org(req),req.auth!.userId,result.rows[0].id,JSON.stringify({tenantId:tenantId.data,fileName:input.data.fileName,size:content.length})]);
  res.status(201).json(result.rows[0]);
});

export default router;

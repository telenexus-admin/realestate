import { Router } from 'express';
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
      const duplicate=await client.query(`SELECT 1 FROM users WHERE lower(email)=$1`,[d.email]);
      if(duplicate.rowCount)throw Object.assign(new Error('That email address already has an account'),{status:409});
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

export default router;

import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission, type AuthedRequest } from './auth.js';
import { query, withTransaction } from './db.js';
import { processEmailJobs } from './email-service.js';
import { queueWelcomeAgain } from './onboarding-service.js';

const router=Router();
function org(req:AuthedRequest){if(!req.auth?.organizationId)throw new Error('Organization context missing');return req.auth.organizationId;}

router.get('/onboarding/settings',requirePermission('team.write'),async(req:AuthedRequest,res)=>{
  const [settings,templates]=await Promise.all([
    query(`SELECT * FROM tenant_onboarding_settings WHERE organization_id=$1`,[org(req)]),
    query(`SELECT t.id,t.property_id,t.document_type,t.name,t.source_type,t.file_name,t.mime_type,t.version,t.status,t.created_at,p.name property_name FROM tenant_onboarding_templates t LEFT JOIN properties p ON p.id=t.property_id WHERE t.organization_id=$1 ORDER BY CASE t.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,t.created_at DESC`,[org(req)])
  ]);
  res.json({settings:settings.rows[0]||{sender_name:'PropOS by Polyizon',reply_to_email:'',welcome_message:'Welcome to your new home. Your portal keeps your payments, documents and support requests in one place.',portal_base_url:'https://propos.polyizon.tech',auto_create_portal:true,auto_send_welcome:true,invoice_first_rent:true,invoice_deposit:true},templates:templates.rows});
});

router.put('/onboarding/settings',requirePermission('team.write'),async(req:AuthedRequest,res)=>{
  const input=z.object({senderName:z.string().trim().min(2).max(100),replyToEmail:z.union([z.string().trim().email(),z.literal('')]),welcomeMessage:z.string().trim().min(10).max(2000),portalBaseUrl:z.string().url().max(300),autoCreatePortal:z.boolean(),autoSendWelcome:z.boolean(),invoiceFirstRent:z.boolean(),invoiceDeposit:z.boolean()}).safeParse(req.body);
  if(!input.success)return res.status(400).json({error:'Please check the onboarding settings',fields:input.error.flatten().fieldErrors});const d=input.data;
  const saved=await query(`INSERT INTO tenant_onboarding_settings(organization_id,sender_name,reply_to_email,welcome_message,portal_base_url,auto_create_portal,auto_send_welcome,invoice_first_rent,invoice_deposit,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(organization_id) DO UPDATE SET sender_name=excluded.sender_name,reply_to_email=excluded.reply_to_email,welcome_message=excluded.welcome_message,portal_base_url=excluded.portal_base_url,auto_create_portal=excluded.auto_create_portal,auto_send_welcome=excluded.auto_send_welcome,invoice_first_rent=excluded.invoice_first_rent,invoice_deposit=excluded.invoice_deposit,updated_by=excluded.updated_by,updated_at=now() RETURNING *`,[org(req),d.senderName,d.replyToEmail||null,d.welcomeMessage,d.portalBaseUrl,d.autoCreatePortal,d.autoSendWelcome,d.invoiceFirstRent,d.invoiceDeposit,req.auth!.userId]);
  res.json(saved.rows[0]);
});

router.post('/onboarding/templates',requirePermission('team.write'),async(req:AuthedRequest,res)=>{
  const input=z.object({name:z.string().trim().min(2).max(160),propertyId:z.string().uuid().optional(),documentType:z.enum(['agreement','house_rules','move_in','other']),sourceType:z.enum(['draft','upload']),body:z.string().max(50000).optional(),fileName:z.string().trim().max(180).optional(),mimeType:z.enum(['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']).optional(),contentBase64:z.string().optional(),makeActive:z.boolean().default(true)}).safeParse(req.body);
  if(!input.success)return res.status(400).json({error:'Complete the document details',fields:input.error.flatten().fieldErrors});const d=input.data;
  if(d.sourceType==='draft'&&(!d.body||d.body.trim().length<20))return res.status(400).json({error:'Draft at least a short document before saving'});
  if(d.sourceType==='upload'&&(!d.fileName||!d.mimeType||!d.contentBase64))return res.status(400).json({error:'Choose a PDF or Word document to upload'});
  if(d.propertyId){const property=await query(`SELECT 1 FROM properties WHERE id=$1 AND organization_id=$2`,[d.propertyId,org(req)]);if(!property.rowCount)return res.status(404).json({error:'Property not found'});}
  let storageKey:string|null=null;if(d.sourceType==='upload'){
    const content=Buffer.from(d.contentBase64!,'base64');if(!content.length||content.length>8*1024*1024)return res.status(400).json({error:'Document must be smaller than 8 MB'});
    const extension=d.mimeType==='application/pdf'?'.pdf':d.mimeType==='application/msword'?'.doc':'.docx',relative=join('onboarding-templates',org(req),`${randomUUID()}${extension}`);
    await mkdir(join(process.env.DOCUMENT_STORAGE_ROOT||'/opt/realestate/uploads','onboarding-templates',org(req)),{recursive:true});await writeFile(join(process.env.DOCUMENT_STORAGE_ROOT||'/opt/realestate/uploads',relative),content,{flag:'wx'});storageKey=relative;
  }
  const saved=await withTransaction(async client=>{
    if(d.makeActive)await client.query(`UPDATE tenant_onboarding_templates SET status='archived',updated_at=now() WHERE organization_id=$1 AND document_type=$2 AND property_id IS NOT DISTINCT FROM $3::uuid AND status='active'`,[org(req),d.documentType,d.propertyId||null]);
    const version=await client.query<{next:number}>(`SELECT coalesce(max(version),0)+1 next FROM tenant_onboarding_templates WHERE organization_id=$1 AND document_type=$2 AND property_id IS NOT DISTINCT FROM $3::uuid`,[org(req),d.documentType,d.propertyId||null]);
    return (await client.query(`INSERT INTO tenant_onboarding_templates(organization_id,property_id,document_type,name,source_type,body,storage_key,file_name,mime_type,version,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[org(req),d.propertyId||null,d.documentType,d.name,d.sourceType,d.sourceType==='draft'?d.body!.trim():null,storageKey,d.fileName||null,d.mimeType||null,version.rows[0].next,d.makeActive?'active':'draft',req.auth!.userId])).rows[0];
  });res.status(201).json(saved);
});

router.patch('/onboarding/templates/:id/status',requirePermission('team.write'),async(req:AuthedRequest,res)=>{
  const id=z.string().uuid().safeParse(req.params.id),body=z.object({status:z.enum(['active','archived'])}).safeParse(req.body);if(!id.success||!body.success)return res.status(400).json({error:'Invalid document update'});
  const saved=await withTransaction(async client=>{const found=await client.query<any>(`SELECT * FROM tenant_onboarding_templates WHERE id=$1 AND organization_id=$2`,[id.data,org(req)]);if(!found.rowCount)throw Object.assign(new Error('Document template not found'),{status:404});const item=found.rows[0];if(body.data.status==='active')await client.query(`UPDATE tenant_onboarding_templates SET status='archived',updated_at=now() WHERE organization_id=$1 AND document_type=$2 AND property_id IS NOT DISTINCT FROM $3::uuid AND status='active'`,[org(req),item.document_type,item.property_id]);return (await client.query(`UPDATE tenant_onboarding_templates SET status=$1,updated_at=now() WHERE id=$2 RETURNING *`,[body.data.status,id.data])).rows[0];});res.json(saved);
});

router.post('/team/tenant/:tenantId/onboarding/resend',requirePermission('team.write'),async(req:AuthedRequest,res)=>{
  const tenantId=z.string().uuid().safeParse(req.params.tenantId);if(!tenantId.success)return res.status(400).json({error:'Invalid tenant'});
  await withTransaction(client=>queueWelcomeAgain(client,org(req),tenantId.data));void processEmailJobs().catch(console.error);res.status(202).json({status:'queued'});
});

export default router;

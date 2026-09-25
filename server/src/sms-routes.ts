import { Router } from 'express';
import { z } from 'zod';
import { requirePermission, type AuthedRequest } from './auth.js';
import { query } from './db.js';
import { encryptSmsSecret, normalizeSmsPhone, sendOrganizationSms, SMS_PROVIDERS, type SmsProvider } from './sms-service.js';

const router=Router();
function org(req:AuthedRequest){if(!req.auth?.organizationId)throw new Error('Organization context missing');return req.auth.organizationId;}
const providerSchema=z.enum(SMS_PROVIDERS);
const senderSchema=z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_. -]+$/,'Use only letters, numbers, spaces, dots, underscores or hyphens');

router.get('/sms/settings',requirePermission('team.write'),async(req:AuthedRequest,res)=>{
  const found=await query<any>(`SELECT provider,sender_id,partner_id,enabled,configured_at,updated_at,api_key_ciphertext IS NOT NULL has_api_key FROM organization_sms_settings WHERE organization_id=$1`,[org(req)]);
  res.json(found.rows[0]||{provider:'blessed_text',sender_id:'',partner_id:'',enabled:false,configured_at:null,has_api_key:false});
});

router.put('/sms/settings',requirePermission('team.write'),async(req:AuthedRequest,res)=>{
  const input=z.object({provider:providerSchema,apiKey:z.string().trim().max(500).default(''),senderId:senderSchema,partnerId:z.string().trim().max(80).default(''),enabled:z.boolean().default(true)}).safeParse(req.body);
  if(!input.success)return res.status(400).json({error:'Check the SMS provider details',fields:input.error.flatten().fieldErrors});
  const d=input.data,existing=await query<any>(`SELECT provider,api_key_ciphertext FROM organization_sms_settings WHERE organization_id=$1`,[org(req)]);
  const canKeepKey=existing.rows[0]?.provider===d.provider&&existing.rows[0]?.api_key_ciphertext;
  if(!d.apiKey&&!canKeepKey)return res.status(400).json({error:'Enter the provider API key or token'});
  if(d.provider==='savvy'&&!d.partnerId)return res.status(400).json({error:'Enter the Savvy Partner ID'});
  const ciphertext=d.apiKey?encryptSmsSecret(d.apiKey):existing.rows[0].api_key_ciphertext;
  const saved=await query<any>(`INSERT INTO organization_sms_settings(organization_id,provider,api_key_ciphertext,sender_id,partner_id,enabled,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id) DO UPDATE SET provider=excluded.provider,api_key_ciphertext=excluded.api_key_ciphertext,sender_id=excluded.sender_id,partner_id=excluded.partner_id,enabled=excluded.enabled,configured_at=CASE WHEN organization_sms_settings.provider<>excluded.provider OR organization_sms_settings.api_key_ciphertext<>excluded.api_key_ciphertext THEN now() ELSE organization_sms_settings.configured_at END,updated_at=now(),updated_by=excluded.updated_by RETURNING provider,sender_id,partner_id,enabled,configured_at,updated_at`,[org(req),d.provider,ciphertext,d.senderId,d.provider==='savvy'?d.partnerId:null,d.enabled,req.auth!.userId]);
  await query(`INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'sms.settings_updated','organization',$1,$3::jsonb)`,[org(req),req.auth!.userId,JSON.stringify({provider:d.provider,senderId:d.senderId,enabled:d.enabled})]);
  res.json({...saved.rows[0],has_api_key:true});
});

router.post('/sms/test',requirePermission('team.write'),async(req:AuthedRequest,res)=>{
  const input=z.object({phone:z.string().trim().min(8).max(30)}).safeParse(req.body);if(!input.success)return res.status(400).json({error:'Enter a valid test phone number'});
  const sent=await sendOrganizationSms({organizationId:org(req),phone:normalizeSmsPhone(input.data.phone),message:'Polyizon PropOS test: your SMS provider is configured correctly.',category:'configuration_test',sentBy:req.auth!.userId});
  res.json({sent:true,recipient:sent.recipient,provider:sent.provider});
});

router.post('/sms/messages',requirePermission('team.write'),async(req:AuthedRequest,res)=>{
  const input=z.object({audience:z.enum(['all','tenant']),tenantId:z.string().uuid().optional(),message:z.string().trim().min(2).max(480)}).safeParse(req.body);
  if(!input.success)return res.status(400).json({error:'Choose recipients and write a message of up to 480 characters'});const d=input.data;
  if(d.audience==='tenant'&&!d.tenantId)return res.status(400).json({error:'Choose a tenant'});
  const tenants=await query<any>(`SELECT rt.id,rt.first_name,rt.last_name,rt.phone,coalesce(p.name,'') property_name,coalesce(u.unit_number,'') unit_number,coalesce(sum(i.total-i.paid_amount) FILTER(WHERE i.status IN ('issued','partial','overdue')),0) balance FROM rental_tenants rt LEFT JOIN leases l ON l.tenant_id=rt.id AND l.status IN ('active','expiring') LEFT JOIN units u ON u.id=l.unit_id LEFT JOIN properties p ON p.id=u.property_id LEFT JOIN invoices i ON i.tenant_id=rt.id WHERE rt.organization_id=$1 AND ($2::uuid IS NULL OR rt.id=$2) AND nullif(regexp_replace(coalesce(rt.phone,''),'[^0-9]','','g'),'') IS NOT NULL GROUP BY rt.id,p.name,u.unit_number ORDER BY rt.first_name,rt.last_name`,[org(req),d.audience==='tenant'?d.tenantId:null]);
  if(!tenants.rowCount)return res.status(404).json({error:'No tenant with a valid phone number was found'});
  let sent=0,failed=0;const failures:string[]=[];
  for(const tenant of tenants.rows){
    const message=d.message.replaceAll('{{name}}',tenant.first_name).replaceAll('{{property}}',tenant.property_name||'your property').replaceAll('{{unit}}',tenant.unit_number||'').replaceAll('{{balance}}',`KES ${Number(tenant.balance||0).toLocaleString('en-KE')}`);
    try{await sendOrganizationSms({organizationId:org(req),phone:tenant.phone,message,tenantId:tenant.id,category:'tenant_message',sentBy:req.auth!.userId});sent++;}catch(error){failed++;failures.push(`${tenant.first_name}: ${error instanceof Error?error.message:'failed'}`);}
  }
  res.status(sent?200:502).json({sent,failed,total:tenants.rowCount,errors:failures.slice(0,5)});
});

export default router;

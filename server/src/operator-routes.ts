import { NextFunction, Response, Router } from 'express';
import { z } from 'zod';
import { hashPassword, type AuthedRequest } from './auth.js';
import { query, withTransaction } from './db.js';

const router=Router();

async function requirePlatformAdmin(req:AuthedRequest,res:Response,next:NextFunction){
  if(!req.auth?.userId)return res.status(401).json({error:'Authentication required'});
  const result=await query(`SELECT 1 FROM platform_admins WHERE user_id=$1 AND active=true`,[req.auth.userId]);
  if(!result.rowCount)return res.status(403).json({error:'Platform administrator access required'});
  next();
}

router.use('/operator',requirePlatformAdmin);

router.get('/operator/summary',async (_req,res)=>{
  const [organizations,users,units]=await Promise.all([
    query<{total:string;active:string;trial:string;suspended:string}>(`SELECT count(*)::text total,
      count(*) FILTER (WHERE status='active')::text active,
      count(*) FILTER (WHERE status='trial')::text trial,
      count(*) FILTER (WHERE status='suspended')::text suspended FROM organizations`),
    query<{count:string}>(`SELECT count(*)::text count FROM users WHERE status='active'`),
    query<{count:string}>(`SELECT count(*)::text count FROM units WHERE status<>'inactive'`),
  ]);
  const row=organizations.rows[0];
  res.json({organizations:Number(row.total),active:Number(row.active),trial:Number(row.trial),suspended:Number(row.suspended),users:Number(users.rows[0].count),units:Number(units.rows[0].count)});
});

router.get('/operator/organizations',async (_req,res)=>{
  const result=await query(`SELECT o.id,o.name,o.slug,o.status,o.plan,o.email,o.phone,o.currency,o.timezone,o.created_at,
    coalesce(s.unit_limit,0)::int unit_limit,s.trial_ends_at,
    count(DISTINCT ou.user_id)::int user_count,count(DISTINCT u.id)::int unit_count
    FROM organizations o
    LEFT JOIN subscriptions s ON s.organization_id=o.id
    LEFT JOIN organization_users ou ON ou.organization_id=o.id
    LEFT JOIN units u ON u.organization_id=o.id AND u.status<>'inactive'
    GROUP BY o.id,s.unit_limit,s.trial_ends_at ORDER BY o.created_at DESC`);
  res.json(result.rows);
});

const onboardSchema=z.object({
  companyName:z.string().trim().min(2).max(120),
  slug:z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/,'Use lowercase letters, numbers and hyphens only'),
  companyEmail:z.string().trim().email().optional().or(z.literal('')),
  companyPhone:z.string().trim().max(30).optional().or(z.literal('')),
  plan:z.enum(['starter','growth','professional']).default('starter'),
  unitLimit:z.number().int().min(1).max(100000).default(50),
  status:z.enum(['trial','active']).default('trial'),
  adminFirstName:z.string().trim().min(1).max(80),
  adminLastName:z.string().trim().min(1).max(80),
  adminEmail:z.string().trim().toLowerCase().email(),
  adminPhone:z.string().trim().max(30).optional().or(z.literal('')),
  temporaryPassword:z.string().min(12).max(200),
});

router.post('/operator/organizations',async (req:AuthedRequest,res)=>{
  const parsed=onboardSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Please correct the highlighted details',fields:parsed.error.flatten().fieldErrors});
  const d=parsed.data;
  try{
    const created=await withTransaction(async client=>{
      const duplicate=await client.query(`SELECT 1 FROM organizations WHERE slug=$1 UNION ALL SELECT 1 FROM users WHERE lower(email)=$2 LIMIT 1`,[d.slug,d.adminEmail]);
      if(duplicate.rowCount)throw Object.assign(new Error('Company code or administrator email already exists'),{status:409});
      const organization=await client.query<{id:string;name:string;slug:string;status:string;plan:string}>(`INSERT INTO organizations(name,slug,status,plan,email,phone)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,slug,status,plan`,[d.companyName,d.slug,d.status,d.plan,d.companyEmail||null,d.companyPhone||null]);
      const org=organization.rows[0];
      const user=await client.query<{id:string}>(`INSERT INTO users(email,password_hash,first_name,last_name,phone)
        VALUES($1,$2,$3,$4,$5) RETURNING id`,[d.adminEmail,hashPassword(d.temporaryPassword),d.adminFirstName,d.adminLastName,d.adminPhone||null]);
      await client.query(`INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'owner')`,[org.id,user.rows[0].id]);
      await client.query(`INSERT INTO subscriptions(organization_id,plan,unit_limit,status,trial_ends_at,current_period_start,current_period_end)
        VALUES($1,$2,$3,$4,CASE WHEN $4='trial' THEN now()+interval '14 days' END,now(),now()+interval '1 month')`,[org.id,d.plan,d.unitLimit,d.status]);
      await client.query(`INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata)
        VALUES($1,$2,'platform.organization_created','organization',$1,$3::jsonb)`,[org.id,req.auth!.userId,JSON.stringify({slug:d.slug,plan:d.plan,unitLimit:d.unitLimit,adminEmail:d.adminEmail})]);
      return org;
    });
    res.status(201).json(created);
  }catch(error){
    const e=error as Error & {status?:number;code?:string};
    if(e.status===409||e.code==='23505')return res.status(409).json({error:'Company code or administrator email already exists'});
    throw error;
  }
});

router.patch('/operator/organizations/:id/status',async (req:AuthedRequest,res)=>{
  const parsed=z.object({status:z.enum(['trial','active','suspended'])}).safeParse(req.body);
  const id=z.string().uuid().safeParse(req.params.id);
  if(!parsed.success||!id.success)return res.status(400).json({error:'Invalid organization status request'});
  if(id.data===req.auth?.organizationId&&parsed.data.status==='suspended')return res.status(400).json({error:'You cannot suspend the operator workspace you are using'});
  const changed=await withTransaction(async client=>{
    const result=await client.query(`UPDATE organizations SET status=$1,updated_at=now() WHERE id=$2 RETURNING id,name,slug,status`,[parsed.data.status,id.data]);
    if(!result.rowCount)return null;
    await client.query(`UPDATE subscriptions SET status=$1,updated_at=now() WHERE organization_id=$2`,[parsed.data.status,id.data]);
    await client.query(`INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata)
      VALUES($1,$2,'platform.organization_status_changed','organization',$1,$3::jsonb)`,[id.data,req.auth!.userId,JSON.stringify({status:parsed.data.status})]);
    return result.rows[0];
  });
  if(!changed)return res.status(404).json({error:'Company not found'});
  res.json(changed);
});

export default router;

import { Router, Response } from 'express';
import { createHash } from 'crypto';
import { z } from 'zod';
import { query, withTransaction } from './db.js';
import { hasPermission, type AuthedRequest, type AuthUser } from './auth.js';

const router = Router();
const FINANCIAL_ACTIONS=new Set(['owner_payout','vendor_invoice','deposit_refund','write_off','bank_reconciliation','expense_approval']);

function ctx(req:AuthedRequest){
  if(!req.auth?.organizationId || !req.auth?.userId) throw new Error('Authenticated organization context required');
  return req.auth;
}

function canApprove(role:string, actionType:string){
  if(!hasPermission(role,'workflow.approve'))return false;
  if(FINANCIAL_ACTIONS.has(actionType))return hasPermission(role,'finance.write');
  return true;
}

function bodyHash(body:unknown){return createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');}

async function audit(client:any, auth:AuthUser, action:string, entityId:string, metadata:Record<string,unknown>={}){
  await client.query(`INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata)
    VALUES($1,$2,$3,'workflow_action',$4,$5::jsonb)`,[auth.organizationId,auth.userId,action,entityId,JSON.stringify(metadata)]);
}

async function event(client:any, auth:AuthUser, workflowId:string, eventType:string, fromStatus:string|null, toStatus:string|null, reason?:string, metadata:Record<string,unknown>={}){
  await client.query(`INSERT INTO workflow_action_events(organization_id,workflow_action_id,actor_user_id,event_type,from_status,to_status,reason,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[auth.organizationId,workflowId,auth.userId,eventType,fromStatus,toStatus,reason||null,JSON.stringify(metadata)]);
}

async function idempotent(req:AuthedRequest,res:Response,operation:string,work:()=>Promise<{status:number;body:unknown}>){
  const auth=ctx(req);
  const key=req.header('Idempotency-Key');
  if(!key) return res.status(400).json({error:'Idempotency-Key header is required for this operation'});
  if(key.length>160) return res.status(400).json({error:'Idempotency-Key is too long'});
  const hash=bodyHash(req.body);
  const existing=await query<{request_hash:string|null;response_status:number|null;response_body:unknown}>(`SELECT request_hash,response_status,response_body FROM api_idempotency_keys WHERE organization_id=$1 AND idempotency_key=$2 AND operation=$3 AND expires_at>now()`,[auth.organizationId,key,operation]);
  if(existing.rowCount){
    const row=existing.rows[0];
    if(row.request_hash && row.request_hash!==hash) return res.status(409).json({error:'Idempotency key was already used with a different request'});
    return res.status(row.response_status||200).json(row.response_body);
  }
  try{
    await query(`INSERT INTO api_idempotency_keys(organization_id,user_id,idempotency_key,operation,request_hash) VALUES($1,$2,$3,$4,$5)`,[auth.organizationId,auth.userId,key,operation,hash]);
  }catch(error:any){
    if(error?.code==='23505') return res.status(409).json({error:'A request with this idempotency key is already processing'});
    throw error;
  }
  try{
    const result=await work();
    await query(`UPDATE api_idempotency_keys SET response_status=$1,response_body=$2::jsonb WHERE organization_id=$3 AND idempotency_key=$4 AND operation=$5`,[result.status,JSON.stringify(result.body),auth.organizationId,key,operation]);
    return res.status(result.status).json(result.body);
  }catch(error){
    await query(`DELETE FROM api_idempotency_keys WHERE organization_id=$1 AND idempotency_key=$2 AND operation=$3`,[auth.organizationId,key,operation]);
    throw error;
  }
}

router.get('/workflows', async (req:AuthedRequest,res)=>{
  const auth=ctx(req);
  if(!hasPermission(auth.role,'workflow.approve')&&!hasPermission(auth.role,'workflow.execute'))return res.status(403).json({error:'Workflow access is not permitted for this role'});
  const status=typeof req.query.status==='string'?req.query.status:null;
  const assigned=typeof req.query.assignedTo==='string'?req.query.assignedTo:null;
  const result=await query(`SELECT w.*,ru.first_name||' '||ru.last_name requested_by_name,au.first_name||' '||au.last_name assigned_to_name,
      ap.first_name||' '||ap.last_name approved_by_name
    FROM workflow_actions w
    LEFT JOIN users ru ON ru.id=w.requested_by LEFT JOIN users au ON au.id=w.assigned_to LEFT JOIN users ap ON ap.id=w.approved_by
    WHERE w.organization_id=$1 AND ($2::text IS NULL OR w.status=$2) AND ($3::uuid IS NULL OR w.assigned_to=$3)
    ORDER BY CASE w.risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,w.created_at DESC
    LIMIT 250`,[auth.organizationId,status,assigned]);
  res.json(result.rows);
});

router.get('/workflows/:id', async (req:AuthedRequest,res)=>{
  const auth=ctx(req);
  if(!hasPermission(auth.role,'workflow.approve')&&!hasPermission(auth.role,'workflow.execute'))return res.status(403).json({error:'Workflow access is not permitted for this role'});
  const result=await query(`SELECT * FROM workflow_actions WHERE id=$1 AND organization_id=$2`,[req.params.id,auth.organizationId]);
  if(!result.rowCount) return res.status(404).json({error:'Workflow action not found'});
  const events=await query(`SELECT e.*,u.first_name||' '||u.last_name actor_name FROM workflow_action_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.workflow_action_id=$1 AND e.organization_id=$2 ORDER BY e.created_at DESC`,[req.params.id,auth.organizationId]);
  res.json({...result.rows[0],events:events.rows});
});

router.post('/workflows', async (req:AuthedRequest,res)=>{
  const auth=ctx(req);
  const input=z.object({
    actionType:z.enum(['owner_payout','vendor_invoice','deposit_refund','write_off','renewal_offer','bank_reconciliation','expense_approval','maintenance_approval']),
    title:z.string().min(3),description:z.string().optional(),entityType:z.string().optional(),entityId:z.string().uuid().optional(),amount:z.number().nonnegative().optional(),currency:z.string().length(3).default('KES'),riskLevel:z.enum(['low','medium','high','critical']).default('medium'),department:z.string().min(2).default('operations'),assignedTo:z.string().uuid().optional(),policyState:z.enum(['clear','review','blocked']).default('clear'),policyReasons:z.array(z.string()).default([])
  }).safeParse(req.body);
  if(!input.success) return res.status(400).json({error:input.error.flatten()});
  const d=input.data;
  if(FINANCIAL_ACTIONS.has(d.actionType)&&!hasPermission(auth.role,'finance.read')&&!hasPermission(auth.role,'finance.write'))return res.status(403).json({error:'Financial workflow access is not permitted for this role'});
  const row=await withTransaction(async client=>{
    if(d.assignedTo){const member=await client.query(`SELECT 1 FROM organization_users WHERE organization_id=$1 AND user_id=$2`,[auth.organizationId,d.assignedTo]);if(!member.rowCount)throw Object.assign(new Error('Assignee is not a member of this organization'),{status:400});}
    const inserted=await client.query(`INSERT INTO workflow_actions(organization_id,action_type,title,description,entity_type,entity_id,amount,currency,risk_level,department,status,policy_state,policy_reasons,requested_by,assigned_to)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15) RETURNING *`,[auth.organizationId,d.actionType,d.title,d.description||null,d.entityType||null,d.entityId||null,d.amount??null,d.currency,d.riskLevel,d.department,d.assignedTo?'assigned':'pending',d.policyState,JSON.stringify(d.policyReasons),auth.userId,d.assignedTo||null]);
    await event(client,auth,inserted.rows[0].id,'created',null,inserted.rows[0].status,undefined,{riskLevel:d.riskLevel});
    await audit(client,auth,'workflow.create',inserted.rows[0].id,{actionType:d.actionType});
    return inserted.rows[0];
  });
  res.status(201).json(row);
});

router.patch('/workflows/:id/assign', async (req:AuthedRequest,res)=>{
  const auth=ctx(req);
  if(!hasPermission(auth.role,'workflow.approve')) return res.status(403).json({error:'Your role cannot assign workflow actions'});
  const input=z.object({assignedTo:z.string().uuid()}).safeParse(req.body);
  if(!input.success) return res.status(400).json({error:input.error.flatten()});
  const row=await withTransaction(async client=>{
    const existing=await client.query(`SELECT * FROM workflow_actions WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[req.params.id,auth.organizationId]);
    if(!existing.rowCount) return null;
    const current=existing.rows[0];
    if(['approved','rejected','executed','cancelled'].includes(current.status)) throw Object.assign(new Error('Finalized workflow actions cannot be reassigned'),{status:409});
    const member=await client.query(`SELECT 1 FROM organization_users WHERE organization_id=$1 AND user_id=$2`,[auth.organizationId,input.data.assignedTo]);
    if(!member.rowCount) throw Object.assign(new Error('Assignee is not a member of this organization'),{status:400});
    const updated=await client.query(`UPDATE workflow_actions SET assigned_to=$1,status='assigned' WHERE id=$2 AND organization_id=$3 RETURNING *`,[input.data.assignedTo,req.params.id,auth.organizationId]);
    await event(client,auth,current.id,'assigned',current.status,'assigned',undefined,{assignedTo:input.data.assignedTo});
    await audit(client,auth,'workflow.assign',current.id,{assignedTo:input.data.assignedTo});
    return updated.rows[0];
  });
  if(!row) return res.status(404).json({error:'Workflow action not found'});
  res.json(row);
});

router.post('/workflows/:id/approve', async (req:AuthedRequest,res)=>idempotent(req,res,`workflow.approve:${req.params.id}`,async()=>{
  const auth=ctx(req);
  const input=z.object({reason:z.string().max(500).optional(),expectedVersion:z.number().int().positive().optional()}).safeParse(req.body);
  if(!input.success) return {status:400,body:{error:input.error.flatten()}};
  const row=await withTransaction(async client=>{
    const existing=await client.query(`SELECT * FROM workflow_actions WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[req.params.id,auth.organizationId]);
    if(!existing.rowCount) return {kind:'not_found'} as const;
    const current=existing.rows[0];
    if(input.data.expectedVersion && Number(current.version)!==input.data.expectedVersion) return {kind:'version_conflict',version:current.version} as const;
    if(!canApprove(auth.role,current.action_type)) return {kind:'forbidden'} as const;
    if(current.requested_by===auth.userId) return {kind:'self_approval'} as const;
    if(current.policy_state==='blocked') return {kind:'blocked',reasons:current.policy_reasons} as const;
    if(['approved','executed'].includes(current.status)) return {kind:'ok',value:current,replayed:true} as const;
    if(['rejected','cancelled'].includes(current.status)) return {kind:'invalid_state',status:current.status} as const;
    const updated=await client.query(`UPDATE workflow_actions SET status='approved',approved_by=$1,approved_at=now() WHERE id=$2 AND organization_id=$3 RETURNING *`,[auth.userId,current.id,auth.organizationId]);
    await event(client,auth,current.id,'approved',current.status,'approved',input.data.reason,{});
    await audit(client,auth,'workflow.approve',current.id,{amount:current.amount,actionType:current.action_type});
    return {kind:'ok',value:updated.rows[0],replayed:false} as const;
  });
  if(row.kind==='not_found') return {status:404,body:{error:'Workflow action not found'}};
  if(row.kind==='version_conflict') return {status:409,body:{error:'Workflow action changed since you opened it',currentVersion:row.version}};
  if(row.kind==='forbidden') return {status:403,body:{error:'Your role cannot approve this workflow action'}};
  if(row.kind==='self_approval') return {status:409,body:{error:'Segregation of duties prevents approving your own request'}};
  if(row.kind==='blocked') return {status:409,body:{error:'Policy blocks this approval',reasons:row.reasons}};
  if(row.kind==='invalid_state') return {status:409,body:{error:`Workflow action is already ${row.status}`}};
  return {status:200,body:{...row.value,idempotentReplay:row.replayed}};
}));

router.post('/workflows/:id/reject', async (req:AuthedRequest,res)=>idempotent(req,res,`workflow.reject:${req.params.id}`,async()=>{
  const auth=ctx(req);
  const input=z.object({reason:z.string().min(3).max(500),expectedVersion:z.number().int().positive().optional()}).safeParse(req.body);
  if(!input.success) return {status:400,body:{error:input.error.flatten()}};
  const row=await withTransaction(async client=>{
    const existing=await client.query(`SELECT * FROM workflow_actions WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[req.params.id,auth.organizationId]);
    if(!existing.rowCount) return null;
    const current=existing.rows[0];
    if(input.data.expectedVersion && Number(current.version)!==input.data.expectedVersion) throw Object.assign(new Error('Workflow action changed since you opened it'),{status:409});
    if(!canApprove(auth.role,current.action_type)) throw Object.assign(new Error('Your role cannot reject this workflow action'),{status:403});
    if(['executed','cancelled'].includes(current.status)) throw Object.assign(new Error(`Workflow action is already ${current.status}`),{status:409});
    const updated=await client.query(`UPDATE workflow_actions SET status='rejected',rejected_by=$1,rejected_at=now() WHERE id=$2 AND organization_id=$3 RETURNING *`,[auth.userId,current.id,auth.organizationId]);
    await event(client,auth,current.id,'rejected',current.status,'rejected',input.data.reason,{});
    await audit(client,auth,'workflow.reject',current.id,{reason:input.data.reason});
    return updated.rows[0];
  });
  if(!row) return {status:404,body:{error:'Workflow action not found'}};
  return {status:200,body:row};
}));

router.post('/workflows/:id/execute', async (req:AuthedRequest,res)=>idempotent(req,res,`workflow.execute:${req.params.id}`,async()=>{
  const auth=ctx(req);
  if(!hasPermission(auth.role,'workflow.execute')) return {status:403,body:{error:'Your role cannot execute controlled workflow actions'}};
  const row=await withTransaction(async client=>{
    const existing=await client.query(`SELECT * FROM workflow_actions WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[req.params.id,auth.organizationId]);
    if(!existing.rowCount) return null;
    const current=existing.rows[0];
    if(current.status==='executed') return current;
    if(current.status!=='approved') throw Object.assign(new Error('Only approved workflow actions can be executed'),{status:409});
    if(FINANCIAL_ACTIONS.has(current.action_type)&&!hasPermission(auth.role,'finance.write'))throw Object.assign(new Error('Financial execution permission is required'),{status:403});
    const updated=await client.query(`UPDATE workflow_actions SET status='executed',executed_at=now() WHERE id=$1 AND organization_id=$2 RETURNING *`,[current.id,auth.organizationId]);
    await event(client,auth,current.id,'executed','approved','executed',undefined,{actionType:current.action_type});
    await audit(client,auth,'workflow.execute',current.id,{amount:current.amount,actionType:current.action_type});
    return updated.rows[0];
  });
  if(!row) return {status:404,body:{error:'Workflow action not found'}};
  return {status:200,body:row};
}));

router.get('/workflows/:id/events', async (req:AuthedRequest,res)=>{
  const auth=ctx(req);
  if(!hasPermission(auth.role,'workflow.approve')&&!hasPermission(auth.role,'workflow.execute'))return res.status(403).json({error:'Workflow access is not permitted for this role'});
  const result=await query(`SELECT e.*,u.first_name||' '||u.last_name actor_name FROM workflow_action_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.workflow_action_id=$1 AND e.organization_id=$2 ORDER BY e.created_at DESC`,[req.params.id,auth.organizationId]);
  res.json(result.rows);
});

export default router;

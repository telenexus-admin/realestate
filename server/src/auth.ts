import { NextFunction, Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { query, withTransaction } from './db.js';

export type AuthUser = {
  userId:string;
  organizationId:string;
  role:string;
  sessionId:string;
  propertyScope:string[];
};
export type AuthedRequest = Request & { auth?:AuthUser };

const router=Router();
const JWT_SECRET=process.env.JWT_SECRET || 'development-secret';
const ACCESS_TOKEN_MINUTES=Number(process.env.ACCESS_TOKEN_MINUTES || 15);
const REFRESH_TOKEN_DAYS=Number(process.env.REFRESH_TOKEN_DAYS || 30);
const COOKIE_NAME=process.env.REFRESH_COOKIE_NAME || 'propos_refresh';
const COOKIE_SECURE=process.env.NODE_ENV==='production';
const loginWindows=new Map<string,{count:number;resetAt:number}>();

if(process.env.NODE_ENV==='production' && JWT_SECRET==='development-secret'){
  throw new Error('JWT_SECRET must be configured in production');
}

function clientIp(req:Request){
  const forwarded=req.headers['x-forwarded-for'];
  const raw=Array.isArray(forwarded)?forwarded[0]:forwarded?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  return raw.replace(/^::ffff:/,'') || null;
}

function parseCookies(req:Request){
  const result:Record<string,string>={};
  const raw=req.headers.cookie;
  if(!raw)return result;
  for(const part of raw.split(';')){
    const idx=part.indexOf('=');
    if(idx<0)continue;
    result[decodeURIComponent(part.slice(0,idx).trim())]=decodeURIComponent(part.slice(idx+1).trim());
  }
  return result;
}

function refreshHash(token:string){return createHash('sha256').update(token).digest('hex');}
function makeRefreshToken(){return randomBytes(48).toString('base64url');}
function cookieValue(token:string,maxAgeSeconds:number){
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/api/auth; SameSite=Lax; Max-Age=${maxAgeSeconds}${COOKIE_SECURE?'; Secure':''}`;
}
function clearCookie(){return `${COOKIE_NAME}=; HttpOnly; Path=/api/auth; SameSite=Lax; Max-Age=0${COOKIE_SECURE?'; Secure':''}`;}

function issueAccessToken(userId:string,organizationId:string,sessionId:string){
  return jwt.sign({userId,organizationId,sessionId},JWT_SECRET,{expiresIn:`${ACCESS_TOKEN_MINUTES}m`,issuer:'polyizon',audience:'propos-api'});
}

function verifyPassword(password:string,encoded:string){
  const [scheme,iterationsRaw,saltRaw,hashRaw]=encoded.split('$');
  if(scheme!=='pbkdf2'||!iterationsRaw||!saltRaw||!hashRaw)return false;
  const iterations=Number(iterationsRaw);
  if(!Number.isFinite(iterations)||iterations<100000)return false;
  const salt=Buffer.from(saltRaw,'base64url');
  const expected=Buffer.from(hashRaw,'base64url');
  const actual=pbkdf2Sync(password,salt,iterations,expected.length,'sha256');
  return actual.length===expected.length && timingSafeEqual(actual,expected);
}

export function hashPassword(password:string){
  const iterations=210000;
  const salt=randomBytes(18);
  const hash=pbkdf2Sync(password,salt,iterations,32,'sha256');
  return `pbkdf2$${iterations}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

async function audit(userId:string|null,organizationId:string|null,action:string,metadata:Record<string,unknown>={}){
  await query(`INSERT INTO audit_logs(organization_id,user_id,action,entity_type,metadata) VALUES($1,$2,$3,'auth',$4::jsonb)`,[organizationId,userId,action,JSON.stringify(metadata)]);
}

async function recordAttempt(email:string,organizationSlug:string|undefined,req:Request,successful:boolean,reason:string){
  await query(`INSERT INTO login_attempts(email,organization_slug,ip,successful,reason) VALUES($1,$2,$3::inet,$4,$5)`,[email.toLowerCase(),organizationSlug||null,clientIp(req),successful,reason]).catch(()=>undefined);
}

function rateLimited(key:string,limit=10,windowMs=15*60*1000){
  const now=Date.now();
  const current=loginWindows.get(key);
  if(!current||current.resetAt<=now){loginWindows.set(key,{count:1,resetAt:now+windowMs});return false;}
  current.count+=1;
  return current.count>limit;
}

async function createSession(req:Request,res:Response,user:{id:string;organizationId:string}){
  const refreshToken=makeRefreshToken();
  const sessionId=randomUUID();
  const familyId=sessionId;
  const expiresAt=new Date(Date.now()+REFRESH_TOKEN_DAYS*86400000);
  await query(`INSERT INTO auth_sessions(id,family_id,organization_id,user_id,refresh_token_hash,user_agent,ip,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::inet,$8)`,[sessionId,familyId,user.organizationId,user.id,refreshHash(refreshToken),req.get('user-agent')||null,clientIp(req),expiresAt]);
  res.setHeader('Set-Cookie',cookieValue(refreshToken,REFRESH_TOKEN_DAYS*86400));
  return {token:issueAccessToken(user.id,user.organizationId,sessionId),sessionId};
}

export async function auth(req:AuthedRequest,res:Response,next:NextFunction){
  const bearer=req.headers.authorization;
  if(!bearer?.startsWith('Bearer '))return res.status(401).json({error:'Authentication required'});
  try{
    const decoded=jwt.verify(bearer.slice(7),JWT_SECRET,{issuer:'polyizon',audience:'propos-api'}) as {userId?:string;organizationId?:string;sessionId?:string};
    if(!decoded.userId||!decoded.organizationId||!decoded.sessionId) return res.status(401).json({error:'Invalid session token'});
    const session=await query<{role:string;property_scope:string[]|null}>(`SELECT ou.role,ou.property_scope
      FROM auth_sessions s
      JOIN users u ON u.id=s.user_id
      JOIN organizations o ON o.id=s.organization_id
      JOIN organization_users ou ON ou.user_id=s.user_id AND ou.organization_id=s.organization_id
      WHERE s.id=$1 AND s.user_id=$2 AND s.organization_id=$3 AND s.revoked_at IS NULL AND s.expires_at>now()
        AND u.status='active' AND o.status IN ('trial','active')`,[decoded.sessionId,decoded.userId,decoded.organizationId]);
    if(!session.rowCount)return res.status(401).json({error:'Session expired or revoked'});
    req.auth={userId:decoded.userId,organizationId:decoded.organizationId,sessionId:decoded.sessionId,role:session.rows[0].role,propertyScope:session.rows[0].property_scope||[]};
    void query(`UPDATE auth_sessions SET last_seen_at=now() WHERE id=$1`,[decoded.sessionId]);
    next();
  }catch{
    res.status(401).json({error:'Invalid or expired token'});
  }
}

const permissionMatrix:Record<string,Set<string>>={
  owner:new Set(['*']),admin:new Set(['*']),
  accountant:new Set(['finance.read','finance.write','reports.read','workflow.approve','workflow.execute']),
  property_manager:new Set(['portfolio.read','property.write','tenant.write','lease.write','maintenance.write','reports.read','workflow.approve']),
  leasing_agent:new Set(['portfolio.read','tenant.write','lease.write']),
  caretaker:new Set(['portfolio.read','maintenance.write']),
  maintenance:new Set(['portfolio.read','maintenance.write']),
  auditor:new Set(['portfolio.read','finance.read','reports.read','audit.read']),
};

export function hasPermission(role:string,permission:string){const set=permissionMatrix[role];return !!set&&(set.has('*')||set.has(permission));}
export function requirePermission(permission:string){return (req:AuthedRequest,res:Response,next:NextFunction)=>{
  if(!req.auth||!hasPermission(req.auth.role,permission))return res.status(403).json({error:`Permission required: ${permission}`});
  next();
};}

router.post('/login',async(req,res)=>{
  const input=z.object({email:z.string().email(),password:z.string().min(8).max(200),organizationSlug:z.string().min(1).max(80)}).safeParse(req.body);
  if(!input.success)return res.status(400).json({error:input.error.flatten()});
  const {email,password,organizationSlug}=input.data;
  const ipKey=`ip:${clientIp(req)||'unknown'}`,emailKey=`email:${email.toLowerCase()}`;
  if(rateLimited(ipKey)||rateLimited(emailKey,6)){
    await recordAttempt(email,organizationSlug,req,false,'rate_limited');
    return res.status(429).json({error:'Too many login attempts. Try again later.'});
  }
  const found=await query<{id:string;password_hash:string;first_name:string;last_name:string;status:string;locked_until:Date|null;failed_login_count:number;organization_id:string;organization_name:string;organization_status:string;role:string}>(`
    SELECT u.id,u.password_hash,u.first_name,u.last_name,u.status,u.locked_until,u.failed_login_count,
      o.id organization_id,o.name organization_name,o.status organization_status,ou.role
    FROM users u JOIN organization_users ou ON ou.user_id=u.id JOIN organizations o ON o.id=ou.organization_id
    WHERE lower(u.email)=lower($1) AND o.slug=$2 LIMIT 1`,[email,organizationSlug]);
  const row=found.rows[0];
  if(!row||row.status!=='active'||!['trial','active'].includes(row.organization_status)){
    await recordAttempt(email,organizationSlug,req,false,'invalid_credentials');
    return res.status(401).json({error:'Invalid email, password or workspace'});
  }
  if(row.locked_until && new Date(row.locked_until).getTime()>Date.now()){
    await recordAttempt(email,organizationSlug,req,false,'account_locked');
    return res.status(423).json({error:'Account temporarily locked after repeated failed sign-in attempts'});
  }
  if(!verifyPassword(password,row.password_hash)){
    const nextFailures=Number(row.failed_login_count||0)+1;
    await query(`UPDATE users SET failed_login_count=$1,locked_until=CASE WHEN $1>=5 THEN now()+interval '15 minutes' ELSE locked_until END WHERE id=$2`,[nextFailures,row.id]);
    await recordAttempt(email,organizationSlug,req,false,'invalid_credentials');
    return res.status(401).json({error:'Invalid email, password or workspace'});
  }
  await query(`UPDATE users SET failed_login_count=0,locked_until=NULL,last_login_at=now() WHERE id=$1`,[row.id]);
  const session=await createSession(req,res,{id:row.id,organizationId:row.organization_id});
  await recordAttempt(email,organizationSlug,req,true,'success');
  await audit(row.id,row.organization_id,'auth.login',{sessionId:session.sessionId});
  res.json({token:session.token,user:{id:row.id,name:`${row.first_name} ${row.last_name}`,role:row.role},organization:{id:row.organization_id,name:row.organization_name}});
});

router.post('/refresh',async(req,res)=>{
  const raw=parseCookies(req)[COOKIE_NAME];
  if(!raw)return res.status(401).json({error:'Refresh session required'});
  const tokenHash=refreshHash(raw);
  const result=await withTransaction(async client=>{
    const found=await client.query(`SELECT s.*,u.status user_status,o.status organization_status,ou.role,u.first_name,u.last_name,o.name organization_name
      FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN organizations o ON o.id=s.organization_id
      JOIN organization_users ou ON ou.user_id=s.user_id AND ou.organization_id=s.organization_id
      WHERE s.refresh_token_hash=$1 FOR UPDATE`,[tokenHash]);
    if(!found.rowCount)return {kind:'invalid'} as const;
    const current=found.rows[0];
    if(current.revoked_at){
      await client.query(`UPDATE auth_sessions SET revoked_at=coalesce(revoked_at,now()),revoked_reason=coalesce(revoked_reason,'refresh_reuse_detected') WHERE family_id=$1`,[current.family_id]);
      return {kind:'reuse'} as const;
    }
    if(new Date(current.expires_at).getTime()<=Date.now()||current.user_status!=='active'||!['trial','active'].includes(current.organization_status))return {kind:'invalid'} as const;
    const nextToken=makeRefreshToken(),nextId=randomUUID(),nextExpiry=new Date(Date.now()+REFRESH_TOKEN_DAYS*86400000);
    await client.query(`UPDATE auth_sessions SET revoked_at=now(),revoked_reason='rotated',last_seen_at=now() WHERE id=$1`,[current.id]);
    await client.query(`INSERT INTO auth_sessions(id,family_id,organization_id,user_id,refresh_token_hash,rotated_from_id,user_agent,ip,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::inet,$9)`,[nextId,current.family_id,current.organization_id,current.user_id,refreshHash(nextToken),current.id,req.get('user-agent')||null,clientIp(req),nextExpiry]);
    return {kind:'ok',nextToken,nextId,current} as const;
  });
  if(result.kind!=='ok'){
    res.setHeader('Set-Cookie',clearCookie());
    return res.status(401).json({error:result.kind==='reuse'?'Refresh token reuse detected; session family revoked':'Refresh session expired or invalid'});
  }
  res.setHeader('Set-Cookie',cookieValue(result.nextToken,REFRESH_TOKEN_DAYS*86400));
  await audit(result.current.user_id,result.current.organization_id,'auth.refresh',{sessionId:result.nextId});
  res.json({token:issueAccessToken(result.current.user_id,result.current.organization_id,result.nextId),user:{id:result.current.user_id,name:`${result.current.first_name} ${result.current.last_name}`,role:result.current.role},organization:{id:result.current.organization_id,name:result.current.organization_name}});
});

router.post('/logout',async(req,res)=>{
  const raw=parseCookies(req)[COOKIE_NAME];
  if(raw)await query(`UPDATE auth_sessions SET revoked_at=coalesce(revoked_at,now()),revoked_reason=coalesce(revoked_reason,'logout') WHERE refresh_token_hash=$1`,[refreshHash(raw)]);
  res.setHeader('Set-Cookie',clearCookie());
  res.status(204).send();
});

router.get('/sessions',auth,async(req:AuthedRequest,res)=>{
  const a=req.auth!;
  const sessions=await query(`SELECT id,user_agent,ip,created_at,last_seen_at,expires_at,CASE WHEN id=$3 THEN true ELSE false END current
    FROM auth_sessions WHERE user_id=$1 AND organization_id=$2 AND revoked_at IS NULL AND expires_at>now() ORDER BY last_seen_at DESC`,[a.userId,a.organizationId,a.sessionId]);
  res.json(sessions.rows);
});

router.delete('/sessions/:id',auth,async(req:AuthedRequest,res)=>{
  const a=req.auth!;
  const result=await query(`UPDATE auth_sessions SET revoked_at=now(),revoked_reason='user_revoked' WHERE id=$1 AND user_id=$2 AND organization_id=$3 AND revoked_at IS NULL RETURNING id`,[req.params.id,a.userId,a.organizationId]);
  if(!result.rowCount)return res.status(404).json({error:'Active session not found'});
  await audit(a.userId,a.organizationId,'auth.session_revoke',{sessionId:req.params.id});
  if(req.params.id===a.sessionId)res.setHeader('Set-Cookie',clearCookie());
  res.status(204).send();
});

router.post('/logout-all',auth,async(req:AuthedRequest,res)=>{
  const a=req.auth!;
  await query(`UPDATE auth_sessions SET revoked_at=coalesce(revoked_at,now()),revoked_reason=coalesce(revoked_reason,'logout_all') WHERE user_id=$1 AND organization_id=$2 AND revoked_at IS NULL`,[a.userId,a.organizationId]);
  await audit(a.userId,a.organizationId,'auth.logout_all',{});
  res.setHeader('Set-Cookie',clearCookie());
  res.status(204).send();
});

router.post('/dev-login',async(req,res)=>{
  if(process.env.NODE_ENV==='production')return res.status(404).json({error:'Not found'});
  const input=z.object({email:z.string().email(),organizationSlug:z.string().min(1)}).safeParse(req.body);
  if(!input.success)return res.status(400).json({error:input.error.flatten()});
  const found=await query<{user_id:string;organization_id:string;role:string;first_name:string;last_name:string;organization_name:string}>(`
    SELECT u.id user_id,ou.organization_id,ou.role,u.first_name,u.last_name,o.name organization_name
    FROM users u JOIN organization_users ou ON ou.user_id=u.id JOIN organizations o ON o.id=ou.organization_id
    WHERE lower(u.email)=lower($1) AND o.slug=$2 AND u.status='active' AND o.status IN ('trial','active') LIMIT 1`,[input.data.email,input.data.organizationSlug]);
  if(!found.rowCount)return res.status(404).json({error:'User or organization not found'});
  const row=found.rows[0],session=await createSession(req,res,{id:row.user_id,organizationId:row.organization_id});
  res.json({token:session.token,user:{id:row.user_id,name:`${row.first_name} ${row.last_name}`,role:row.role},organization:{id:row.organization_id,name:row.organization_name}});
});

export default router;

import jwt from 'jsonwebtoken';
import { pool, query } from './db.js';

async function main(){
  const session=await query<any>(`SELECT s.id session_id,s.user_id,s.organization_id FROM auth_sessions s JOIN organization_users ou ON ou.organization_id=s.organization_id AND ou.user_id=s.user_id WHERE s.revoked_at IS NULL AND s.expires_at>now() AND ou.role IN ('owner','admin') ORDER BY s.last_seen_at DESC LIMIT 1`);
  if(!session.rowCount)throw new Error('No active owner or admin session is available for the SMS smoke test');
  const row=session.rows[0],token=jwt.sign({userId:row.user_id,organizationId:row.organization_id,sessionId:row.session_id},process.env.JWT_SECRET!,{expiresIn:'2m',issuer:'polyizon',audience:'propos-api'});
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const settings=await fetch('http://127.0.0.1:4010/api/sms/settings',{headers}),body=await settings.json() as any;
  if(settings.status!==200)throw new Error(`SMS settings returned ${settings.status}`);
  if('api_key_ciphertext' in body||'apiKey' in body||'api_key' in body)throw new Error('SMS settings leaked a credential');
  const invalid=await fetch('http://127.0.0.1:4010/api/sms/settings',{method:'PUT',headers,body:JSON.stringify({provider:'unsupported',apiKey:'x',senderId:'TEST',partnerId:'',enabled:true})});
  if(invalid.status!==400)throw new Error(`Invalid SMS provider returned ${invalid.status}`);
  console.log(`SMS smoke passed: safe settings response, protected route, provider validation (${body.provider}).`);
}

main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>pool.end());

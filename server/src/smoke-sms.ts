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
  const [recipients,templates,history]=await Promise.all([
    fetch('http://127.0.0.1:4010/api/communication/recipients?audience=all',{headers}),
    fetch('http://127.0.0.1:4010/api/communication/templates',{headers}),
    fetch('http://127.0.0.1:4010/api/communication/history',{headers}),
  ]);
  if(recipients.status!==200||templates.status!==200||history.status!==200)throw new Error(`Communication routes returned ${recipients.status}/${templates.status}/${history.status}`);
  const recipientBody=await recipients.json() as any;
  if(!Array.isArray(recipientBody.recipients)||typeof recipientBody.count!=='number')throw new Error('Communication recipient preview returned an invalid response');
  const created=await fetch('http://127.0.0.1:4010/api/communication/templates',{method:'POST',headers,body:JSON.stringify({name:'Smoke test template',message:'Hello {{name}}, this is a temporary test template.',category:'general'})});
  if(created.status!==201)throw new Error(`Communication template creation returned ${created.status}`);
  const createdBody=await created.json() as any;
  const removed=await fetch(`http://127.0.0.1:4010/api/communication/templates/${createdBody.id}`,{method:'DELETE',headers});
  if(removed.status!==204)throw new Error(`Communication template deletion returned ${removed.status}`);
  await query(`DELETE FROM communication_templates WHERE id=$1 AND organization_id=$2`,[createdBody.id,row.organization_id]);
  console.log(`SMS smoke passed: safe settings, provider validation, recipient preview, delivery history, and template create/delete (${body.provider}; ${recipientBody.count} recipients).`);
}

main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>pool.end());

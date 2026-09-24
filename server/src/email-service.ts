import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { query } from './db.js';

let working=false;
const storageRoot=()=>resolve(process.env.DOCUMENT_STORAGE_ROOT||'/opt/realestate/uploads');

function cleanError(error:unknown){return (error instanceof Error?error.message:String(error)).slice(0,900);}

async function sendJob(job:any){
  const apiKey=process.env.RESEND_API_KEY;
  if(!apiKey)throw new Error('Outgoing email is not configured');
  const docs=job.attachment_document_ids?.length?await query<any>(`SELECT id,file_name,storage_key,mime_type FROM documents WHERE organization_id=$1 AND id=ANY($2::uuid[])`,[job.organization_id,job.attachment_document_ids]):{rows:[]};
  const attachments=[];
  for(const item of docs.rows){
    const file=resolve(storageRoot(),item.storage_key);
    if(!file.startsWith(`${storageRoot()}/`)&&!file.startsWith(`${storageRoot()}\\`))continue;
    attachments.push({filename:item.file_name,content:(await readFile(file)).toString('base64'),content_type:item.mime_type||'application/octet-stream'});
  }
  const configuredFrom=process.env.PROPOS_EMAIL_FROM||'PropOS by Polyizon <no-reply@billing.polyizon.tech>',address=configuredFrom.match(/<([^>]+)>/)?.[1]||configuredFrom;
  const sender=String(job.sender_name||'PropOS by Polyizon').replace(/[<>\r\n]/g,'').trim();
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
    from:`${sender} <${address}>`,
    to:[job.recipient],reply_to:job.reply_to_email||undefined,subject:job.subject,html:job.html_body,text:job.text_body,attachments
  })});
  const body=await response.json().catch(()=>({})) as any;
  if(!response.ok)throw new Error(body?.message||`Email provider rejected the request (${response.status})`);
  return String(body.id||'sent');
}

export async function processEmailJobs(){
  if(working)return;working=true;
  try{
    const jobs=await query<any>(`UPDATE email_jobs SET status='sending',attempts=attempts+1,updated_at=now() WHERE id IN (SELECT id FROM email_jobs WHERE status IN ('queued','failed') AND next_attempt_at<=now() AND attempts<5 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 5) RETURNING *`);
    for(const job of jobs.rows){
      try{
        const providerId=await sendJob(job);
        await query(`UPDATE email_jobs SET status='sent',provider_message_id=$1,sent_at=now(),last_error=NULL,updated_at=now() WHERE id=$2`,[providerId,job.id]);
      }catch(error){
        const delay=Math.min(3600,60*Math.pow(2,Math.max(0,Number(job.attempts)-1)));
        await query(`UPDATE email_jobs SET status='failed',last_error=$1,next_attempt_at=now()+($2||' seconds')::interval,updated_at=now() WHERE id=$3`,[cleanError(error),String(delay),job.id]);
      }
    }
  }finally{working=false;}
}

export function startEmailWorker(){
  const timer=setInterval(()=>void processEmailJobs().catch(console.error),60_000);timer.unref();
  setTimeout(()=>void processEmailJobs().catch(console.error),2_000).unref();
}

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { query } from './db.js';

export const SMS_PROVIDERS=['blessed_text','savvy','talksasa'] as const;
export type SmsProvider=typeof SMS_PROVIDERS[number];
type SmsConfig={provider:SmsProvider;apiKey:string;senderId:string;partnerId?:string|null};

const BLESSED_URL='https://sms.blessedtexts.com/api/sms/v1/sendsms';
const SAVVY_URL='https://sms.savvybulksms.com/api/services/sendsms/';
const TALKSASA_URL='https://api.talksasa.com/v1/sms/send';
const keyMaterial=process.env.MFA_ENCRYPTION_KEY||process.env.JWT_SECRET||'development-secret';
const encryptionKey=createHash('sha256').update(`${keyMaterial}:organization-sms`).digest();

export function encryptSmsSecret(secret:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey,iv);
  const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]),tag=cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptSmsSecret(payload:string){
  const [version,ivRaw,tagRaw,dataRaw]=payload.split('.');
  if(version!=='v1'||!ivRaw||!tagRaw||!dataRaw)throw new Error('Invalid encrypted SMS credential');
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey,Buffer.from(ivRaw,'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw,'base64url')),decipher.final()]).toString('utf8');
}

export function normalizeSmsPhone(value:string){
  let phone=String(value||'').replace(/\D/g,'');
  if(phone.startsWith('0'))phone=`254${phone.slice(1)}`;
  else if((phone.startsWith('7')||phone.startsWith('1'))&&phone.length===9)phone=`254${phone}`;
  if(phone.length<10||phone.length>15)throw new Error('Enter a valid phone number with country code');
  return phone;
}

export async function organizationSmsConfig(organizationId:string):Promise<SmsConfig>{
  const found=await query<any>(`SELECT provider,api_key_ciphertext,sender_id,partner_id,enabled FROM organization_sms_settings WHERE organization_id=$1`,[organizationId]);
  if(!found.rowCount||!found.rows[0].enabled)throw Object.assign(new Error('Configure SMS in Settings before sending tenant messages'),{status:409});
  const row=found.rows[0];
  return {provider:row.provider,apiKey:decryptSmsSecret(row.api_key_ciphertext),senderId:row.sender_id,partnerId:row.partner_id};
}

function providerError(data:any){return String(data?.message||data?.error||data?.error_message||data?.description||'SMS provider rejected the message');}
async function postJson(url:string,body:unknown,headers:Record<string,string>={}){
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)});
  const raw=await response.text();let data:any={};try{data=raw?JSON.parse(raw):{};}catch{data={message:raw};}
  if(!response.ok)throw new Error(providerError(data)||`SMS provider returned ${response.status}`);
  return data;
}

async function deliver(config:SmsConfig,phone:string,message:string){
  if(config.provider==='savvy'){
    if(!config.partnerId)throw new Error('Savvy Partner ID is missing');
    const data=await postJson(SAVVY_URL,{apikey:config.apiKey,partnerID:config.partnerId,message,shortcode:config.senderId,mobile:phone});
    const responses=Array.isArray(data?.responses)?data.responses:[];
    const failed=responses.find((item:any)=>Number(item?.['respose-code']??item?.['response-code'])!==200);
    if(!responses.length)throw new Error('Savvy Bulk SMS returned an unexpected response');
    if(failed)throw new Error(failed['response-description']||'Savvy Bulk SMS rejected the message');
    return data;
  }
  if(config.provider==='talksasa'){
    const data=await postJson(TALKSASA_URL,{sender_id:config.senderId,sender:config.senderId,from:config.senderId,recipient:phone,phone,mobile:phone,to:phone,message},{Authorization:`Bearer ${config.apiKey}`});
    if(data?.success===false||data?.status===false||data?.ok===false||/fail|error|invalid|reject/i.test(String(data?.status||data?.code||'')))throw new Error(providerError(data));
    return data;
  }
  const data=await postJson(BLESSED_URL,{api_key:config.apiKey,sender_id:config.senderId,message,phone});
  if(data?.success===false||data?.status===false||/fail|error|invalid/i.test(String(data?.status||'')))throw new Error(providerError(data));
  if(data?.status_code!=null&&!['1000','1001','200','201'].includes(String(data.status_code)))throw new Error(providerError(data));
  return data;
}

export async function sendOrganizationSms(input:{organizationId:string;phone:string;message:string;tenantId?:string|null;invoiceId?:string|null;category?:string;sentBy?:string|null;config?:SmsConfig}){
  const message=input.message.trim();if(!message)throw new Error('SMS message is empty');
  const phone=normalizeSmsPhone(input.phone),config=input.config||await organizationSmsConfig(input.organizationId);
  try{
    const result=await deliver(config,phone,message);
    const providerId=String(result?.message_id||result?.id||result?.request_id||result?.responses?.[0]?.['message-id']||'').slice(0,240)||null;
    await query(`INSERT INTO sms_deliveries(organization_id,tenant_id,invoice_id,category,provider,recipient,message,status,provider_message_id,sent_by,sent_at) VALUES($1,$2,$3,$4,$5,$6,$7,'sent',$8,$9,now())`,[input.organizationId,input.tenantId||null,input.invoiceId||null,input.category||'tenant_message',config.provider,phone,message,providerId,input.sentBy||null]);
    return {provider:config.provider,recipient:phone,providerMessageId:providerId};
  }catch(error){
    const reason=(error instanceof Error?error.message:'SMS delivery failed').slice(0,900);
    await query(`INSERT INTO sms_deliveries(organization_id,tenant_id,invoice_id,category,provider,recipient,message,status,error,sent_by) VALUES($1,$2,$3,$4,$5,$6,$7,'failed',$8,$9)`,[input.organizationId,input.tenantId||null,input.invoiceId||null,input.category||'tenant_message',config.provider,phone,message,reason,input.sentBy||null]).catch(()=>undefined);
    throw new Error(reason);
  }
}

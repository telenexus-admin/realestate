import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const keyMaterial=process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET || 'development-secret';
const encryptionKey=createHash('sha256').update(keyMaterial).digest();

export function base32Encode(input:Buffer){
  let bits='';for(const byte of input)bits+=byte.toString(2).padStart(8,'0');
  let out='';for(let i=0;i<bits.length;i+=5){const chunk=bits.slice(i,i+5).padEnd(5,'0');out+=alphabet[parseInt(chunk,2)];}
  return out;
}
export function base32Decode(input:string){
  const clean=input.toUpperCase().replace(/[^A-Z2-7]/g,'');let bits='';
  for(const char of clean){const idx=alphabet.indexOf(char);if(idx<0)throw new Error('Invalid base32 secret');bits+=idx.toString(2).padStart(5,'0');}
  const bytes:number[]=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));
  return Buffer.from(bytes);
}

export function encryptSecret(secret:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey,iv);
  const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]),tag=cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}
export function decryptSecret(payload:string){
  const [version,ivRaw,tagRaw,dataRaw]=payload.split('.');if(version!=='v1'||!ivRaw||!tagRaw||!dataRaw)throw new Error('Invalid MFA secret payload');
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey,Buffer.from(ivRaw,'base64url'));decipher.setAuthTag(Buffer.from(tagRaw,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw,'base64url')),decipher.final()]).toString('utf8');
}

function hotp(secret:string,counter:number,digits=6){
  const key=base32Decode(secret),buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(counter));
  const digest=createHmac('sha1',key).update(buf).digest(),offset=digest[digest.length-1]&0xf;
  const code=((digest[offset]&0x7f)<<24)|((digest[offset+1]&0xff)<<16)|((digest[offset+2]&0xff)<<8)|(digest[offset+3]&0xff);
  return String(code%10**digits).padStart(digits,'0');
}
export function verifyTotp(secret:string,code:string,at=Date.now()){
  if(!/^\d{6}$/.test(code))return false;const counter=Math.floor(at/30000);
  for(const drift of [-1,0,1]){const candidate=hotp(secret,counter+drift);if(timingSafeEqual(Buffer.from(candidate),Buffer.from(code)))return true;}
  return false;
}

export function generateMfaSetup(accountLabel:string){
  const secret=base32Encode(randomBytes(20));
  const issuer='Polyizon PropOS';
  const uri=`otpauth://totp/${encodeURIComponent(`${issuer}:${accountLabel}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return {secret,encryptedSecret:encryptSecret(secret),otpauthUri:uri};
}

export function hashRecoveryCode(code:string){return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');}
export function generateRecoveryCodes(count=8){
  const codes=Array.from({length:count},()=>{
    const raw=randomBytes(6).toString('hex').toUpperCase();return `${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}`;
  });
  return {codes,hashes:codes.map(hashRecoveryCode)};
}

export function verifyMfaCredential(encryptedSecret:string|undefined|null,recoveryHashes:string[]|undefined|null,credential:string){
  const code=credential.trim().toUpperCase();
  if(encryptedSecret){
    try{const secret=decryptSecret(encryptedSecret);if(verifyTotp(secret,code))return {ok:true as const,recoveryHash:null};}catch{/* invalid encrypted state */}
  }
  const hash=hashRecoveryCode(code);const found=(recoveryHashes||[]).find(x=>x===hash);
  if(found)return {ok:true as const,recoveryHash:found};
  return {ok:false as const,recoveryHash:null};
}

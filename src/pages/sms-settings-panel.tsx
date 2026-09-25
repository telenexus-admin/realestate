import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, MessageSquareText, Send, Smartphone } from 'lucide-react';
import { api, type SmsSettings } from '../api';
import { Panel } from '../ui';
import './sms-settings-panel.css';

const providers=[
  {id:'blessed_text' as const,name:'Blessed Text',note:'API key + approved Sender ID'},
  {id:'savvy' as const,name:'Savvy Bulk SMS',note:'API key + Partner ID + Sender ID'},
  {id:'talksasa' as const,name:'Talk Sasa',note:'API token + approved Sender ID'},
];
const defaults:SmsSettings={provider:'blessed_text',sender_id:'',partner_id:'',enabled:false,configured_at:null,has_api_key:false};

export default function SmsSettingsPanel(){
  const [settings,setSettings]=useState<SmsSettings>(defaults),[apiKey,setApiKey]=useState(''),[testPhone,setTestPhone]=useState(''),[tenants,setTenants]=useState<any[]>([]),[audience,setAudience]=useState<'all'|'tenant'>('tenant'),[tenantId,setTenantId]=useState(''),[message,setMessage]=useState('Hello {{name}}, this is an update from your property manager.'),[busy,setBusy]=useState(''),[notice,setNotice]=useState<{type:'success'|'error';text:string}|null>(null);
  useEffect(()=>{Promise.all([api.smsSettings(),api.tenants()]).then(([sms,rows])=>{setSettings({...defaults,...sms});setTenants(rows);setTenantId(rows[0]?.id||'')}).catch(err=>setNotice({type:'error',text:err instanceof Error?err.message:'Could not load SMS settings'}))},[]);
  function choose(provider:SmsSettings['provider']){setSettings(current=>({...current,provider,partner_id:provider==='savvy'?current.partner_id:'',has_api_key:current.provider===provider&&current.has_api_key}));setApiKey('');setNotice(null)}
  async function save(event:FormEvent){event.preventDefault();setBusy('save');setNotice(null);try{const saved=await api.saveSmsSettings({provider:settings.provider,apiKey,senderId:settings.sender_id,partnerId:settings.partner_id||'',enabled:true});setSettings({...settings,...saved});setApiKey('');setNotice({type:'success',text:'SMS provider saved securely and is ready for tenant messages.'})}catch(err){setNotice({type:'error',text:err instanceof Error?err.message:'Could not save SMS settings'})}finally{setBusy('')}}
  async function test(){if(!testPhone.trim()){setNotice({type:'error',text:'Enter a phone number for the test SMS.'});return}setBusy('test');setNotice(null);try{const sent=await api.testSms(testPhone);setNotice({type:'success',text:`Test SMS sent to +${sent.recipient}.`})}catch(err){setNotice({type:'error',text:err instanceof Error?err.message:'Test SMS failed'})}finally{setBusy('')}}
  async function send(event:FormEvent){event.preventDefault();if(audience==='tenant'&&!tenantId){setNotice({type:'error',text:'Choose a tenant.'});return}setBusy('send');setNotice(null);try{const result=await api.sendTenantSms({audience,tenantId:audience==='tenant'?tenantId:undefined,message});setNotice({type:result.failed?'error':'success',text:`${result.sent} SMS message${result.sent===1?'':'s'} sent${result.failed?`; ${result.failed} failed`:'.'}`})}catch(err){setNotice({type:'error',text:err instanceof Error?err.message:'Could not send tenant SMS'})}finally{setBusy('')}}
  return <div className="sms-settings-stack">
    <Panel title="SMS configuration" kicker="Tenant communication">
      <form className="sms-config-form" onSubmit={save}>
        <div className="sms-config-intro"><div><MessageSquareText size={19}/><span><strong>Choose your SMS provider</strong><small>These credentials are encrypted and belong only to this property account.</small></span></div><em className={settings.has_api_key&&settings.enabled?'ready':''}>{settings.has_api_key&&settings.enabled?'Configured':'Not configured'}</em></div>
        <div className="sms-provider-grid">{providers.map(provider=><button type="button" key={provider.id} className={settings.provider===provider.id?'active':''} onClick={()=>choose(provider.id)}><strong>{provider.name}</strong><small>{provider.note}</small></button>)}</div>
        <div className="form-grid sms-fields"><label><span>{settings.provider==='talksasa'?'API token':'API key'}</span><div className="settings-password"><KeyRound size={15}/><input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder={settings.has_api_key?'Saved — enter only to replace':'Enter provider credential'} required={!settings.has_api_key}/></div></label><label><span>Sender ID / shortcode</span><input value={settings.sender_id} onChange={e=>setSettings(v=>({...v,sender_id:e.target.value}))} placeholder="Approved Sender ID" required/></label>{settings.provider==='savvy'&&<label className="full"><span>Partner ID</span><input value={settings.partner_id||''} onChange={e=>setSettings(v=>({...v,partner_id:e.target.value}))} placeholder="Savvy Partner ID" required/></label>}</div>
        <div className="sms-config-actions"><button className="primary-button" disabled={!!busy}>{busy==='save'?'Saving…':'Save SMS settings'}</button></div>
      </form>
      <div className="sms-test-row"><Smartphone size={17}/><input value={testPhone} onChange={e=>setTestPhone(e.target.value)} placeholder="2547XXXXXXXX"/><button type="button" className="secondary-button" onClick={()=>void test()} disabled={!!busy||!settings.has_api_key}>{busy==='test'?'Sending…':'Send test SMS'}</button></div>
      {notice&&<div className={`sms-feedback ${notice.type}`} role={notice.type==='error'?'alert':'status'}>{notice.type==='error'?<AlertTriangle size={16}/>:<CheckCircle2 size={16}/>}<span>{notice.text}</span></div>}
    </Panel>
    <Panel title="Message tenants" kicker="Reminders and updates">
      <form className="sms-message-form" onSubmit={send}><div className="sms-audience"><label><span>Send to</span><select value={audience} onChange={e=>setAudience(e.target.value as 'all'|'tenant')}><option value="tenant">One tenant</option><option value="all">All tenants with phone numbers</option></select></label>{audience==='tenant'&&<label><span>Tenant</span><select value={tenantId} onChange={e=>setTenantId(e.target.value)} required><option value="">Choose tenant</option>{tenants.map(tenant=><option key={tenant.id} value={tenant.id}>{tenant.first_name} {tenant.last_name}{tenant.unit_number?` · ${tenant.unit_number}`:''}</option>)}</select></label>}</div><label><span>Message</span><textarea rows={4} maxLength={480} value={message} onChange={e=>setMessage(e.target.value)} required/></label><div className="sms-template-row"><span>Use: {'{{name}}'} {'{{property}}'} {'{{unit}}'} {'{{balance}}'}</span><button className="primary-button" disabled={!!busy||!settings.has_api_key}><Send size={15}/>{busy==='send'?'Sending…':'Send SMS'}</button></div></form>
    </Panel>
  </div>;
}

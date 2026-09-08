import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, KeyRound, LockKeyhole, RefreshCcw, ShieldCheck, Smartphone, X } from 'lucide-react';
import { api, type MfaSetup, type MfaStatus } from './api';

export function SecurityEnrollmentCenter(){
  const [status,setStatus]=useState<MfaStatus|null>(null);
  const [setup,setSetup]=useState<MfaSetup|null>(null);
  const [code,setCode]=useState('');
  const [recoveryCodes,setRecoveryCodes]=useState<string[]>([]);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [disableOpen,setDisableOpen]=useState(false);
  const [password,setPassword]=useState('');
  const [disableCode,setDisableCode]=useState('');

  async function load(){
    setError('');
    try{setStatus(await api.mfaStatus())}catch(e){setStatus(null);setError(e instanceof Error?e.message:'Unable to load MFA status')}
  }
  useEffect(()=>{void load()},[]);

  async function start(){
    setBusy('setup');setError('');setMessage('');setRecoveryCodes([]);
    try{setSetup(await api.startMfaSetup())}catch(e){setError(e instanceof Error?e.message:'Unable to start MFA setup')}finally{setBusy('')}
  }
  async function enable(){
    if(!code.trim())return;
    setBusy('enable');setError('');
    try{
      const result=await api.enableMfa(code.trim());
      setRecoveryCodes(result.recoveryCodes);setSetup(null);setCode('');setMessage('Multi-factor authentication is now enforced for your account.');await load();
    }catch(e){setError(e instanceof Error?e.message:'Unable to enable MFA')}finally{setBusy('')}
  }
  async function disable(){
    setBusy('disable');setError('');
    try{await api.disableMfa(password,disableCode);setDisableOpen(false);setPassword('');setDisableCode('');setMessage('MFA disabled. Other device sessions were revoked.');await load();}
    catch(e){setError(e instanceof Error?e.message:'Unable to disable MFA')}finally{setBusy('')}
  }
  async function copy(value:string,label='Copied'){
    try{await navigator.clipboard.writeText(value);setMessage(label);window.setTimeout(()=>setMessage(''),1800)}catch{setError('Clipboard access is unavailable in this browser')}
  }

  return <section className="security-enrollment">
    <div className="security-enrollment-head"><div><span className="panel-kicker">ACCOUNT SECURITY</span><h3>Multi-factor authentication</h3><p>Add an authenticator-app challenge before PropOS creates a new session.</p></div>{status&&<span className={`security-state ${status.enabled?'enabled':'off'}`}><ShieldCheck size={13}/>{status.enabled?'Enforced':'Not enabled'}</span>}</div>
    {error&&<div className="security-inline-error"><AlertTriangle size={14}/><span>{error}</span></div>}
    {message&&<div className="security-inline-success"><CheckCircle2 size={14}/><span>{message}</span></div>}

    {!status&&<div className="security-unavailable"><LockKeyhole size={20}/><strong>Live security controls unavailable</strong><span>Sign in through the secure API session to manage MFA.</span><button className="secondary-button" onClick={()=>void load()}><RefreshCcw size={13}/> Retry</button></div>}

    {status&&!status.enabled&&!setup&&!recoveryCodes.length&&<div className="security-enable-card"><div className="security-device-icon"><Smartphone size={20}/></div><div><strong>Protect this account with an authenticator app</strong><p>PropOS supports standard 6-digit time-based codes. After enrollment, password-only sign-in will no longer create a session.</p><div className="security-facts"><span>30-second codes</span><span>Encrypted secret</span><span>Single-use recovery codes</span></div></div><button className="primary-button" onClick={()=>void start()} disabled={busy==='setup'}>{busy==='setup'?'Preparing…':'Set up MFA'}</button></div>}

    {setup&&<div className="mfa-setup-panel"><div className="mfa-setup-step"><i>1</i><div><strong>Add PropOS to your authenticator</strong><span>Use the manual secret below, or open the authenticator link on a compatible device.</span></div></div><div className="mfa-secret"><div><span>MANUAL SETUP KEY</span><strong>{setup.secret}</strong></div><button onClick={()=>void copy(setup.secret,'Setup key copied')}><Copy size={14}/></button></div><a className="mfa-open-link" href={setup.otpauthUri}><Smartphone size={13}/> Open in authenticator app</a><div className="mfa-setup-step"><i>2</i><div><strong>Verify the first code</strong><span>Enter the current 6-digit code to prove enrollment is working.</span></div></div><div className="mfa-code-row"><input value={code} onChange={e=>setCode(e.target.value.replace(/\s/g,''))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000"/><button className="primary-button" onClick={()=>void enable()} disabled={busy==='enable'||!code.trim()}>{busy==='enable'?'Verifying…':'Verify & enable'}</button><button className="secondary-button" onClick={()=>{setSetup(null);setCode('')}}>Cancel</button></div></div>}

    {recoveryCodes.length>0&&<div className="recovery-code-panel"><div className="recovery-head"><div><ShieldCheck size={18}/><div><strong>Save your recovery codes now</strong><span>Each code works once. PropOS will not display these plaintext codes again.</span></div></div><button onClick={()=>void copy(recoveryCodes.join('\n'),'Recovery codes copied')}><Copy size={13}/> Copy all</button></div><div className="recovery-grid">{recoveryCodes.map(c=><code key={c}>{c}</code>)}</div><button className="primary-button" onClick={()=>setRecoveryCodes([])}>I have saved these codes</button></div>}

    {status?.enabled&&!recoveryCodes.length&&<div className="mfa-enabled-panel"><div><CheckCircle2 size={20}/><p><strong>MFA is enforced</strong><span>New password sign-ins require an authenticator or recovery code. {status.recoveryCodesRemaining} recovery codes remain.</span></p></div><div className="mfa-enabled-actions"><button className="secondary-button" onClick={()=>void load()}><RefreshCcw size={13}/> Check status</button><button className="security-danger-button" onClick={()=>setDisableOpen(true)}>Disable MFA</button></div></div>}

    {disableOpen&&<div className="security-modal-scrim"><div className="security-modal"><div className="security-modal-head"><div><span className="panel-kicker">HIGH-RISK SECURITY CHANGE</span><h3>Disable MFA?</h3><p>Confirm with both your password and current authenticator or recovery code. Other device sessions will be revoked.</p></div><button onClick={()=>setDisableOpen(false)}><X size={16}/></button></div><label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label><span>Authenticator or recovery code</span><input value={disableCode} onChange={e=>setDisableCode(e.target.value.toUpperCase())} autoComplete="one-time-code"/></label><div className="security-modal-actions"><button className="secondary-button" onClick={()=>setDisableOpen(false)}>Cancel</button><button className="security-danger-button" disabled={busy==='disable'||!password||!disableCode} onClick={()=>void disable()}>{busy==='disable'?'Verifying…':'Disable MFA'}</button></div></div></div>}
  </section>;
}

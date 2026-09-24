import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import App from './App';
import OperatorDashboard from './pages/operator-dashboard';
import TenantPortal from './tenant-portal';
import { ApiError, api, getToken, type Session } from './api';

export default function AuthShell(){
  const operatorMode=window.location.pathname.startsWith('/operator');
  const allowDemo=import.meta.env.VITE_ALLOW_DEMO_MODE!=='false';
  const [mode,setMode]=useState<'checking'|'login'|'app'>('checking');
  const [session,setSession]=useState<Session|null>(null);
  const [email,setEmail]=useState(operatorMode?'admin@polyizon.tech':'');
  const [workspace,setWorkspace]=useState(operatorMode?'polyizon-propos':'');
  const [password,setPassword]=useState('');
  const [mfaRequired,setMfaRequired]=useState(false);
  const [mfaCode,setMfaCode]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    (async()=>{
      if(!getToken()){if(active)setMode('login');return;}
      const refreshed=await api.refreshSession();
      if(active){setSession(refreshed);setMode(refreshed?'app':'login');}
    })();
    return()=>{active=false};
  },[]);

  async function login(e:FormEvent){
    e.preventDefault();
    setBusy(true);setError('');
    try{
      const nextSession=await api.login(email,password,workspace,mfaRequired?mfaCode:undefined);
      setSession(nextSession);
      setMode('app');
    }catch(err){
      if(err instanceof ApiError && err.status===428 && err.data?.mfaRequired){setMfaRequired(true);setMfaCode('');setError('');}
      else setError(err instanceof Error?err.message:'Unable to sign in');
    }finally{setBusy(false);}
  }

  function resetMfa(){setMfaRequired(false);setMfaCode('');setError('')}

  if(mode==='checking')return <div className="auth-checking"><div className="auth-spinner"/><strong>Securing workspace…</strong><span>Restoring your PropOS session</span></div>;
  if(mode==='app')return operatorMode?<OperatorDashboard/>:session?.user.role==='tenant'?<TenantPortal session={session} onLogout={()=>{setSession(null);setMode('login')}}/>:<App/>;

  return <main className="auth-shell">
    <section className="auth-story">
      <div className="auth-brand"><div className="auth-brand-mark"><Building2 size={20}/></div><div><strong>Polyizon</strong><span>PropOS</span></div></div>
      <div className="auth-story-copy"><span className="auth-kicker"><Sparkles size={13}/> {operatorMode?'PLATFORM OPERATOR':'PROPERTY MANAGER'}</span><h1>{operatorMode?<>Set up companies.<br/>Keep access<br/>under control.</>:<>Properties, tenants<br/>and rent.<br/>All in one place.</>}</h1><p>{operatorMode?'A separate, protected area for onboarding PropOS accounts.':'A simple way to manage your properties every day.'}</p></div>
      <div className="auth-security-grid"><div><Building2 size={17}/><p><strong>Properties and units</strong><span>See occupied and vacant units quickly.</span></p></div><div><KeyRound size={17}/><p><strong>Tenants and leases</strong><span>Keep tenant details together.</span></p></div><div><ShieldCheck size={17}/><p><strong>Rent and repairs</strong><span>Track payments and repair requests.</span></p></div></div>
      <div className="auth-story-foot"><span><i/> Secure sign in</span><span>Nairobi</span></div>
    </section>

    <section className="auth-login-side"><form className="auth-card" onSubmit={login}>
      {!mfaRequired?<>
        <div className="auth-card-head"><span>{operatorMode?'OPERATOR SIGN IN':'SIGN IN'}</span><h2>Welcome back</h2><p>{operatorMode?'Enter your authorized operator account.':'Enter your company email and password.'}</p></div>
        {error&&<div className="auth-error">{error}</div>}
        <label><span>Work email</span><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
        <label><span>Company code</span><div className="auth-input-prefix"><Building2 size={15}/><input value={workspace} onChange={e=>setWorkspace(e.target.value)} required/></div><small>Your company's sign-in code.</small></label>
        <label><div className="auth-label-row"><span>Password</span><button type="button">Forgot password?</button></div><div className="auth-password"><LockKeyhole size={15}/><input type={showPassword?'text':'password'} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8}/><button type="button" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={15}/>:<Eye size={15}/>}</button></div></label>
      </>:<>
        <button type="button" className="auth-back" onClick={resetMfa}><ArrowLeft size={14}/> Back</button>
        <div className="auth-mfa-icon"><ShieldCheck size={22}/></div>
        <div className="auth-card-head auth-mfa-head"><span>SECOND FACTOR</span><h2>Verify it's you</h2><p>Enter the 6-digit code from your authenticator app, or use one of your recovery codes.</p></div>
        {error&&<div className="auth-error">{error}</div>}
        <label><span>Authentication code</span><div className="auth-input-prefix"><KeyRound size={15}/><input className="auth-mfa-input" autoFocus inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={e=>setMfaCode(e.target.value.toUpperCase())} placeholder="000000 or recovery code" required/></div><small>Authenticator codes refresh every 30 seconds. Recovery codes are single-use.</small></label>
        <div className="auth-mfa-account"><span>Signing in as</span><strong>{email}</strong><small>{workspace}</small></div>
      </>}
      <button className="auth-submit" disabled={busy||mfaRequired&&!mfaCode.trim()}>{busy?'Verifying…':mfaRequired?<>Verify & enter <ShieldCheck size={16}/></>:<>Enter workspace <ArrowRight size={16}/></>}</button>
      <div className="auth-trust"><CheckCircle2 size={14}/><span>{mfaRequired?'Password accepted. Enter your security code to continue.':'Your account is protected.'}</span></div>
      {allowDemo&&!mfaRequired&&<div className="auth-demo"><div><span>LOCAL DEMO</span><strong>Explore without an API session</strong><small>Demo UI only. Controlled backend actions remain disconnected.</small></div><button type="button" onClick={()=>setMode('app')}>Open demo workspace</button><code>Demo password: PropOS-Dev-2026!</code></div>}
    </form>
    <div className="auth-legal">Secure access for authorized users.</div>
  </section>
 </main>;
}

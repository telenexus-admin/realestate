import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Building2, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import App from './App';
import { api, getToken } from './api';

export default function AuthShell(){
  const allowDemo=import.meta.env.VITE_ALLOW_DEMO_MODE!=='false';
  const [mode,setMode]=useState<'checking'|'login'|'app'>('checking');
  const [email,setEmail]=useState('alex@alpha.test');
  const [workspace,setWorkspace]=useState('alpha-properties');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    (async()=>{
      if(!getToken()){if(active)setMode('login');return;}
      const refreshed=await api.refreshSession();
      if(active)setMode(refreshed?'app':'login');
    })();
    return()=>{active=false};
  },[]);

  async function login(e:FormEvent){
    e.preventDefault();
    setBusy(true);setError('');
    try{await api.login(email,password,workspace);setMode('app');}
    catch(err){setError(err instanceof Error?err.message:'Unable to sign in');}
    finally{setBusy(false);}
  }

  if(mode==='checking')return <div className="auth-checking"><div className="auth-spinner"/><strong>Securing workspace…</strong><span>Restoring your PropOS session</span></div>;
  if(mode==='app')return <App/>;

  return <main className="auth-shell">
    <section className="auth-story">
      <div className="auth-brand"><div className="auth-brand-mark"><Building2 size={20}/></div><div><strong>Polyizon</strong><span>PropOS</span></div></div>
      <div className="auth-story-copy"><span className="auth-kicker"><Sparkles size={13}/> PROPERTY OPERATING SYSTEM</span><h1>Run the portfolio.<br/>Control the money.<br/>Protect every decision.</h1><p>One operating layer for property operations, collections, accounting, leasing, maintenance and governance.</p></div>
      <div className="auth-security-grid"><div><ShieldCheck size={17}/><p><strong>Organization isolation</strong><span>Every session is bound to one workspace and validated on every API request.</span></p></div><div><KeyRound size={17}/><p><strong>Rotating sessions</strong><span>Short-lived access tokens with revocable, rotating refresh sessions.</span></p></div><div><LockKeyhole size={17}/><p><strong>Controlled actions</strong><span>Role permissions, segregation of duties and audit-backed approvals.</span></p></div></div>
      <div className="auth-story-foot"><span><i/> Security controls active</span><span>Africa/Nairobi</span></div>
    </section>

    <section className="auth-login-side"><form className="auth-card" onSubmit={login}>
      <div className="auth-card-head"><span>WELCOME BACK</span><h2>Sign in to PropOS</h2><p>Use your company workspace and account credentials.</p></div>
      {error&&<div className="auth-error">{error}</div>}
      <label><span>Work email</span><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
      <label><span>Workspace</span><div className="auth-input-prefix"><Building2 size={15}/><input value={workspace} onChange={e=>setWorkspace(e.target.value)} required/></div><small>Your organization's PropOS workspace slug.</small></label>
      <label><div className="auth-label-row"><span>Password</span><button type="button">Forgot password?</button></div><div className="auth-password"><LockKeyhole size={15}/><input type={showPassword?'text':'password'} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8}/><button type="button" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={15}/>:<Eye size={15}/>}</button></div></label>
      <button className="auth-submit" disabled={busy}>{busy?'Verifying…':<>Enter workspace <ArrowRight size={16}/></>}</button>
      <div className="auth-trust"><CheckCircle2 size={14}/><span>Protected by session rotation, rate limiting and account lockout controls.</span></div>
      {allowDemo&&<div className="auth-demo"><div><span>LOCAL DEMO</span><strong>Explore without an API session</strong><small>Demo UI only. Controlled backend actions remain disconnected.</small></div><button type="button" onClick={()=>setMode('app')}>Open demo workspace</button><code>Demo password: PropOS-Dev-2026!</code></div>}
    </form>
    <div className="auth-legal">By continuing, you agree to your organization's security and acceptable-use policies.</div>
  </section>
 </main>;
}

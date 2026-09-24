import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Check, ChevronRight, CircleAlert, LogOut, Plus, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';
import { ApiError, api, type OperatorOrganization, type OperatorSummary, type OrganizationOnboarding } from '../api';
import './operator-dashboard.css';

const emptyForm:OrganizationOnboarding={companyName:'',slug:'',companyEmail:'',companyPhone:'',plan:'starter',unitLimit:50,status:'trial',adminFirstName:'',adminLastName:'',adminEmail:'',adminPhone:'',temporaryPassword:''};

function friendlyDate(value:string){return new Intl.DateTimeFormat('en-KE',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value));}
function slugify(value:string){return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);}

export default function OperatorDashboard(){
  const [summary,setSummary]=useState<OperatorSummary|null>(null);
  const [organizations,setOrganizations]=useState<OperatorOrganization[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState<OrganizationOnboarding>(emptyForm);
  const [slugEdited,setSlugEdited]=useState(false);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{const [nextSummary,nextOrganizations]=await Promise.all([api.operatorSummary(),api.operatorOrganizations()]);setSummary(nextSummary);setOrganizations(nextOrganizations);}
    catch(err){setError(err instanceof ApiError&&err.status===403?'This account is not authorized to use the operator dashboard.':err instanceof Error?err.message:'Unable to load operator dashboard');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load()},[load]);

  const visible=useMemo(()=>organizations.filter(item=>`${item.name} ${item.slug} ${item.email||''}`.toLowerCase().includes(search.toLowerCase())),[organizations,search]);
  function update<K extends keyof OrganizationOnboarding>(key:K,value:OrganizationOnboarding[K]){setForm(current=>({...current,[key]:value}));}
  function companyName(value:string){setForm(current=>({...current,companyName:value,...(!slugEdited?{slug:slugify(value)}:{})}));}
  function closeForm(){if(saving)return;setShowForm(false);setForm(emptyForm);setSlugEdited(false);setError('');}

  async function submit(e:FormEvent){
    e.preventDefault();setSaving(true);setError('');setNotice('');
    try{const created=await api.onboardOrganization(form);setShowForm(false);setForm(emptyForm);setSlugEdited(false);setNotice(`${created.name} is ready. Company code: ${created.slug}`);await load();}
    catch(err){setError(err instanceof Error?err.message:'Unable to create company account');}
    finally{setSaving(false);}
  }

  async function changeStatus(item:OperatorOrganization,status:'trial'|'active'|'suspended'){
    const action=status==='suspended'?'suspend':'activate';
    if(!window.confirm(`${action[0].toUpperCase()+action.slice(1)} ${item.name}?`))return;
    setError('');
    try{await api.updateOrganizationStatus(item.id,status);setNotice(`${item.name} is now ${status}.`);await load();}
    catch(err){setError(err instanceof Error?err.message:'Unable to update company');}
  }
  async function logout(){await api.logout();window.location.assign('/operator');}

  return <div className="operator-shell">
    <aside className="operator-side">
      <div className="operator-brand"><span><Building2 size={20}/></span><div><strong>Polyizon</strong><small>PropOS operator</small></div></div>
      <nav><button className="active"><Building2 size={17}/> Companies</button></nav>
      <div className="operator-side-foot"><a href="/">Open client workspace <ChevronRight size={14}/></a><button onClick={()=>void logout()}><LogOut size={15}/> Sign out</button></div>
    </aside>
    <main className="operator-main">
      <header><div><span className="operator-eyebrow"><ShieldCheck size={14}/> Protected operator area</span><h1>Company accounts</h1><p>Onboard and manage PropOS workspaces.</p></div><button className="operator-primary" onClick={()=>{setError('');setShowForm(true)}}><Plus size={17}/> Add company</button></header>
      {notice&&<div className="operator-notice"><Check size={16}/>{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}
      {error&&<div className="operator-error"><CircleAlert size={17}/><span>{error}</span></div>}
      <section className="operator-stats">
        <article><span>Total companies</span><strong>{summary?.organizations??'—'}</strong><small>{summary?.active??0} active</small></article>
        <article><span>On trial</span><strong>{summary?.trial??'—'}</strong><small>14-day setup period</small></article>
        <article><span>People</span><strong>{summary?.users??'—'}</strong><small>Active user accounts</small></article>
        <article><span>Units managed</span><strong>{summary?.units??'—'}</strong><small>Across all companies</small></article>
      </section>
      <section className="operator-panel">
        <div className="operator-panel-head"><div><h2>All companies</h2><p>Real accounts only—no demo organizations.</p></div><div className="operator-tools"><label><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search company or code"/></label><button aria-label="Refresh" onClick={()=>void load()}><RefreshCw size={16} className={loading?'spin':''}/></button></div></div>
        <div className="operator-table-wrap"><table><thead><tr><th>Company</th><th>Plan</th><th>Usage</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>
          {visible.map(item=><tr key={item.id}><td><strong>{item.name}</strong><small>{item.slug}{item.email?` · ${item.email}`:''}</small></td><td><span className="operator-plan">{item.plan}</span><small>{item.unit_limit} unit limit</small></td><td><strong>{item.unit_count} units</strong><small><Users size={12}/>{item.user_count} users</small></td><td>{friendlyDate(item.created_at)}</td><td><span className={`operator-status ${item.status}`}>{item.status}</span></td><td>{item.status==='suspended'?<button className="operator-row-action" onClick={()=>void changeStatus(item,'active')}>Activate</button>:<button className="operator-row-action danger" onClick={()=>void changeStatus(item,'suspended')}>Suspend</button>}</td></tr>)}
          {!loading&&!visible.length&&<tr><td colSpan={6} className="operator-empty">No matching companies.</td></tr>}
        </tbody></table></div>
      </section>
    </main>
    {showForm&&<div className="operator-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeForm()}}><form className="operator-modal" onSubmit={submit}>
      <div className="operator-modal-head"><div><span>NEW WORKSPACE</span><h2>Onboard a company</h2><p>Create its workspace and first owner account.</p></div><button type="button" onClick={closeForm}><X size={19}/></button></div>
      <div className="operator-form-section"><h3>Company details</h3><div className="operator-form-grid"><label className="wide"><span>Company name</span><input value={form.companyName} onChange={e=>companyName(e.target.value)} required minLength={2}/></label><label><span>Company code</span><input value={form.slug} onChange={e=>{setSlugEdited(true);update('slug',slugify(e.target.value))}} required minLength={3}/><small>Used when signing in.</small></label><label><span>Work email</span><input type="email" value={form.companyEmail} onChange={e=>update('companyEmail',e.target.value)}/></label><label><span>Phone</span><input value={form.companyPhone} onChange={e=>update('companyPhone',e.target.value)}/></label><label><span>Plan</span><select value={form.plan} onChange={e=>update('plan',e.target.value as OrganizationOnboarding['plan'])}><option value="starter">Starter</option><option value="growth">Growth</option><option value="professional">Professional</option></select></label><label><span>Unit limit</span><input type="number" min={1} max={100000} value={form.unitLimit} onChange={e=>update('unitLimit',Number(e.target.value))} required/></label><label><span>Start as</span><select value={form.status} onChange={e=>update('status',e.target.value as 'trial'|'active')}><option value="trial">14-day trial</option><option value="active">Active</option></select></label></div></div>
      <div className="operator-form-section"><h3>First account owner</h3><div className="operator-form-grid"><label><span>First name</span><input value={form.adminFirstName} onChange={e=>update('adminFirstName',e.target.value)} required/></label><label><span>Last name</span><input value={form.adminLastName} onChange={e=>update('adminLastName',e.target.value)} required/></label><label><span>Email</span><input type="email" value={form.adminEmail} onChange={e=>update('adminEmail',e.target.value)} required/></label><label><span>Phone</span><input value={form.adminPhone} onChange={e=>update('adminPhone',e.target.value)}/></label><label className="wide"><span>Temporary password</span><input type="password" minLength={12} value={form.temporaryPassword} onChange={e=>update('temporaryPassword',e.target.value)} required/><small>At least 12 characters. Share it securely with the account owner.</small></label></div></div>
      {error&&<div className="operator-error modal-error"><CircleAlert size={16}/><span>{error}</span></div>}
      <div className="operator-modal-actions"><button type="button" onClick={closeForm}>Cancel</button><button className="operator-primary" disabled={saving}>{saving?'Creating account…':'Create company account'}</button></div>
    </form></div>}
  </div>;
}

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, CircleDollarSign, Download, FileBarChart, Home, Layers3, MapPin, Users, WalletCards, Wrench, X } from 'lucide-react';
import { api, getToken } from '../api';
import { DataTable, MetricCard, ModuleHeader, Panel, Status } from '../ui';

type AddPage='Properties'|'Units'|'Tenants'|'Collections'|'Maintenance';
type QuickAddProps={page:AddPage;onClose:()=>void;onSaved:()=>void};
type RecordRow=Record<string,any>;
const money=(value:unknown)=>`KES ${Number(value||0).toLocaleString()}`;

function useRows(loader:()=>Promise<any[]>,refreshKey:number){
  const [rows,setRows]=useState<RecordRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{let active=true;setLoading(true);loader().then(data=>{if(active){setRows(data);setError('')}}).catch(err=>{if(active)setError(err instanceof Error?err.message:'Could not load data')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[refreshKey]);
  return {rows,loading,error};
}

function Notice({loading,error,empty}:{loading:boolean;error:string;empty:boolean}){
  if(loading)return <div className="overview-source-note"><span>Loading…</span></div>;
  if(error)return <div className="overview-source-note"><AlertTriangle size={14}/><span>{error}</span></div>;
  if(empty)return <div className="overview-source-note"><span>No records yet. Use Add to create the first one.</span></div>;
  return null;
}

export function QuickAddModal({page,onClose,onSaved}:QuickAddProps){
  const [form,setForm]=useState<Record<string,string>>({paymentMethod:'mpesa',priority:'medium',propertyType:'residential',unitType:'apartment'});
  const [properties,setProperties]=useState<RecordRow[]>([]),[tenants,setTenants]=useState<RecordRow[]>([]),[units,setUnits]=useState<RecordRow[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  useEffect(()=>{if(!getToken())return;Promise.all([api.properties(),api.tenants(),api.units()]).then(([p,t,u])=>{setProperties(p);setTenants(t);setUnits(u)}).catch(()=>{})},[]);
  const set=(name:string,value:string)=>setForm(current=>({...current,[name]:value}));
  const field=(name:string,label:string,required=false,type='text',placeholder='')=><label><span>{label}</span><input type={type} required={required} value={form[name]||''} placeholder={placeholder} onChange={e=>set(name,e.target.value)}/></label>;
  const propertySelect=<label><span>Property</span><select required value={form.propertyId||''} onChange={e=>set('propertyId',e.target.value)}><option value="">Choose property</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>;
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{
      if(page==='Properties')await api.createProperty({name:form.name,propertyType:form.propertyType||'residential',address:form.address||undefined,city:form.city||undefined,county:form.county||undefined});
      if(page==='Units')await api.createUnit({propertyId:form.propertyId,unitNumber:form.unitNumber,unitType:form.unitType||'apartment',bedrooms:form.bedrooms?Number(form.bedrooms):undefined,marketRent:Number(form.marketRent||0),depositAmount:Number(form.depositAmount||0)});
      if(page==='Tenants')await api.createTenant({firstName:form.firstName,lastName:form.lastName,phone:form.phone,email:form.email||undefined,nationalId:form.nationalId||undefined});
      if(page==='Collections')await api.createPayment({tenantId:form.tenantId||undefined,reference:form.reference,paymentMethod:form.paymentMethod||'mpesa',amount:Number(form.amount)});
      if(page==='Maintenance')await api.createMaintenance({propertyId:form.propertyId,unitId:form.unitId||undefined,requestNumber:`REQ-${Date.now().toString().slice(-8)}`,title:form.title,description:form.description||undefined,category:form.category||undefined,priority:form.priority||'medium'});
      setSaved(true);onSaved();window.setTimeout(onClose,700);
    }catch(err){setError(err instanceof Error?err.message:'Could not save')}
    finally{setBusy(false)}
  }
  const relevantUnits=useMemo(()=>units.filter(u=>!form.propertyId||u.property_id===form.propertyId),[units,form.propertyId]);
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><span className="panel-kicker">Add new</span><h2>{page==='Collections'?'Record payment':page==='Maintenance'?'Add repair request':`Add ${page.slice(0,-1).toLowerCase()}`}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={17}/></button></div>{saved?<div className="success-state"><CheckCircle2 size={28}/><strong>Saved</strong><span>The new record is now in the system.</span></div>:<><div className="form-grid">
    {page==='Properties'&&<>{field('name','Property name',true,'text','e.g. Greenview Apartments')}<label><span>Type</span><select value={form.propertyType} onChange={e=>set('propertyType',e.target.value)}><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="mixed-use">Mixed use</option></select></label>{field('address','Address')}{field('city','Town / city')}{field('county','County')}</>}
    {page==='Units'&&<>{propertySelect}{field('unitNumber','Unit number',true)}<label><span>Unit type</span><select value={form.unitType} onChange={e=>set('unitType',e.target.value)}><option value="apartment">Apartment</option><option value="house">House</option><option value="shop">Shop</option><option value="office">Office</option></select></label>{field('bedrooms','Bedrooms',false,'number')}{field('marketRent','Monthly rent',true,'number','KES')}{field('depositAmount','Deposit',false,'number','KES')}</>}
    {page==='Tenants'&&<>{field('firstName','First name',true)}{field('lastName','Last name',true)}{field('phone','Phone number',true,'tel','07…')}{field('email','Email',false,'email')}{field('nationalId','National ID')}</>}
    {page==='Collections'&&<><label><span>Tenant</span><select value={form.tenantId||''} onChange={e=>set('tenantId',e.target.value)}><option value="">Unmatched / choose later</option>{tenants.map(t=><option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}</select></label>{field('reference','Payment reference',true)}{field('amount','Amount',true,'number','KES')}<label><span>Payment method</span><select value={form.paymentMethod} onChange={e=>set('paymentMethod',e.target.value)}><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="cash">Cash</option><option value="card">Card</option><option value="cheque">Cheque</option></select></label></>}
    {page==='Maintenance'&&<>{propertySelect}<label><span>Unit (optional)</span><select value={form.unitId||''} onChange={e=>set('unitId',e.target.value)}><option value="">Whole property</option>{relevantUnits.map(u=><option key={u.id} value={u.id}>{u.unit_number}</option>)}</select></label>{field('title','Problem',true,'text','e.g. Leaking kitchen tap')}{field('category','Category')}<label><span>Priority</span><select value={form.priority} onChange={e=>set('priority',e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label className="full"><span>Description</span><textarea rows={4} value={form.description||''} onChange={e=>set('description',e.target.value)} placeholder="Add useful details"/></label></>}
  </div>{error&&<div className="auth-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button disabled={busy} type="submit" className="primary-button">{busy?'Saving…':'Save'}</button></div></>}</form></div>;
}

export function SimplePropertiesPage({onAdd,refreshKey}:{onAdd:()=>void;refreshKey:number}){
  const {rows,loading,error}=useRows(api.properties,refreshKey);
  return <><ModuleHeader page="Properties" onAdd={onAdd}/><Notice loading={loading} error={error} empty={!rows.length}/><div className="metric-grid four"><MetricCard label="Properties" value={String(rows.length)} note="Active properties" icon={Building2}/><MetricCard label="Total units" value={String(rows.reduce((n,p)=>n+Number(p.unit_count||0),0))} note="Across all properties" icon={Layers3}/><MetricCard label="Occupied" value={String(rows.reduce((n,p)=>n+Number(p.occupied_count||0),0))} note="Units with tenants" icon={Home} tone="success"/><MetricCard label="Needs attention" value={String(rows.filter(p=>p.status!=='active').length)} note="Inactive properties" icon={AlertTriangle} tone="danger"/></div><Panel title="All properties" kicker="Property list"><DataTable headers={['Property','Location','Type','Units','Occupied','Status']} rows={rows.map(p=>[p.name,[p.address,p.city].filter(Boolean).join(', ')||'—',p.property_type||'—',p.unit_count||0,p.occupied_count||0,<Status value={p.status||'active'}/>])}/></Panel></>;
}

export function SimpleUnitsPage({onAdd,refreshKey}:{onAdd:()=>void;refreshKey:number}){
  const {rows,loading,error}=useRows(api.units,refreshKey);const occupied=rows.filter(u=>u.status==='occupied').length;
  return <><ModuleHeader page="Units" onAdd={onAdd}/><Notice loading={loading} error={error} empty={!rows.length}/><div className="metric-grid four"><MetricCard label="Total units" value={String(rows.length)} note="All active units" icon={Layers3}/><MetricCard label="Occupied" value={String(occupied)} note="Units with tenants" icon={Home} tone="success"/><MetricCard label="Vacant" value={String(rows.filter(u=>u.status==='vacant').length)} note="Ready to rent" icon={Home} tone="info"/><MetricCard label="Monthly rent" value={money(rows.reduce((n,u)=>n+Number(u.current_rent||u.market_rent||0),0))} note="Current and market rent" icon={WalletCards}/></div><Panel title="All units" kicker="Unit list"><DataTable headers={['Unit','Property','Type','Tenant','Rent','Status']} rows={rows.map(u=>[u.unit_number,u.property_name,u.unit_type||'—',u.tenant_name||'—',money(u.current_rent||u.market_rent),<Status value={u.status||'vacant'}/>])}/></Panel></>;
}

export function SimpleTenantsPage({onAdd,refreshKey}:{onAdd:()=>void;refreshKey:number}){
  const {rows,loading,error}=useRows(api.tenants,refreshKey);const owing=rows.filter(t=>Number(t.balance)>0);
  return <><ModuleHeader page="Tenants" onAdd={onAdd}/><Notice loading={loading} error={error} empty={!rows.length}/><div className="metric-grid four"><MetricCard label="Tenants" value={String(rows.length)} note="All tenant records" icon={Users}/><MetricCard label="In a unit" value={String(rows.filter(t=>t.unit_number).length)} note="Tenants with active leases" icon={Home} tone="success"/><MetricCard label="With a balance" value={String(owing.length)} note="Tenants owing rent" icon={CircleDollarSign} tone="danger"/><MetricCard label="Total balance" value={money(owing.reduce((n,t)=>n+Number(t.balance||0),0))} note="Unpaid rent" icon={WalletCards}/></div><Panel title="All tenants" kicker="Tenant list"><DataTable headers={['Tenant','Property','Unit','Phone','Monthly rent','Balance']} rows={rows.map(t=>[`${t.first_name} ${t.last_name}`,t.property_name||'—',t.unit_number||'—',t.phone||'—',money(t.monthly_rent),money(t.balance)])}/></Panel></>;
}

export function SimplePaymentsPage({onAdd,refreshKey}:{onAdd:()=>void;refreshKey:number}){
  const {rows,loading,error}=useRows(api.payments,refreshKey);const total=rows.reduce((n,p)=>n+Number(p.amount||0),0);
  return <><ModuleHeader page="Collections" onAdd={onAdd}/><Notice loading={loading} error={error} empty={!rows.length}/><div className="metric-grid four"><MetricCard label="Payments" value={String(rows.length)} note="Recent records" icon={WalletCards}/><MetricCard label="Total received" value={money(total)} note="Shown payments" icon={CircleDollarSign} tone="success"/><MetricCard label="M-Pesa" value={String(rows.filter(p=>p.payment_method==='mpesa').length)} note="M-Pesa payments" icon={WalletCards} tone="info"/><MetricCard label="Unmatched" value={String(rows.filter(p=>!p.tenant_id).length)} note="Needs a tenant" icon={AlertTriangle} tone="danger"/></div><Panel title="Recent payments" kicker="Rent and payments"><DataTable headers={['Reference','Tenant','Amount','Method','Date','Status']} rows={rows.map(p=>[p.reference,p.tenant_name||'Unmatched',money(p.amount),String(p.payment_method||'—').toUpperCase(),p.paid_at?new Date(p.paid_at).toLocaleDateString():'—',<Status value={p.status||'posted'}/>])}/></Panel></>;
}

export function SimpleMaintenancePage({onAdd,refreshKey}:{onAdd:()=>void;refreshKey:number}){
  const {rows,loading,error}=useRows(api.maintenance,refreshKey);const open=rows.filter(r=>!['closed','completed','cancelled'].includes(r.status)).length;
  return <><ModuleHeader page="Maintenance" onAdd={onAdd}/><Notice loading={loading} error={error} empty={!rows.length}/><div className="metric-grid four"><MetricCard label="Open requests" value={String(open)} note="Needs action" icon={Wrench}/><MetricCard label="Urgent" value={String(rows.filter(r=>r.priority==='urgent').length)} note="Highest priority" icon={AlertTriangle} tone="danger"/><MetricCard label="In progress" value={String(rows.filter(r=>r.status==='in_progress').length)} note="Being repaired" icon={Wrench} tone="info"/><MetricCard label="Completed" value={String(rows.filter(r=>r.status==='completed'||r.status==='closed').length)} note="Finished jobs" icon={CheckCircle2} tone="success"/></div><Panel title="Repair requests" kicker="Maintenance"><DataTable headers={['Request','Problem','Property','Unit','Priority','Status']} rows={rows.map(r=>[r.request_number,r.title,r.property_name,r.unit_number||'—',r.priority,<Status value={r.status||'open'}/>])}/></Panel></>;
}

function downloadCsv(name:string,rows:RecordRow[]){
  if(!rows.length)throw new Error('There is no data to download');const headers=Object.keys(rows[0]).filter(k=>!['organization_id'].includes(k));const quote=(v:any)=>`"${String(v??'').replace(/"/g,'""')}"`;const csv=[headers.map(quote).join(','),...rows.map(row=>headers.map(h=>quote(row[h])).join(','))].join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url);
}

export function SimpleReportsPage(){
  const [busy,setBusy]=useState(''),[message,setMessage]=useState('');
  const reports=[['Rent roll','Tenants, units, rent and balances',api.rentRoll,'rent-roll.csv'],['Payments','Payment history and references',api.payments,'payments.csv'],['Properties','Property and occupancy list',api.properties,'properties.csv'],['Maintenance','Repair request history',api.maintenance,'maintenance.csv']] as const;
  async function run(title:string,loader:()=>Promise<any[]>,file:string){setBusy(title);setMessage('');try{downloadCsv(file,await loader());setMessage(`${title} downloaded`)}catch(err){setMessage(err instanceof Error?err.message:'Could not download report')}finally{setBusy('')}}
  return <><div className="module-header"><div><div className="eyebrow">Reports</div><h1>Download your reports</h1><p>Choose a report to save it as a spreadsheet-ready CSV file.</p></div></div>{message&&<div className="overview-source-note"><Download size={14}/><span>{message}</span></div>}<div className="report-grid premium-report-grid">{reports.map(([title,desc,loader,file])=><button className="report-card" key={title} onClick={()=>void run(title,loader,file)} disabled={busy===title}><div className="report-icon"><FileBarChart size={18}/></div><div><strong>{busy===title?'Preparing…':title}</strong><span>{desc}</span><small>Download CSV</small></div><Download size={16}/></button>)}</div></>;
}

export function SimpleSettingsPage(){
  const initial=()=>{try{return JSON.parse(localStorage.getItem('propos_simple_settings')||'{}')}catch{return {}}};
  const saved=initial(),[company,setCompany]=useState(saved.company||'Alpha Properties Ltd'),[currency,setCurrency]=useState(saved.currency||'KES'),[timezone,setTimezone]=useState(saved.timezone||'Africa/Nairobi'),[rentReminders,setRentReminders]=useState(saved.rentReminders!==false),[message,setMessage]=useState('');
  function save(e:FormEvent){e.preventDefault();localStorage.setItem('propos_simple_settings',JSON.stringify({company,currency,timezone,rentReminders}));setMessage('Settings saved on this device.')}
  return <><div className="module-header"><div><div className="eyebrow">Account</div><h1>Settings</h1><p>Manage the details used in this browser.</p></div></div><form className="panel" onSubmit={save}><div className="form-grid"> <label><span>Company name</span><input value={company} onChange={e=>setCompany(e.target.value)} required/></label><label><span>Currency</span><select value={currency} onChange={e=>setCurrency(e.target.value)}><option>KES</option><option>USD</option><option>UGX</option><option>TZS</option></select></label><label><span>Timezone</span><select value={timezone} onChange={e=>setTimezone(e.target.value)}><option>Africa/Nairobi</option><option>Africa/Kampala</option><option>Africa/Dar_es_Salaam</option></select></label><label><span>Rent reminders</span><select value={rentReminders?'on':'off'} onChange={e=>setRentReminders(e.target.value==='on')}><option value="on">Enabled</option><option value="off">Disabled</option></select></label></div><div className="modal-actions"><button className="primary-button" type="submit">Save settings</button></div>{message&&<div className="overview-source-note"><CheckCircle2 size={14}/><span>{message}</span></div>}</form></>;
}

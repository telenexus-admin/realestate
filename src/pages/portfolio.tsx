import { AlertTriangle, Banknote, BarChart3, BedDouble, Building2, CheckCircle2, CircleDollarSign, CircleGauge, CreditCard, Home, KeyRound, Landmark, Layers3, PieChart, ReceiptText, Users, Wallet, WalletCards } from 'lucide-react';
import { arrears, leases, owners, payments, properties, tenants, units } from '../data';
import { DataTable, MetricCard, ModuleHeader, Panel, Status } from '../ui';

export function PropertiesPage({onAdd}:{onAdd:()=>void}){
  return <><ModuleHeader page="Properties" onAdd={onAdd}/><div className="metric-grid three"><MetricCard label="Properties" value="12" note="8 residential · 4 commercial" icon={Building2}/><MetricCard label="Monthly income" value="KES 18.4M" note="+6.2% vs last month" icon={Banknote} tone="success"/><MetricCard label="Portfolio health" value="9 healthy" note="3 properties require attention" icon={CircleGauge} tone="info"/></div><div className="property-grid">{properties.map(p=><article className="property-card" key={p.name}><div className="property-cover"><div className="property-pattern"/><Status value={p.status}/></div><div className="property-body"><div className="property-title"><div><h3>{p.name}</h3><span>{p.location}</span></div></div><div className="property-stats"><div><span>Units</span><strong>{p.units}</strong></div><div><span>Occupancy</span><strong>{p.occupancy}%</strong></div><div><span>Monthly income</span><strong>{p.income}</strong></div></div><div className="property-footer"><span>{p.type}</span><span>Manager · {p.manager}</span></div></div></article>)}</div></>;
}

export function UnitsPage({onAdd}:{onAdd:()=>void}){
  return <><ModuleHeader page="Units" onAdd={onAdd}/><div className="metric-grid four"><MetricCard label="Total units" value="742" note="Across 12 properties" icon={Layers3}/><MetricCard label="Occupied" value="681" note="91.8% occupancy" icon={Home} tone="success"/><MetricCard label="Vacant" value="42" note="5.7% of portfolio" icon={BedDouble} tone="info"/><MetricCard label="Maintenance" value="19" note="7 overdue work orders" icon={AlertTriangle} tone="danger"/></div><Panel title="Unit register" kicker="Live inventory"><DataTable headers={['Unit','Property','Type','Rent','Tenant','Status']} rows={units.map(u=>[u.unit,u.property,u.type,u.rent,u.tenant,<Status value={u.status}/>])}/></Panel></>;
}

export function OwnersPage({onAdd}:{onAdd:()=>void}){
  return <><ModuleHeader page="Owners" onAdd={onAdd}/><div className="metric-grid three"><MetricCard label="Owners" value="18" note="15 individuals · 3 companies" icon={Landmark}/><MetricCard label="Owner payable" value="KES 8.42M" note="September distributions" icon={Wallet} tone="success"/><MetricCard label="Statements ready" value="14 / 18" note="4 awaiting reconciliation" icon={ReceiptText} tone="info"/></div><Panel title="Owner portfolio" kicker="Ownership"><DataTable headers={['Owner','Portfolio','Units','Gross rent','Net payable','Occupancy']} rows={owners}/></Panel></>;
}

export function TenantsPage({onAdd}:{onAdd:()=>void}){
  return <><ModuleHeader page="Tenants" onAdd={onAdd}/><div className="metric-grid four"><MetricCard label="Active tenants" value="681" note="Across 742 units" icon={Users}/><MetricCard label="Good standing" value="637" note="93.5% of active tenants" icon={CheckCircle2} tone="success"/><MetricCard label="Outstanding" value="KES 1.86M" note="24 tenants with balances" icon={CircleDollarSign} tone="danger"/><MetricCard label="Expiring leases" value="12" note="Within the next 30 days" icon={KeyRound} tone="info"/></div><Panel title="Tenant CRM" kicker="Residents"><DataTable headers={['Tenant','Unit','Phone','Monthly rent','Balance','Status']} rows={tenants.map(t=>[...t.slice(0,5),<Status value={t[5]}/>])}/></Panel></>;
}

export function LeasingPage({onAdd}:{onAdd:()=>void}){
  const stages=[['Inquiry',23],['Viewing',14],['Application',9],['Screening',6],['Approved',5],['Lease signing',3]];
  return <><ModuleHeader page="Leasing" onAdd={onAdd}/><div className="lease-pipeline">{stages.map(s=><div className="pipeline-stage" key={s[0]}><span>{s[0]}</span><strong>{s[1]}</strong></div>)}</div><div className="panel"><DataTable headers={['Lease','Tenant','Unit','Start','Expiry','Rent','Status']} rows={leases.map(l=>[...l.slice(0,6),<Status value={l[6]}/>])}/></div></>;
}

export function CollectionsPage({onAdd}:{onAdd:()=>void}){
  return <><ModuleHeader page="Collections" onAdd={onAdd}/><div className="metric-grid four"><MetricCard label="Expected rent" value="KES 14.82M" note="September 2026" icon={ReceiptText}/><MetricCard label="Collected" value="KES 12.96M" note="87.5% collection rate" icon={WalletCards} tone="success"/><MetricCard label="M-Pesa" value="KES 9.48M" note="73.1% of collections" icon={CreditCard} tone="info"/><MetricCard label="Unmatched" value="KES 48,500" note="7 transactions need review" icon={AlertTriangle} tone="danger"/></div><Panel title="Recent transactions" kicker="Payment feed"><DataTable headers={['Reference','Tenant','Unit','Amount','Method','Time','Status']} rows={payments.map(p=>[...p.slice(0,6),<Status value={p[6]}/>])}/></Panel></>;
}

export function AccountingPage({onAdd}:{onAdd:()=>void}){
 const accounts=[['Rental income','Income','KES 14,820,000','+7.2%'],['Service charge','Income','KES 1,220,000','+1.8%'],['Tenant receivables','Asset','KES 1,859,600','-4.1%'],['Tenant deposits','Liability','KES 8,940,000','+0.6%'],['Repairs & maintenance','Expense','KES 824,500','+12.4%'],['Owner payables','Liability','KES 8,420,000','+3.7%']];
 return <><ModuleHeader page="Accounting" onAdd={onAdd}/><div className="metric-grid four"><MetricCard label="Gross income" value="KES 16.04M" note="September revenue" icon={Banknote} tone="success"/><MetricCard label="Expenses" value="KES 2.31M" note="14.4% expense ratio" icon={ReceiptText} tone="danger"/><MetricCard label="Net operating income" value="KES 13.73M" note="+5.8% month over month" icon={BarChart3} tone="info"/><MetricCard label="Owner payable" value="KES 8.42M" note="Across 18 owners" icon={Landmark}/></div><div className="split-grid"><Panel title="Account balances" kicker="General ledger"><DataTable headers={['Account','Type','Balance','Movement']} rows={accounts}/></Panel><Panel title="Month-end close" kicker="Controls"><div className="close-checklist">{['M-Pesa clearing reconciled','Bank statement matched','Vendor bills approved','Owner statements generated','Management fees posted'].map((x,i)=><div key={x}><CheckCircle2 size={17} className={i<3?'done':''}/><span>{x}</span><strong>{i<3?'Complete':'Pending'}</strong></div>)}</div></Panel></div></>;
}

export function ArrearsPage({onAdd}:{onAdd:()=>void}){
 return <><ModuleHeader page="Arrears" onAdd={onAdd}/><div className="aging-grid">{[['0–7 days','KES 420K','8 tenants'],['8–30 days','KES 680K','9 tenants'],['31–60 days','KES 315K','4 tenants'],['61–90 days','KES 194K','2 tenants'],['90+ days','KES 250K','1 tenant']].map((a,i)=><article key={a[0]} className={`aging-card a${i}`}><span>{a[0]}</span><strong>{a[1]}</strong><small>{a[2]}</small></article>)}</div><Panel title="Collection queue" kicker="Debt aging"><DataTable headers={['Tenant','Unit','Age','Amount','Bucket','Collection stage']} rows={arrears.map(a=>[...a.slice(0,5),<Status value={a[5]}/>])}/></Panel></>;
}

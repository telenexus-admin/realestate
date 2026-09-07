import { Activity, Building2, CreditCard, ShieldCheck, Users, WalletCards } from 'lucide-react';
import { DataTable, MetricCard, Status } from '../ui';

const organizations = [
  ['Alpha Properties Ltd','742 units','Business','KES 92,000/mo','Active','08 Sep 2026'],
  ['Metro Homes','318 units','Growth','KES 42,000/mo','Active','08 Sep 2026'],
  ['Karibu Realtors','83 units','Starter','KES 14,000/mo','Trial','07 Sep 2026'],
  ['Apex Property Group','1,284 units','Enterprise','Custom','Active','07 Sep 2026'],
  ['Juja Student Homes','206 units','Growth','KES 42,000/mo','Active','06 Sep 2026'],
];

export function OperatorPage({onAdd}:{onAdd:()=>void}){
  return <><div className="module-header"><div><div className="eyebrow">Polyizon platform operator</div><h1>PropOS control center</h1><p>Onboard property-management companies, manage plans, monitor platform usage and support every workspace.</p></div><button className="primary-button" onClick={onAdd}>+ Onboard company</button></div>
  <div className="metric-grid four"><MetricCard label="Organizations" value="184" note="173 active · 11 trial" icon={Building2}/><MetricCard label="Units managed" value="18,420" note="+624 in the last 30 days" icon={Activity} tone="success"/><MetricCard label="Platform MRR" value="KES 3.84M" note="+8.7% month over month" icon={WalletCards} tone="info"/><MetricCard label="Admin users" value="612" note="Across all organizations" icon={Users} tone="primary"/></div>
  <div className="split-grid"><article className="panel"><div className="panel-head"><div><span className="panel-kicker">SaaS organizations</span><h2>Customer workspaces</h2></div></div><DataTable headers={['Organization','Usage','Plan','Subscription','Status','Last activity']} rows={organizations.map(o=>[...o.slice(0,4),<Status value={o[4]}/>,o[5]])}/></article><article className="panel"><div className="panel-head"><div><span className="panel-kicker">Platform health</span><h2>Operational status</h2></div></div><div className="close-checklist"><div><ShieldCheck size={17} className="done"/><span>API & database</span><strong>Healthy</strong></div><div><CreditCard size={17} className="done"/><span>M-Pesa callbacks</span><strong>Healthy</strong></div><div><Activity size={17} className="done"/><span>Background jobs</span><strong>Healthy</strong></div><div><WalletCards size={17} className="done"/><span>Payment matching</span><strong>99.7%</strong></div></div></article></div></>;
}

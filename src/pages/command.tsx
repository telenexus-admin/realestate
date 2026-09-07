import { Activity, AlertTriangle, ArrowUpRight, Banknote, Building2, CalendarClock, CheckCircle2, CircleGauge, Clock3, MessageSquareText, ShieldCheck, Sparkles, TrendingUp, Users, Wrench } from 'lucide-react';
import { MetricCard, Panel, Status } from '../ui';
import { WorkflowExecutionCenter } from '../workflow-execution';

const health=[
  {name:'Greenview Apartments',units:148,occ:96.6,collection:94.8,arrears:'KES 188K',maintenance:2,score:94},
  {name:'Riverside Heights',units:96,occ:93.8,collection:91.2,arrears:'KES 241K',maintenance:1,score:91},
  {name:'Parkline Residences',units:124,occ:88.7,collection:83.4,arrears:'KES 392K',maintenance:4,score:78},
  {name:'The Junction Offices',units:72,occ:97.2,collection:96.1,arrears:'KES 76K',maintenance:0,score:96},
];

export function CommandCenterPage(){
 return <>
  <div className="command-hero"><div><div className="eyebrow"><Sparkles size={14}/> Executive intelligence · Live workspace</div><h1>Portfolio Command Center</h1><p>A decision layer for money, occupancy, tenant risk, operations and upcoming obligations—not just another dashboard.</p></div><div className="command-health"><span><i/> Systems healthy</span><strong>94</strong><small>portfolio health</small></div></div>
  <div className="metric-grid four"><MetricCard label="Expected this month" value="KES 14.82M" note="742 units · recurring rent & charges" icon={Banknote}/><MetricCard label="Collected" value="KES 12.96M" note="87.5% · +4.2 pts vs last month" icon={TrendingUp} tone="success"/><MetricCard label="Revenue at risk" value="KES 624K" note="18 accounts >30 days overdue" icon={AlertTriangle} tone="danger"/><MetricCard label="Operational SLA" value="92.4%" note="Jobs resolved within target window" icon={CircleGauge} tone="info"/></div>
  <div className="command-grid"><Panel title="Today’s operating brief" kicker="AI prioritized"><div className="brief-list">
   <article className="brief critical"><div className="brief-icon"><AlertTriangle size={17}/></div><div><span>COLLECTION RISK · HIGH</span><strong>6 tenants account for 61% of aged arrears</strong><p>Prioritize Parkline C-18, A-07 and Riverside B-04 before broad reminders. Combined exposure is KES 381,500.</p><button>Open collection queue <ArrowUpRight size={13}/></button></div></article>
   <article className="brief warning"><div className="brief-icon"><CalendarClock size={17}/></div><div><span>LEASE RISK · NEXT 30 DAYS</span><strong>12 leases expire; 8 offers are still unsent</strong><p>Three high-value units have no renewal action and could create KES 146K/month vacancy exposure.</p><button>Review renewals <ArrowUpRight size={13}/></button></div></article>
   <article className="brief positive"><div className="brief-icon"><CheckCircle2 size={17}/></div><div><span>OPPORTUNITY</span><strong>The Junction Offices reached 96.1% collection</strong><p>Best-performing property this month. Owner statement can be prepared early after two pending bank matches clear.</p><button>View property <ArrowUpRight size={13}/></button></div></article>
  </div></Panel>
  <Panel title="Cash position" kicker="September"><div className="cash-waterfall"><div><span>Opening receivable</span><strong>KES 14.82M</strong></div><i>−</i><div className="good"><span>Collected</span><strong>KES 12.96M</strong></div><i>=</i><div className="risk"><span>Outstanding</span><strong>KES 1.86M</strong></div></div><div className="progress-stack"><div><span>On-time</span><strong>78.4%</strong></div><div><span>Late recovered</span><strong>9.1%</strong></div><div><span>Still due</span><strong>12.5%</strong></div></div><div className="forecast-box"><TrendingUp size={18}/><div><span>Projected month close</span><strong>KES 14.31M · 96.6%</strong><small>Based on current collection velocity and active payment plans.</small></div></div></Panel></div>
  <div className="command-grid second"><Panel title="Property health matrix" kicker="Portfolio comparison"><div className="health-table"><div className="health-head"><span>Property</span><span>Occ.</span><span>Collection</span><span>Arrears</span><span>Open jobs</span><span>Health</span></div>{health.map(p=><div className="health-row" key={p.name}><strong>{p.name}<small>{p.units} units</small></strong><span>{p.occ}%</span><span>{p.collection}%</span><span>{p.arrears}</span><span>{p.maintenance}</span><b className={p.score<80?'low':p.score<90?'mid':''}>{p.score}</b></div>)}</div></Panel><Panel title="Live activity" kicker="Workspace pulse"><div className="timeline">
   <div><i><Banknote size={14}/></i><p><strong>M-Pesa payment matched</strong><span>Mercy Wanjiku · Greenview A-12 · KES 32,000</span></p><time>2m</time></div>
   <div><i><Wrench size={14}/></i><p><strong>Urgent work order assigned</strong><span>Riverside B-04 · Water leak · Kamau Plumbing</span></p><time>11m</time></div>
   <div><i><Users size={14}/></i><p><strong>Renewal offer viewed</strong><span>Brian Otieno · Parkline C-03</span></p><time>24m</time></div>
   <div><i><MessageSquareText size={14}/></i><p><strong>Automated reminder delivered</strong><span>WhatsApp · 23 rent reminders · 22 delivered</span></p><time>41m</time></div>
   <div><i><ShieldCheck size={14}/></i><p><strong>Inspection approved</strong><span>Greenview B-16 · Move-in checklist</span></p><time>1h</time></div>
  </div></Panel></div>
  <div className="command-footer-grid"><div className="mini-command"><Activity size={18}/><div><span>Automation engine</span><strong>3,842 runs · 99.4% successful</strong></div><Status value="Healthy"/></div><div className="mini-command"><Clock3 size={18}/><div><span>Next critical deadline</span><strong>Rent reminder batch · 17:00</strong></div><button>Review</button></div><div className="mini-command"><Building2 size={18}/><div><span>Portfolio movement</span><strong>+18 units added this month</strong></div><span className="positive-text">+2.5%</span></div></div>
  <WorkflowExecutionCenter/>
 </>;
}

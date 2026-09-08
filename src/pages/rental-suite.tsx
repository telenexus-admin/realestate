import { useMemo, useState } from 'react';
import { BadgeCheck, Banknote, BedDouble, BellRing, Boxes, BriefcaseBusiness, Building2, CalendarClock, Car, ClipboardCheck, FileSignature, Gauge, HandCoins, HeartHandshake, Home, KeyRound, Megaphone, MessageSquareText, PackageCheck, ReceiptText, Scale, ShieldCheck, Sparkles, Users, WalletCards, Wrench, Zap } from 'lucide-react';
import { MetricCard, Panel, Status } from '../ui';

type Feature={title:string;desc:string;status:string;metric:string;icon:any};
const features:Feature[]=[
 {title:'Tenant Onboarding & KYC',desc:'Identity, employer, next of kin, emergency contacts, references, consent and verification.',status:'12 pending',metric:'96% verified',icon:BadgeCheck},
 {title:'Guarantors & Co-tenants',desc:'Guarantees, roommates, occupants, liability split, household and dependent register.',status:'4 reviews',metric:'38 linked',icon:Users},
 {title:'Rent Schedule Engine',desc:'Recurring rent, stepped increases, CPI/escalations, rent-free periods, grace and proration.',status:'Next run 1 Oct',metric:'742 schedules',icon:CalendarClock},
 {title:'Charges & Penalties',desc:'Parking, service charge, garbage, internet, storage, discounts, concessions and late-fee policies.',status:'Healthy',metric:'18 charge rules',icon:ReceiptText},
 {title:'Allocation & Tenant Wallet',desc:'Partial-payment waterfall, overpayments, credits, unapplied cash, reversals and credit notes.',status:'KES 184K unapplied',metric:'31 wallets',icon:WalletCards},
 {title:'Payment Plans',desc:'Promises-to-pay, arrears installments, missed-plan alerts and recovery monitoring.',status:'7 at risk',metric:'23 active plans',icon:HandCoins},
 {title:'Statements & Receipts',desc:'Tenant ledger, branded receipts, allocations, opening balances and downloadable statements.',status:'Ready',metric:'681 active ledgers',icon:Banknote},
 {title:'Lease Administration',desc:'Amendments, versioning, clause library, renewals, break clauses and digital signing workflow.',status:'12 expiring',metric:'96.8% signed',icon:FileSignature},
 {title:'Vacancy & Turnover',desc:'Vacant-since, make-ready, cleaning, repairs, keys, meters, availability and readiness sign-off.',status:'42 vacant',metric:'8.4 days avg',icon:Home},
 {title:'Leads, Viewings & Waitlist',desc:'Inquiry CRM, viewing calendar, lead score, applications, referrals, waitlists and conversion.',status:'19 hot leads',metric:'31% conversion',icon:Megaphone},
 {title:'Maintenance Experience',desc:'Tenant evidence, appointments, contractor ETA, preventive maintenance, warranties and ratings.',status:'31 open',metric:'92.4% SLA',icon:Wrench},
 {title:'Assets, Keys & Access',desc:'Equipment register, serials, warranties, keys, gate remotes, access cards and service history.',status:'3 exceptions',metric:'1,284 assets',icon:KeyRound},
 {title:'Parking & Visitors',desc:'Bay allocation, vehicles, visitor logs, temporary access, pets and amenity reservations.',status:'14 visitors today',metric:'226 bays',icon:Car},
 {title:'Inspections & Inventory',desc:'Move-in/out evidence, room condition, furnished inventory, defects and photo comparison.',status:'4 awaiting review',metric:'94 condition',icon:ClipboardCheck},
 {title:'Deposits',desc:'Deposit types, deductions, approvals, refunds, aging, transfers and deposit statements.',status:'KES 9.6M held',metric:'6 refunds due',icon:ShieldCheck},
 {title:'Utility Billing',desc:'Meters, tariffs, tiers, shared allocation, estimated readings, anomalies and variance controls.',status:'8 anomalies',metric:'1,106 meters',icon:Zap},
 {title:'Commercial & Student',desc:'CAM, turnover rent, fit-out/break clauses plus bed spaces, semesters and shared rooms.',status:'Enabled',metric:'4 asset modes',icon:BedDouble},
 {title:'Staff & Handover',desc:'Caretakers, security, cleaners, shifts, handover notes, tasks, escalation and SLA.',status:'2 handovers',metric:'28 field staff',icon:BriefcaseBusiness},
 {title:'Incidents & Complaints',desc:'Disputes, noise, damage, fire, theft, flooding, evidence, escalation and resolution.',status:'5 open cases',metric:'1 critical',icon:BellRing},
 {title:'Communications',desc:'WhatsApp/SMS/email preferences, broadcasts, templates, notices and document requests.',status:'22/23 delivered',metric:'98.7% delivery',icon:MessageSquareText},
 {title:'Owner Mandates & Fees',desc:'Management agreements, fee engine, reserves, approval authority and expense thresholds.',status:'2 renewals',metric:'KES 8.42M payout',icon:Building2},
 {title:'Profitability & Budgets',desc:'NOI, unit contribution, vacancy loss, maintenance cost, budget vs actual and forecasts.',status:'On plan',metric:'67.4% NOI margin',icon:Gauge},
 {title:'Procurement & Inventory',desc:'Quote comparison, requisitions, purchase orders, stock, stores, contracts and vendor SLA.',status:'6 approvals',metric:'KES 418K committed',icon:Boxes},
 {title:'Legal, Notices & Recovery',desc:'Demand notices, termination, eviction stages, advocates, hearings, write-offs and evidence packs.',status:'3 legal cases',metric:'KES 624K exposure',icon:Scale},
 {title:'Insurance & Compliance',desc:'Policies, claims, certificates, statutory calendar, document expiry and inspection obligations.',status:'7 due soon',metric:'94% compliant',icon:PackageCheck},
 {title:'Tax & Cash Controls',desc:'Withholding/VAT schedules, petty cash, collectors, banking, variances and property accounts.',status:'Reconciled',metric:'2 exceptions',icon:Banknote},
 {title:'Portfolio Intelligence',desc:'Rent-roll snapshots, occupancy history, expiry heatmaps, churn, collection and vendor benchmarks.',status:'Updated today',metric:'36 reports',icon:Sparkles},
 {title:'Mobile Field Mode',desc:'Caretaker-first jobs, readings, photos, inspections, incidents, QR unit lookup and offline capture.',status:'Sync healthy',metric:'18 devices',icon:ClipboardCheck},
 {title:'Self-service Portals',desc:'Tenant, owner, vendor, applicant and move-in portals with controlled document access.',status:'612 active users',metric:'5 portal types',icon:HeartHandshake},
 {title:'Month-end & Controls',desc:'Scheduled billing, billing preview, period locks, reopen approval, duplicate checks and close checklist.',status:'Sep close 82%',metric:'11/14 controls',icon:ShieldCheck},
];

export function RentalOperationsSuite(){
 const [query,setQuery]=useState(''); const [selected,setSelected]=useState('All');
 const groups=['All','Tenant','Revenue','Leasing','Operations','Owner & Finance','Governance'];
 const classify=(f:Feature)=>/Tenant|Guarant|Statement|Communication|Portal/.test(f.title)?'Tenant':/Rent|Charge|Allocation|Payment Plan/.test(f.title)?'Revenue':/Lease|Vacancy|Lead/.test(f.title)?'Leasing':/Maintenance|Asset|Parking|Inspection|Utility|Staff|Mobile|Commercial/.test(f.title)?'Operations':/Owner|Profit|Procurement|Tax|Month/.test(f.title)?'Owner & Finance':'Governance';
 const shown=useMemo(()=>features.filter(f=>(selected==='All'||classify(f)===selected)&&(f.title+' '+f.desc).toLowerCase().includes(query.toLowerCase())),[query,selected]);
 return <>
  <div className="command-hero"><div><div className="eyebrow"><Home size={14}/> Rental operating system</div><h1>Rental Operations Suite</h1><p>The complete tenant-to-owner lifecycle: acquisition, onboarding, billing, occupancy, service, compliance, close and portfolio intelligence.</p></div><div className="command-health"><span><i/> Suite mapped</span><strong>{features.length}</strong><small>capability centers</small></div></div>
  <div className="metric-grid four"><MetricCard label="Active tenants" value="681" note="Across residential, commercial & shared assets" icon={Users}/><MetricCard label="Scheduled rent" value="KES 14.82M" note="Recurring billing & charge engine" icon={ReceiptText} tone="success"/><MetricCard label="Lifecycle exceptions" value="27" note="KYC, deposits, legal, utilities & turnover" icon={BellRing} tone="danger"/><MetricCard label="Operational coverage" value="30 centers" note="Field, finance, owner & tenant controls" icon={ShieldCheck} tone="info"/></div>
  <Panel title="Capability command map" kicker="Rental & property management"><div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:16}}>{groups.map(g=><button className={selected===g?'primary-button':'secondary-button'} onClick={()=>setSelected(g)} key={g}>{g}</button>)}</div><div className="global-search" style={{maxWidth:520,marginBottom:18}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search rental capabilities…"/></div><div className="module-grid">{shown.map(f=><article className="panel interactive-card" key={f.title}><div className="panel-head"><div style={{display:'flex',gap:10,alignItems:'center'}}><f.icon size={18}/><div><span className="panel-kicker">{classify(f)}</span><h2>{f.title}</h2></div></div><Status value={f.status}/></div><p>{f.desc}</p><div className="mini-command" style={{marginTop:14}}><div><span>Workspace signal</span><strong>{f.metric}</strong></div></div></article>)}</div></Panel>
 </>;
}

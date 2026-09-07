import { ReactNode } from 'react';
import { ChevronRight, MoreHorizontal } from 'lucide-react';

export function Status({value}:{value:string}) {
  const cls=value.toLowerCase().replaceAll(' ','-').replaceAll('>','');
  return <span className={`status-pill ${cls}`}>{value}</span>;
}

export function MetricCard({label,value,note,icon:Icon,tone='primary'}:{label:string;value:string;note:string;icon:any;tone?:string}){
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18}/></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>
}

export function DataTable({headers,rows,onRowClick,compact=false}:{headers:string[];rows:ReactNode[][];onRowClick?:(rowIndex:number)=>void;compact?:boolean}){
  return <div className={`table-scroll ${compact?'compact':''}`}><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}<th></th></tr></thead><tbody>{rows.map((r,i)=><tr key={i} className={onRowClick?'clickable-row':''} tabIndex={onRowClick?0:undefined} onClick={()=>onRowClick?.(i)} onKeyDown={e=>{if(onRowClick&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onRowClick(i)}}}>{r.map((c,j)=><td key={j}>{c}</td>)}<td><button className="more-btn" onClick={e=>e.stopPropagation()} aria-label="More actions"><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table></div>
}

export const pageMeta: Record<string,{title:string;subtitle:string;action?:string}> = {
  Properties:{title:'Properties',subtitle:'Manage every building, block and property in your portfolio.',action:'Add property'},
  Units:{title:'Units',subtitle:'Live occupancy, rent, tenant and maintenance status for every unit.',action:'Add unit'},
  Owners:{title:'Property owners',subtitle:'Owner relationships, portfolio performance and payout visibility.',action:'Add owner'},
  Tenants:{title:'Tenants',subtitle:'A complete CRM for residents, balances, leases and communication.',action:'Add tenant'},
  Leasing:{title:'Leasing',subtitle:'Move applicants from inquiry to signed lease without losing momentum.',action:'New lease'},
  Collections:{title:'Collections',subtitle:'Real-time rent collection, payment matching and reconciliation.',action:'Record payment'},
  Accounting:{title:'Accounting',subtitle:'Property accounting with receivables, payables and owner ledgers.',action:'New transaction'},
  Arrears:{title:'Arrears',subtitle:'Prioritize debt by age, value and collection stage.',action:'Create action'},
  Maintenance:{title:'Maintenance',subtitle:'Work orders, vendors, SLAs and property maintenance costs.',action:'New work order'},
  Inspections:{title:'Inspections',subtitle:'Digital move-in, routine and move-out inspections.',action:'Schedule inspection'},
  Inbox:{title:'Unified inbox',subtitle:'WhatsApp, SMS, email and portal messages in one operational view.',action:'New message'},
  Reports:{title:'Reports & intelligence',subtitle:'Financial, operational and collection reporting across the portfolio.',action:'Export report'},
  'AI Assistant':{title:'Polyizon AI',subtitle:'Ask questions about your portfolio and turn answers into actions.'},
};

export function ModuleHeader({page,onAdd}:{page:string;onAdd?:()=>void}){
  const meta=pageMeta[page];
  return <div className="module-header"><div><div className="eyebrow">Polyizon PropOS · {page}</div><h1>{meta.title}</h1><p>{meta.subtitle}</p></div><div className="module-actions"><button className="secondary-button">Filter</button>{meta.action&&onAdd&&<button className="primary-button" onClick={onAdd}>+ {meta.action}</button>}</div></div>
}

export function Panel({title,kicker,children,action}:{title:string;kicker?:string;children:ReactNode;action?:string}){
  return <article className="panel"><div className="panel-head"><div>{kicker&&<span className="panel-kicker">{kicker}</span>}<h2>{title}</h2></div>{action&&<button className="ghost-button">{action}<ChevronRight size={14}/></button>}</div>{children}</article>
}

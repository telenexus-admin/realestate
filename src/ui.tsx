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
  return <div className={`table-scroll ${compact?'compact':''}`}><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}{onRowClick&&<th></th>}</tr></thead><tbody>{rows.map((r,i)=><tr key={i} className={onRowClick?'clickable-row':''} tabIndex={onRowClick?0:undefined} onClick={()=>onRowClick?.(i)} onKeyDown={e=>{if(onRowClick&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onRowClick(i)}}}>{r.map((c,j)=><td key={j}>{c}</td>)}{onRowClick&&<td><button className="more-btn" onClick={e=>{e.stopPropagation();onRowClick(i)}} aria-label="Open details"><MoreHorizontal size={17}/></button></td>}</tr>)}</tbody></table></div>
}

export const pageMeta: Record<string,{title:string;subtitle:string;action?:string}> = {
  Properties:{title:'Properties',subtitle:'View and manage your properties.',action:'Add property'},
  Units:{title:'Units',subtitle:'See occupied, vacant and available units.',action:'Add unit'},
  Owners:{title:'Property owners',subtitle:'Owner relationships, portfolio performance and payout visibility.',action:'Add owner'},
  Tenants:{title:'Tenants',subtitle:'View tenant contacts, units and balances.',action:'Add tenant'},
  Leasing:{title:'Leasing',subtitle:'Move applicants from inquiry to signed lease without losing momentum.',action:'New lease'},
  Collections:{title:'Rent & payments',subtitle:'View rent payments and unmatched transactions.',action:'Record payment'},
  Accounting:{title:'Accounting',subtitle:'Property accounting with receivables, payables and owner ledgers.',action:'New transaction'},
  Arrears:{title:'Arrears',subtitle:'Prioritize debt by age, value and collection stage.',action:'Create action'},
  Maintenance:{title:'Maintenance',subtitle:'Track repair requests and urgent problems.',action:'Add repair request'},
  Inspections:{title:'Inspections',subtitle:'Digital move-in, routine and move-out inspections.',action:'Schedule inspection'},
  Inbox:{title:'Unified inbox',subtitle:'WhatsApp, SMS, email and portal messages in one operational view.',action:'New message'},
  Reports:{title:'Reports & intelligence',subtitle:'Financial, operational and collection reporting across the portfolio.',action:'Export report'},
  'AI Assistant':{title:'Polyizon AI',subtitle:'Ask questions about your portfolio and turn answers into actions.'},
};

export function ModuleHeader({page,onAdd,onFilter}:{page:string;onAdd?:()=>void;onFilter?:()=>void}){
  const meta=pageMeta[page];
  return <div className="module-header"><div><div className="eyebrow">Property manager</div><h1>{meta.title}</h1><p>{meta.subtitle}</p></div><div className="module-actions">{onFilter&&<button className="secondary-button" onClick={onFilter}>Filter</button>}{meta.action&&onAdd&&<button className="primary-button" onClick={onAdd}>+ {meta.action}</button>}</div></div>
}

export function Panel({title,kicker,children,action,onAction}:{title:string;kicker?:string;children:ReactNode;action?:string;onAction?:()=>void}){
  return <article className="panel"><div className="panel-head"><div>{kicker&&<span className="panel-kicker">{kicker}</span>}<h2>{title}</h2></div>{action&&(onAction?<button className="ghost-button" onClick={onAction}>{action}<ChevronRight size={14}/></button>:<span className="ghost-button">{action}</span>)}</div>{children}</article>
}

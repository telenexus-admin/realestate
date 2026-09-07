import { useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Clock3, Eye, Filter, LockKeyhole, RotateCcw, Save, Send, ShieldCheck, SlidersHorizontal, Users, X } from 'lucide-react';
import { Status } from './ui';

type QueueItem={id:string,type:string,subject:string,context:string,value:string,risk:'Low'|'Medium'|'High',owner:string,state:'Ready'|'Needs review'|'Blocked'|'Approved'};

const initialQueue:QueueItem[]=[
 {id:'APR-4481',type:'Owner payout',subject:'Wanjiru Holdings',context:'September distribution · 3 properties',value:'KES 1.84M',risk:'High',owner:'Finance',state:'Needs review'},
 {id:'EXP-2218',type:'Vendor invoice',subject:'Kamau Plumbing Ltd',context:'WO-2183 · Greenview Apartments',value:'KES 84,500',risk:'Medium',owner:'Operations',state:'Ready'},
 {id:'DEP-0917',type:'Deposit refund',subject:'Kevin Mwangi',context:'Parkline C-18 · Move-out settlement',value:'KES 58,000',risk:'Medium',owner:'Leasing',state:'Ready'},
 {id:'WOF-0042',type:'Write-off',subject:'Njeri & Co.',context:'Aged arrears · 146 days overdue',value:'KES 126,400',risk:'High',owner:'Collections',state:'Blocked'},
 {id:'REN-7331',type:'Renewal offer',subject:'Mercy Wanjiku',context:'Greenview A-12 · +5% proposed increase',value:'KES 33,600/mo',risk:'Low',owner:'Leasing',state:'Ready'},
];

const savedViews=['My queue','High value >500K','Finance approvals','Blocked by policy'];

export function WorkflowExecutionCenter(){
 const [queue,setQueue]=useState(initialQueue);
 const [selected,setSelected]=useState<string[]>([]);
 const [view,setView]=useState('My queue');
 const [confirm,setConfirm]=useState<{title:string;copy:string;ids:string[];action:'approve'|'send'}|null>(null);
 const [toast,setToast]=useState<string>('');
 const [undo,setUndo]=useState<QueueItem[]|null>(null);
 const [filtersOpen,setFiltersOpen]=useState(false);

 const visible=useMemo(()=>{
  if(view==='High value >500K')return queue.filter(x=>x.value.includes('M'));
  if(view==='Finance approvals')return queue.filter(x=>x.owner==='Finance');
  if(view==='Blocked by policy')return queue.filter(x=>x.state==='Blocked');
  return queue;
 },[queue,view]);
 const allSelected=visible.length>0&&visible.every(x=>selected.includes(x.id));
 const selectedItems=queue.filter(x=>selected.includes(x.id));
 const blockedSelection=selectedItems.some(x=>x.state==='Blocked');
 const selectionValue=selectedItems.map(x=>x.value).join(' · ');

 function toggle(id:string){setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id])}
 function toggleAll(){setSelected(allSelected?selected.filter(id=>!visible.some(x=>x.id===id)):[...new Set([...selected,...visible.map(x=>x.id)])])}
 function apply(action:'approve'|'send',ids:string[]){
  const snapshot=queue;
  setUndo(snapshot);
  setQueue(q=>q.map(item=>ids.includes(item.id)?{...item,state:action==='approve'?'Approved':item.state}:item));
  setSelected([]);setConfirm(null);setToast(action==='approve'?`${ids.length} workflow item${ids.length===1?'':'s'} approved`:`${ids.length} instruction${ids.length===1?'':'s'} sent`);
  window.setTimeout(()=>setToast(''),2600);
 }
 function undoLast(){if(undo){setQueue(undo);setUndo(null);setToast('Last workflow action reverted');window.setTimeout(()=>setToast(''),2200)}}

 return <section className="workflow-execution">
  <div className="workflow-head"><div><span className="panel-kicker">EXECUTION LAYER</span><h2>Workflow control room</h2><p>Review, authorize and execute financial and operational actions with policy checks, segregation of duties and an audit-ready trail.</p></div><div className="workflow-head-actions"><button className="secondary-button" onClick={()=>setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={14}/> Filters</button><button className="secondary-button"><Save size={14}/> Save view</button></div></div>
  <div className="workflow-summary"><div><span>Awaiting action</span><strong>{queue.filter(x=>x.state!=='Approved').length}</strong><small>Across 4 operating teams</small></div><div><span>High-risk value</span><strong>KES 1.97M</strong><small>2 actions need dual approval</small></div><div><span>Policy blocks</span><strong>{queue.filter(x=>x.state==='Blocked').length}</strong><small>Cannot execute without override</small></div><div><span>Median approval time</span><strong>18m</strong><small>Target under 30 minutes</small></div></div>

  <div className="saved-view-row"><div className="saved-views">{savedViews.map(v=><button key={v} className={view===v?'active':''} onClick={()=>{setView(v);setSelected([])}}>{v}</button>)}</div><button className="view-filter"><Filter size={13}/> {visible.length} records <ChevronDown size={13}/></button></div>
  {filtersOpen&&<div className="filter-shelf"><span>Risk</span><button>High</button><button>Medium</button><button>Low</button><i/><span>Owner</span><button>Finance</button><button>Operations</button><button>Leasing</button><button>Collections</button></div>}

  <div className="workflow-table-wrap"><table className="workflow-table"><thead><tr><th><input type="checkbox" checked={allSelected} onChange={toggleAll}/></th><th>Workflow</th><th>Subject / context</th><th>Value</th><th>Risk</th><th>Owner</th><th>Policy state</th><th></th></tr></thead><tbody>{visible.map(item=><tr key={item.id} className={selected.includes(item.id)?'selected':''}><td><input type="checkbox" checked={selected.includes(item.id)} onChange={()=>toggle(item.id)}/></td><td><strong>{item.type}</strong><small>{item.id}</small></td><td><strong>{item.subject}</strong><small>{item.context}</small></td><td><b>{item.value}</b></td><td><span className={`workflow-risk ${item.risk.toLowerCase()}`}>{item.risk}</span></td><td>{item.owner}</td><td><Status value={item.state}/>{item.state==='Blocked'&&<small className="policy-reason"><LockKeyhole size={11}/> SoD conflict</small>}</td><td><button className="row-review"><Eye size={14}/> Review</button></td></tr>)}</tbody></table></div>

  {selected.length>0&&<div className="bulk-action-bar"><div><span>{selected.length} selected</span><strong>{selectionValue}</strong></div><button onClick={()=>setSelected([])}><X size={14}/> Clear</button><button className="secondary-button"><Users size={14}/> Assign</button><button className="secondary-button" onClick={()=>setConfirm({title:'Send selected instructions?',copy:'This will notify the responsible teams and write an execution event to the activity trail.',ids:selected,action:'send'})}><Send size={14}/> Send instruction</button><button disabled={blockedSelection} title={blockedSelection?'Blocked items require policy resolution first':''} className="primary-button" onClick={()=>setConfirm({title:'Approve selected actions?',copy:'You are authorizing these records to move to the next execution stage. High-value transactions may still require a second approver.',ids:selected,action:'approve'})}><Check size={14}/> Approve selected</button></div>}

  <div className="workflow-controls"><div><ShieldCheck size={17}/><p><strong>Execution policy active</strong><span>Transactions above KES 500K require two approvers. Requesters cannot approve their own payouts.</span></p></div><div><Clock3 size={17}/><p><strong>Audit trail</strong><span>Every decision records actor, timestamp, policy result and before/after state.</span></p></div>{undo&&<button onClick={undoLast}><RotateCcw size={14}/> Undo last action</button>}</div>

  {confirm&&<div className="confirm-backdrop"><div className="confirm-dialog"><div className="confirm-icon"><AlertTriangle size={20}/></div><div><span className="panel-kicker">CONFIRM CONTROLLED ACTION</span><h3>{confirm.title}</h3><p>{confirm.copy}</p><div className="confirm-facts"><span>{confirm.ids.length} record{confirm.ids.length===1?'':'s'}</span><span>Audit logging enabled</span><span>Policy re-check on execution</span></div></div><div className="confirm-actions"><button className="secondary-button" onClick={()=>setConfirm(null)}>Cancel</button><button className="primary-button" onClick={()=>apply(confirm.action,confirm.ids)}>{confirm.action==='approve'?'Approve & continue':'Send instruction'}</button></div></div></div>}
  {toast&&<div className="workflow-toast"><CheckCircle2 size={16}/><span>{toast}</span></div>}
 </section>;
}

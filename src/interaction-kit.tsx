import { ReactNode, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, X } from 'lucide-react';

export function StatefulTabs({tabs,initial,children}:{tabs:string[];initial?:string;children:(tab:string)=>ReactNode}){
  const [active,setActive]=useState(initial || tabs[0]);
  return <><div className="entity-tabs stateful-tabs" role="tablist">{tabs.map(tab=><button key={tab} role="tab" aria-selected={active===tab} className={active===tab?'active':''} onClick={()=>setActive(tab)}>{tab}</button>)}</div><div className="tab-stage" key={active}>{children(active)}</div></>;
}

export function ActionMenu({label='Actions',items,onAction}:{label?:string;items:string[];onAction?:(item:string)=>void}){
  const [open,setOpen]=useState(false);
  return <div className="action-menu"><button className="primary-button" onClick={()=>setOpen(!open)}>{label}<ChevronDown size={14}/></button>{open&&<div className="action-popover">{items.map(item=><button key={item} onClick={()=>{onAction?.(item);setOpen(false)}}>{item}</button>)}</div>}</div>;
}

export function Drawer({open,title,subtitle,onClose,children}:{open:boolean;title:string;subtitle?:string;onClose:()=>void;children:ReactNode}){
  if(!open)return null;
  return <><button className="drawer-scrim" aria-label="Close drawer" onClick={onClose}/><aside className="record-drawer"><div className="drawer-head"><div><span className="panel-kicker">Context workspace</span><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose}><X size={17}/></button></div><div className="drawer-body">{children}</div></aside></>;
}

export function Toast({message,onDone}:{message:string;onDone:()=>void}){
  useEffect(()=>{const t=setTimeout(onDone,2200);return()=>clearTimeout(t)},[message,onDone]);
  return <div className="app-toast"><CheckCircle2 size={17}/><span>{message}</span></div>;
}

export function LoadingBlock({label='Loading workspace…'}:{label?:string}){
  return <div className="loading-block"><div className="loading-shimmer"/><span>{label}</span></div>;
}

export function EmptyState({title,copy,action,onAction}:{title:string;copy:string;action?:string;onAction?:()=>void}){
  return <div className="empty-state-premium"><strong>{title}</strong><p>{copy}</p>{action&&<button className="secondary-button" onClick={onAction}>{action}</button>}</div>;
}

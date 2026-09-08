const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export type Session = {
  token: string;
  user: { id: string; name: string; role: string };
  organization: { id: string; name: string };
};

export type AuthSession = {
  id:string;
  user_agent?:string|null;
  ip?:string|null;
  created_at:string;
  last_seen_at:string;
  expires_at:string;
  current:boolean;
};

export type MfaStatus={enabled:boolean;setupPending:boolean;recoveryCodesRemaining:number};
export type MfaSetup={secret:string;otpauthUri:string};

export class ApiError extends Error{
  status:number;
  data:any;
  constructor(message:string,status:number,data:any){super(message);this.name='ApiError';this.status=status;this.data=data;}
}

export type WorkflowAction = {
  id:string;
  action_type:string;
  title:string;
  description?:string|null;
  entity_type?:string|null;
  entity_id?:string|null;
  amount?:string|number|null;
  currency:string;
  risk_level:'low'|'medium'|'high'|'critical';
  department:string;
  status:'draft'|'pending'|'assigned'|'approved'|'rejected'|'executed'|'cancelled'|'blocked';
  policy_state:'clear'|'review'|'blocked';
  policy_reasons:string[];
  requested_by?:string|null;
  assigned_to?:string|null;
  requested_by_name?:string|null;
  assigned_to_name?:string|null;
  approved_by_name?:string|null;
  version:number;
  created_at:string;
  updated_at:string;
};

const TOKEN_KEY = 'propos_access_token';

export function getToken() {return localStorage.getItem(TOKEN_KEY);}
export function setToken(token: string | null) {if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);}

async function refreshSession():Promise<Session|null>{
  try{
    const response=await fetch(`${API_URL}/api/auth/refresh`,{method:'POST',credentials:'include'});
    if(!response.ok){setToken(null);return null;}
    const session=await response.json() as Session;
    setToken(session.token);
    return session;
  }catch{return null;}
}

async function request<T>(path: string, init: RequestInit = {}, allowRefresh=true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers, credentials:'include' });
  if(response.status===401 && allowRefresh && token && !path.startsWith('/api/auth/')){
    const refreshed=await refreshSession();
    if(refreshed)return request<T>(path,init,false);
  }
  if(response.status===204)return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data?.reasons) && data.reasons.length ? `: ${data.reasons.join(', ')}` : '';
    const message=(typeof data?.error === 'string' ? data.error : `Request failed (${response.status})`) + detail;
    throw new ApiError(message,response.status,data);
  }
  return data as T;
}

function idempotencyKey(prefix:string){
  const id=globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

export const api = {
  health: () => request<{ ok: boolean; service: string }>('/health'),
  login: async (email:string,password:string,organizationSlug:string,mfaCode?:string) => {
    const session=await request<Session>('/api/auth/login',{method:'POST',body:JSON.stringify({email,password,organizationSlug,mfaCode})},false);
    setToken(session.token);
    return session;
  },
  devLogin: async (email: string, organizationSlug: string) => {
    const session = await request<Session>('/api/auth/dev-login', {method: 'POST', body: JSON.stringify({ email, organizationSlug })},false);
    setToken(session.token);
    return session;
  },
  refreshSession,
  logout: async()=>{try{await request<void>('/api/auth/logout',{method:'POST'},false);}finally{setToken(null)}},
  logoutAll: async()=>{try{await request<void>('/api/auth/logout-all',{method:'POST'},false);}finally{setToken(null)}},
  sessions:()=>request<AuthSession[]>('/api/auth/sessions'),
  revokeSession:(id:string)=>request<void>(`/api/auth/sessions/${id}`,{method:'DELETE'}),
  mfaStatus:()=>request<MfaStatus>('/api/auth/mfa/status'),
  startMfaSetup:()=>request<MfaSetup>('/api/auth/mfa/setup',{method:'POST',body:'{}'}),
  enableMfa:(code:string)=>request<{enabled:true;recoveryCodes:string[]}>('/api/auth/mfa/enable',{method:'POST',body:JSON.stringify({code})}),
  disableMfa:(password:string,code:string)=>request<{enabled:false}>('/api/auth/mfa/disable',{method:'POST',body:JSON.stringify({password,code})}),
  dashboard: () => request('/api/dashboard'),
  properties: () => request<any[]>('/api/properties'),
  createProperty: (payload: unknown) => request('/api/properties', { method: 'POST', body: JSON.stringify(payload) }),
  units: () => request<any[]>('/api/units'),
  createUnit: (payload: unknown) => request('/api/units', { method: 'POST', body: JSON.stringify(payload) }),
  tenants: () => request<any[]>('/api/tenants'),
  createTenant: (payload: unknown) => request('/api/tenants', { method: 'POST', body: JSON.stringify(payload) }),
  owners: () => request<any[]>('/api/owners'),
  leases: () => request<any[]>('/api/leases'),
  createLease: (payload: unknown) => request('/api/leases', { method: 'POST', body: JSON.stringify(payload) }),
  payments: () => request<any[]>('/api/payments'),
  createPayment: (payload: unknown) => request('/api/payments', { method: 'POST', body: JSON.stringify(payload) }),
  arrears: () => request<any[]>('/api/arrears'),
  maintenance: () => request<any[]>('/api/maintenance'),
  createMaintenance: (payload: unknown) => request('/api/maintenance', { method: 'POST', body: JSON.stringify(payload) }),
  rentRoll: () => request<any[]>('/api/reports/rent-roll'),
  workflows: (params?:{status?:string;assignedTo?:string}) => {
    const queryString=new URLSearchParams();
    if(params?.status)queryString.set('status',params.status);
    if(params?.assignedTo)queryString.set('assignedTo',params.assignedTo);
    const suffix=queryString.toString()?`?${queryString}`:'';
    return request<WorkflowAction[]>(`/api/workflows${suffix}`);
  },
  workflow: (id:string) => request<WorkflowAction & {events:any[]}>(`/api/workflows/${id}`),
  createWorkflow: (payload:unknown) => request<WorkflowAction>('/api/workflows',{method:'POST',body:JSON.stringify(payload)}),
  assignWorkflow: (id:string,assignedTo:string) => request<WorkflowAction>(`/api/workflows/${id}/assign`,{method:'PATCH',body:JSON.stringify({assignedTo})}),
  approveWorkflow: (id:string,expectedVersion?:number,reason?:string) => request<WorkflowAction>(`/api/workflows/${id}/approve`,{method:'POST',headers:{'Idempotency-Key':idempotencyKey(`approve-${id}`)},body:JSON.stringify({expectedVersion,reason})}),
  rejectWorkflow: (id:string,reason:string,expectedVersion?:number) => request<WorkflowAction>(`/api/workflows/${id}/reject`,{method:'POST',headers:{'Idempotency-Key':idempotencyKey(`reject-${id}`)},body:JSON.stringify({reason,expectedVersion})}),
  executeWorkflow: (id:string) => request<WorkflowAction>(`/api/workflows/${id}/execute`,{method:'POST',headers:{'Idempotency-Key':idempotencyKey(`execute-${id}`)},body:'{}'}),
  workflowEvents: (id:string) => request<any[]>(`/api/workflows/${id}/events`),
};

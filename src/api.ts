const API_URL = import.meta.env.VITE_API_URL || '';

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
export type BillingPreview={periodStart:string;periodEnd:string;count:number;total:number;missingReadings:number;ready:boolean;items:any[]};
export type BillingContext={role:string;organization:{name:string;slug:string};user:{first_name:string;last_name:string;email:string};properties:Array<{id:string;name:string}>;canManageBilling:boolean;canManageTeam:boolean};
export type WaterSetting={property_id:string;property_name:string;billing_method:'meter'|'flat'|'shared';rate_per_unit:number;flat_amount:number;shared_amount:number;active:boolean};
export type WaterReading={id?:string;unit_id:string;unit_number:string;property_id:string;property_name:string;billing_method:string;rate_per_unit:number;suggested_previous:number;previous_reading?:number;current_reading?:number;consumption?:number;amount?:number;notes?:string;status?:'submitted'|'approved'|'rejected';rejection_reason?:string};
export type UtilitySetting={id:string;property_id:string;property_name:string;utility_type:'electricity'|'garbage'|'security'|'service_charge'|'other';name:string;billing_method:'meter'|'flat'|'shared';rate_per_unit:number;flat_amount:number;shared_amount:number;active:boolean};
export type UtilityReading={id?:string;setting_id:string;utility_name:string;utility_type:string;unit_id:string;unit_number:string;property_id:string;property_name:string;rate_per_unit:number;suggested_previous:number;previous_reading?:number;current_reading?:number;consumption?:number;amount?:number;notes?:string;status?:'submitted'|'approved'|'rejected';rejection_reason?:string};
export type TenantLifecycle={tenant:any;contacts:any[];kyc:any[];leases:any[];wallet:{balance:number;entries:any[]};paymentPlans:any[];maintenance:any[];documents:any[]};
export type OperatorSummary={organizations:number;active:number;trial:number;suspended:number;users:number;units:number};
export type OperatorOrganization={id:string;name:string;slug:string;status:'trial'|'active'|'suspended'|'closed';plan:string;email?:string|null;phone?:string|null;currency:string;timezone:string;created_at:string;unit_limit:number;trial_ends_at?:string|null;user_count:number;unit_count:number};
export type OrganizationOnboarding={companyName:string;slug:string;companyEmail?:string;companyPhone?:string;plan:'starter'|'growth'|'professional';unitLimit:number;status:'trial'|'active';adminFirstName:string;adminLastName:string;adminEmail:string;adminPhone?:string;temporaryPassword:string};

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
  createTenancy: (payload: unknown) => request('/api/tenancies', { method: 'POST', body: JSON.stringify(payload) }),
  owners: () => request<any[]>('/api/owners'),
  leases: () => request<any[]>('/api/leases'),
  createLease: (payload: unknown) => request('/api/leases', { method: 'POST', body: JSON.stringify(payload) }),
  payments: () => request<any[]>('/api/payments'),
  createPayment: (payload: unknown) => request('/api/payments', { method: 'POST', body: JSON.stringify(payload) }),
  arrears: () => request<any[]>('/api/arrears'),
  maintenance: () => request<any[]>('/api/maintenance'),
  createMaintenance: (payload: unknown) => request('/api/maintenance', { method: 'POST', body: JSON.stringify(payload) }),
  visitors:()=>request<any[]>('/api/visitors'),
  createVisitor:(payload:unknown)=>request('/api/visitors',{method:'POST',body:JSON.stringify(payload)}),
  checkoutVisitor:(id:string)=>request(`/api/visitors/${id}/checkout`,{method:'PATCH',body:'{}'}),
  complaints:()=>request<any[]>('/api/complaints'),
  createComplaint:(payload:unknown)=>request('/api/complaints',{method:'POST',body:JSON.stringify(payload)}),
  updateComplaintStatus:(id:string,status:'open'|'in_progress'|'resolved'|'closed')=>request(`/api/complaints/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}),
  rentRoll: () => request<any[]>('/api/reports/rent-roll'),
  operatorSummary:()=>request<OperatorSummary>('/api/operator/summary'),
  operatorOrganizations:()=>request<OperatorOrganization[]>('/api/operator/organizations'),
  onboardOrganization:(payload:OrganizationOnboarding)=>request<OperatorOrganization>('/api/operator/organizations',{method:'POST',body:JSON.stringify(payload)}),
  updateOrganizationStatus:(id:string,status:'trial'|'active'|'suspended')=>request<OperatorOrganization>(`/api/operator/organizations/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}),
  rentSchedules:()=>request<any[]>('/api/rental/rent-schedules'),
  createRentSchedule:(payload:unknown)=>request('/api/rental/rent-schedules',{method:'POST',body:JSON.stringify(payload)}),
  billingPreview:(periodStart:string,periodEnd:string,propertyId?:string)=>request<BillingPreview>('/api/rental/billing/preview',{method:'POST',body:JSON.stringify({periodStart,periodEnd,propertyId})}),
  postBilling:(periodStart:string,periodEnd:string,propertyId?:string)=>request('/api/rental/billing/post',{method:'POST',body:JSON.stringify({periodStart,periodEnd,propertyId,runKey:idempotencyKey(`billing-${periodStart}-${propertyId||'all'}`)})}),
  billingRuns:()=>request<any[]>('/api/rental/billing/runs'),
  billingContext:()=>request<BillingContext>('/api/rental/billing/context'),
  waterSettings:()=>request<WaterSetting[]>('/api/rental/water-settings'),
  saveWaterSetting:(propertyId:string,payload:{billingMethod:string;ratePerUnit:number;flatAmount:number;sharedAmount:number;active:boolean})=>request(`/api/rental/water-settings/${propertyId}`,{method:'PUT',body:JSON.stringify(payload)}),
  waterReadings:(month:string,propertyId?:string)=>request<WaterReading[]>(`/api/rental/water-readings?${new URLSearchParams({month,...(propertyId?{propertyId}:{})})}`),
  submitWaterReadings:(month:string,readings:Array<{unitId:string;currentReading:number;notes?:string}>)=>request('/api/rental/water-readings',{method:'POST',body:JSON.stringify({month,readings})}),
  approveWaterReading:(id:string)=>request(`/api/rental/water-readings/${id}/approve`,{method:'POST',body:'{}'}),
  rejectWaterReading:(id:string,reason:string)=>request(`/api/rental/water-readings/${id}/reject`,{method:'POST',body:JSON.stringify({reason})}),
  utilitySettings:()=>request<UtilitySetting[]>('/api/rental/utility-settings'),
  createUtilitySetting:(payload:unknown)=>request<UtilitySetting>('/api/rental/utility-settings',{method:'POST',body:JSON.stringify(payload)}),
  updateUtilitySetting:(id:string,payload:unknown)=>request<UtilitySetting>(`/api/rental/utility-settings/${id}`,{method:'PUT',body:JSON.stringify(payload)}),
  utilityReadings:(month:string,propertyId?:string)=>request<UtilityReading[]>(`/api/rental/utility-readings?${new URLSearchParams({month,...(propertyId?{propertyId}:{})})}`),
  submitUtilityReadings:(month:string,readings:Array<{settingId:string;unitId:string;currentReading:number;notes?:string}>)=>request('/api/rental/utility-readings',{method:'POST',body:JSON.stringify({month,readings})}),
  approveUtilityReading:(id:string)=>request(`/api/rental/utility-readings/${id}/approve`,{method:'POST',body:'{}'}),
  rejectUtilityReading:(id:string,reason:string)=>request(`/api/rental/utility-readings/${id}/reject`,{method:'POST',body:JSON.stringify({reason})}),
  invoices:()=>request<any[]>('/api/rental/invoices'),
  shareInvoice:(id:string,channel:'whatsapp'|'sms'|'email')=>request<{actionUrl:string;message:string;status:string}>(`/api/rental/invoices/${id}/share`,{method:'POST',body:JSON.stringify({channel})}),
  team:()=>request<any[]>('/api/team'),
  createCaretaker:(payload:{firstName:string;lastName:string;email:string;phone:string;temporaryPassword:string;propertyIds:string[]})=>request('/api/team/caretakers',{method:'POST',body:JSON.stringify(payload)}),
  tenantLifecycle:(tenantId:string)=>request<TenantLifecycle>(`/api/rental/tenant/${tenantId}/lifecycle`),
  tenantContacts:(tenantId:string)=>request<any[]>(`/api/rental/tenant/${tenantId}/contacts`),
  createTenantContact:(tenantId:string,payload:unknown)=>request(`/api/rental/tenant/${tenantId}/contacts`,{method:'POST',body:JSON.stringify(payload)}),
  tenantKyc:(tenantId:string)=>request<any[]>(`/api/rental/tenant/${tenantId}/kyc`),
  createTenantKyc:(tenantId:string,payload:unknown)=>request(`/api/rental/tenant/${tenantId}/kyc`,{method:'POST',body:JSON.stringify(payload)}),
  tenantWallet:(tenantId:string)=>request<{balance:number;entries:any[]}>(`/api/rental/tenant/${tenantId}/wallet`),
  createWalletEntry:(tenantId:string,payload:unknown)=>request(`/api/rental/tenant/${tenantId}/wallet`,{method:'POST',body:JSON.stringify(payload)}),
  tenantPaymentPlans:(tenantId:string)=>request<any[]>(`/api/rental/tenant/${tenantId}/payment-plans`),
  createPaymentPlan:(tenantId:string,payload:unknown)=>request(`/api/rental/tenant/${tenantId}/payment-plans`,{method:'POST',body:JSON.stringify(payload)}),
  leaseParties:(leaseId:string)=>request<any[]>(`/api/rental/lease/${leaseId}/parties`),
  createLeaseParty:(leaseId:string,payload:unknown)=>request(`/api/rental/lease/${leaseId}/parties`,{method:'POST',body:JSON.stringify(payload)}),
  leaseAmendments:(leaseId:string)=>request<any[]>(`/api/rental/lease/${leaseId}/amendments`),
  createLeaseAmendment:(leaseId:string,payload:unknown)=>request(`/api/rental/lease/${leaseId}/amendments`,{method:'POST',body:JSON.stringify(payload)}),
  turnovers:()=>request<any[]>('/api/rental/turnovers'),
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

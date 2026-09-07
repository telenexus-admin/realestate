const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export type Session = {
  token: string;
  user: { id: string; name: string; role: string };
  organization: { id: string; name: string };
};

const TOKEN_KEY = 'propos_access_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean; service: string }>('/health'),
  devLogin: async (email: string, organizationSlug: string) => {
    const session = await request<Session>('/api/auth/dev-login', {
      method: 'POST', body: JSON.stringify({ email, organizationSlug }),
    });
    setToken(session.token);
    return session;
  },
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
};

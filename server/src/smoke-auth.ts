const base=process.env.SMOKE_API_URL || 'http://127.0.0.1:4000';

function ensure(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
async function body(response:Response){return response.json().catch(()=>({}));}

const login=await fetch(`${base}/api/auth/dev-login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'alex@alpha.test',organizationSlug:'alpha-properties'})});
const first=await body(login) as any;
ensure(login.ok,`development sign-in failed: ${login.status}`);
ensure(typeof first.token==='string','access token missing');
const initialCookie=login.headers.get('set-cookie');
ensure(initialCookie,'refresh cookie missing');
const cookie=initialCookie.split(';')[0];

const protectedRequest=await fetch(`${base}/api/dashboard`,{headers:{Authorization:`Bearer ${first.token}`}});
ensure(protectedRequest.ok,`protected route rejected access token: ${protectedRequest.status}`);

const refresh=await fetch(`${base}/api/auth/refresh`,{method:'POST',headers:{Cookie:cookie}});
const second=await body(refresh) as any;
ensure(refresh.ok,`refresh failed: ${refresh.status}`);
ensure(second.token&&second.token!==first.token,'access token was not rotated');
const nextCookieHeader=refresh.headers.get('set-cookie');
ensure(nextCookieHeader,'rotated refresh cookie missing');
const nextCookie=nextCookieHeader.split(';')[0];

const stale=await fetch(`${base}/api/dashboard`,{headers:{Authorization:`Bearer ${first.token}`}});
ensure(stale.status===401,'old access session remained valid after rotation');

const sessions=await fetch(`${base}/api/auth/sessions`,{headers:{Authorization:`Bearer ${second.token}`}});
const sessionRows=await body(sessions) as any[];
ensure(sessions.ok,'session listing failed');
ensure(Array.isArray(sessionRows)&&sessionRows.some(x=>x.current===true),'current session not identified');

const logout=await fetch(`${base}/api/auth/logout`,{method:'POST',headers:{Cookie:nextCookie}});
ensure(logout.status===204,`logout failed: ${logout.status}`);
const revoked=await fetch(`${base}/api/dashboard`,{headers:{Authorization:`Bearer ${second.token}`}});
ensure(revoked.status===401,'revoked session still accepted');

console.log('Auth smoke test passed');

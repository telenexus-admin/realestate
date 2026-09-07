import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import 'dotenv/config';
import { query, withTransaction } from './db.js';

type AuthUser = { userId: string; organizationId: string; role: string };
type AuthedRequest = Request & { auth?: AuthUser };

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret';

function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const bearer = req.headers.authorization;
  if (!bearer?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.auth = jwt.verify(bearer.slice(7), JWT_SECRET) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function tenantId(req: AuthedRequest) {
  if (!req.auth?.organizationId) throw new Error('Organization context missing');
  return req.auth.organizationId;
}

app.get('/health', async (_req, res) => {
  try { await query('SELECT 1'); res.json({ ok: true, service: 'polyizon-propos-api' }); }
  catch { res.status(503).json({ ok: false, service: 'polyizon-propos-api' }); }
});

app.post('/api/auth/dev-login', async (req, res) => {
  const input = z.object({ email: z.string().email(), organizationSlug: z.string().min(1) }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: input.error.flatten() });
  const found = await query<{ user_id:string; organization_id:string; role:string; first_name:string; last_name:string; organization_name:string }>(`
    SELECT u.id user_id, ou.organization_id, ou.role, u.first_name, u.last_name, o.name organization_name
    FROM users u JOIN organization_users ou ON ou.user_id=u.id JOIN organizations o ON o.id=ou.organization_id
    WHERE lower(u.email)=lower($1) AND o.slug=$2 LIMIT 1`, [input.data.email, input.data.organizationSlug]);
  if (!found.rowCount) return res.status(404).json({ error: 'User or organization not found' });
  const row = found.rows[0];
  const token = jwt.sign({ userId:row.user_id, organizationId:row.organization_id, role:row.role }, JWT_SECRET, { expiresIn:'12h' });
  res.json({ token, user:{ id:row.user_id, name:`${row.first_name} ${row.last_name}`, role:row.role }, organization:{ id:row.organization_id, name:row.organization_name } });
});

app.use('/api', auth);

app.get('/api/dashboard', async (req: AuthedRequest, res) => {
  const org = tenantId(req);
  const [units, occupied, properties, outstanding, collection, maintenance, expiring] = await Promise.all([
    query<{count:string}>('SELECT count(*) FROM units WHERE organization_id=$1 AND status<>\'inactive\'', [org]),
    query<{count:string}>('SELECT count(*) FROM units WHERE organization_id=$1 AND status=\'occupied\'', [org]),
    query<{count:string}>('SELECT count(*) FROM properties WHERE organization_id=$1 AND status=\'active\'', [org]),
    query<{total:string}>('SELECT coalesce(sum(total-paid_amount),0)::text total FROM invoices WHERE organization_id=$1 AND status IN (\'issued\',\'partial\',\'overdue\')', [org]),
    query<{total:string}>('SELECT coalesce(sum(amount),0)::text total FROM payments WHERE organization_id=$1 AND status=\'posted\' AND paid_at >= date_trunc(\'month\',now())', [org]),
    query<{count:string}>('SELECT count(*) FROM maintenance_requests WHERE organization_id=$1 AND status NOT IN (\'closed\',\'completed\',\'cancelled\')', [org]),
    query<{count:string}>('SELECT count(*) FROM leases WHERE organization_id=$1 AND status IN (\'active\',\'expiring\') AND end_date BETWEEN current_date AND current_date+30', [org]),
  ]);
  const totalUnits=Number(units.rows[0].count), occupiedUnits=Number(occupied.rows[0].count);
  res.json({ properties:Number(properties.rows[0].count), units:totalUnits, occupied:occupiedUnits, occupancyRate:totalUnits?Math.round((occupiedUnits/totalUnits)*1000)/10:0, outstanding:Number(outstanding.rows[0].total), collectedThisMonth:Number(collection.rows[0].total), openMaintenance:Number(maintenance.rows[0].count), expiringLeases:Number(expiring.rows[0].count) });
});

app.get('/api/properties', async (req: AuthedRequest, res) => {
  const result=await query(`SELECT p.*, po.name owner_name, count(u.id)::int unit_count,
    count(u.id) FILTER (WHERE u.status='occupied')::int occupied_count
    FROM properties p LEFT JOIN property_owners po ON po.id=p.owner_id
    LEFT JOIN units u ON u.property_id=p.id
    WHERE p.organization_id=$1 GROUP BY p.id,po.name ORDER BY p.created_at DESC`,[tenantId(req)]);
  res.json(result.rows);
});

app.post('/api/properties', async (req: AuthedRequest, res) => {
  const input=z.object({ name:z.string().min(2), code:z.string().min(1).optional(), propertyType:z.string().default('residential'), ownerId:z.string().uuid().optional(), address:z.string().optional(), city:z.string().optional(), county:z.string().optional() }).safeParse(req.body);
  if(!input.success) return res.status(400).json({error:input.error.flatten()});
  const d=input.data, result=await query(`INSERT INTO properties(organization_id,owner_id,name,code,property_type,address,city,county) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[tenantId(req),d.ownerId||null,d.name,d.code||null,d.propertyType,d.address||null,d.city||null,d.county||null]);
  res.status(201).json(result.rows[0]);
});

app.get('/api/units', async (req: AuthedRequest, res) => {
  const result=await query(`SELECT u.*,p.name property_name,b.name building_name,rt.first_name||' '||rt.last_name tenant_name,l.monthly_rent current_rent
    FROM units u JOIN properties p ON p.id=u.property_id LEFT JOIN buildings b ON b.id=u.building_id
    LEFT JOIN leases l ON l.unit_id=u.id AND l.status IN ('active','expiring') LEFT JOIN rental_tenants rt ON rt.id=l.tenant_id
    WHERE u.organization_id=$1 ORDER BY p.name,u.unit_number`,[tenantId(req)]);
  res.json(result.rows);
});

app.post('/api/units', async (req: AuthedRequest, res) => {
  const input=z.object({ propertyId:z.string().uuid(), buildingId:z.string().uuid().optional(), unitNumber:z.string().min(1), unitType:z.string().default('apartment'), bedrooms:z.number().int().nonnegative().optional(), marketRent:z.number().nonnegative().default(0), depositAmount:z.number().nonnegative().default(0) }).safeParse(req.body);
  if(!input.success) return res.status(400).json({error:input.error.flatten()});
  const d=input.data, result=await query(`INSERT INTO units(organization_id,property_id,building_id,unit_number,unit_type,bedrooms,market_rent,deposit_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[tenantId(req),d.propertyId,d.buildingId||null,d.unitNumber,d.unitType,d.bedrooms??null,d.marketRent,d.depositAmount]);
  res.status(201).json(result.rows[0]);
});

app.get('/api/tenants', async (req: AuthedRequest, res) => {
  const result=await query(`SELECT rt.*,l.lease_number,l.monthly_rent,l.end_date,u.unit_number,p.name property_name,
    coalesce(sum(i.total-i.paid_amount) FILTER (WHERE i.status IN ('issued','partial','overdue')),0) balance
    FROM rental_tenants rt LEFT JOIN leases l ON l.tenant_id=rt.id AND l.status IN ('active','expiring')
    LEFT JOIN units u ON u.id=l.unit_id LEFT JOIN properties p ON p.id=u.property_id LEFT JOIN invoices i ON i.tenant_id=rt.id
    WHERE rt.organization_id=$1 GROUP BY rt.id,l.lease_number,l.monthly_rent,l.end_date,u.unit_number,p.name ORDER BY rt.first_name,rt.last_name`,[tenantId(req)]);
  res.json(result.rows);
});

app.post('/api/tenants', async (req: AuthedRequest, res) => {
  const input=z.object({ firstName:z.string().min(1), lastName:z.string().min(1), phone:z.string().min(6), email:z.string().email().optional(), nationalId:z.string().optional() }).safeParse(req.body);
  if(!input.success) return res.status(400).json({error:input.error.flatten()});
  const d=input.data,result=await query(`INSERT INTO rental_tenants(organization_id,first_name,last_name,phone,email,national_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[tenantId(req),d.firstName,d.lastName,d.phone,d.email||null,d.nationalId||null]);
  res.status(201).json(result.rows[0]);
});

app.get('/api/leases', async (req: AuthedRequest, res) => {
  const result=await query(`SELECT l.*,rt.first_name||' '||rt.last_name tenant_name,u.unit_number,p.name property_name FROM leases l JOIN rental_tenants rt ON rt.id=l.tenant_id JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id WHERE l.organization_id=$1 ORDER BY l.end_date`,[tenantId(req)]);
  res.json(result.rows);
});

app.post('/api/leases', async (req: AuthedRequest, res) => {
  const input=z.object({ unitId:z.string().uuid(), tenantId:z.string().uuid(), leaseNumber:z.string().min(2), startDate:z.string(), endDate:z.string(), monthlyRent:z.number().positive(), depositAmount:z.number().nonnegative().default(0), dueDay:z.number().int().min(1).max(28).default(5) }).safeParse(req.body);
  if(!input.success) return res.status(400).json({error:input.error.flatten()});
  const d=input.data;
  const result=await withTransaction(async client=>{
    const unit=await client.query('SELECT id FROM units WHERE id=$1 AND organization_id=$2 FOR UPDATE',[d.unitId,tenantId(req)]);
    if(!unit.rowCount) throw new Error('Unit not found');
    const lease=await client.query(`INSERT INTO leases(organization_id,unit_id,tenant_id,lease_number,start_date,end_date,monthly_rent,deposit_amount,due_day,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active') RETURNING *`,[tenantId(req),d.unitId,d.tenantId,d.leaseNumber,d.startDate,d.endDate,d.monthlyRent,d.depositAmount,d.dueDay]);
    await client.query("UPDATE units SET status='occupied' WHERE id=$1",[d.unitId]);
    return lease.rows[0];
  });
  res.status(201).json(result);
});

app.get('/api/payments', async (req: AuthedRequest, res) => {
  const result=await query(`SELECT p.*,rt.first_name||' '||rt.last_name tenant_name FROM payments p LEFT JOIN rental_tenants rt ON rt.id=p.tenant_id WHERE p.organization_id=$1 ORDER BY p.paid_at DESC LIMIT 250`,[tenantId(req)]);
  res.json(result.rows);
});

app.post('/api/payments', async (req: AuthedRequest, res) => {
  const input=z.object({ tenantId:z.string().uuid().optional(), reference:z.string().min(2), paymentMethod:z.enum(['mpesa','bank','card','cash','cheque','wallet','adjustment']), amount:z.number().positive(), paidAt:z.string().optional() }).safeParse(req.body);
  if(!input.success) return res.status(400).json({error:input.error.flatten()});
  const d=input.data,result=await query(`INSERT INTO payments(organization_id,tenant_id,reference,payment_method,amount,paid_at,status) VALUES($1,$2,$3,$4,$5,coalesce($6::timestamptz,now()),'posted') RETURNING *`,[tenantId(req),d.tenantId||null,d.reference,d.paymentMethod,d.amount,d.paidAt||null]);
  res.status(201).json(result.rows[0]);
});

app.get('/api/arrears', async (req: AuthedRequest, res) => {
  const result=await query(`SELECT i.id,i.invoice_number,i.due_date,(current_date-i.due_date) age_days,(i.total-i.paid_amount) balance,rt.first_name||' '||rt.last_name tenant_name,u.unit_number,p.name property_name FROM invoices i JOIN rental_tenants rt ON rt.id=i.tenant_id LEFT JOIN leases l ON l.id=i.lease_id LEFT JOIN units u ON u.id=l.unit_id LEFT JOIN properties p ON p.id=u.property_id WHERE i.organization_id=$1 AND i.status IN ('issued','partial','overdue') AND i.total>i.paid_amount ORDER BY age_days DESC,balance DESC`,[tenantId(req)]);
  res.json(result.rows);
});

app.get('/api/maintenance', async (req: AuthedRequest, res) => {
  const result=await query(`SELECT m.*,p.name property_name,u.unit_number,v.name vendor_name FROM maintenance_requests m JOIN properties p ON p.id=m.property_id LEFT JOIN units u ON u.id=m.unit_id LEFT JOIN vendors v ON v.id=m.vendor_id WHERE m.organization_id=$1 ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,m.created_at DESC`,[tenantId(req)]);
  res.json(result.rows);
});

app.post('/api/maintenance', async (req: AuthedRequest, res) => {
  const input=z.object({ propertyId:z.string().uuid(), unitId:z.string().uuid().optional(), tenantId:z.string().uuid().optional(), requestNumber:z.string().min(2), title:z.string().min(3), description:z.string().optional(), category:z.string().optional(), priority:z.enum(['low','medium','high','urgent']).default('medium') }).safeParse(req.body);
  if(!input.success) return res.status(400).json({error:input.error.flatten()});
  const d=input.data,result=await query(`INSERT INTO maintenance_requests(organization_id,property_id,unit_id,tenant_id,request_number,title,description,category,priority) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[tenantId(req),d.propertyId,d.unitId||null,d.tenantId||null,d.requestNumber,d.title,d.description||null,d.category||null,d.priority]);
  res.status(201).json(result.rows[0]);
});

app.get('/api/owners', async (req: AuthedRequest, res) => {
  const result=await query(`SELECT po.*,count(distinct p.id)::int property_count,count(u.id)::int unit_count FROM property_owners po LEFT JOIN properties p ON p.owner_id=po.id LEFT JOIN units u ON u.property_id=p.id WHERE po.organization_id=$1 GROUP BY po.id ORDER BY po.name`,[tenantId(req)]);
  res.json(result.rows);
});

app.get('/api/reports/rent-roll', async (req: AuthedRequest, res) => {
  const result=await query(`SELECT p.name property,u.unit_number,rt.first_name||' '||rt.last_name tenant,l.lease_number,l.monthly_rent,l.end_date,coalesce(sum(i.total-i.paid_amount) FILTER(WHERE i.status IN ('issued','partial','overdue')),0) balance FROM leases l JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id JOIN rental_tenants rt ON rt.id=l.tenant_id LEFT JOIN invoices i ON i.lease_id=l.id WHERE l.organization_id=$1 AND l.status IN ('active','expiring') GROUP BY p.name,u.unit_number,rt.first_name,rt.last_name,l.lease_number,l.monthly_rent,l.end_date ORDER BY p.name,u.unit_number`,[tenantId(req)]);
  res.json(result.rows);
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
});

app.listen(PORT, () => console.log(`Polyizon PropOS API listening on :${PORT}`));

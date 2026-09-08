import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import 'dotenv/config';
import { query, withTransaction } from './db.js';
import workflowRouter from './workflow-routes.js';
import rentalRouter from './rental-routes.js';
import authRouter, { auth, requirePermission, type AuthedRequest } from './auth.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.PORT || 4000);

function tenantId(req: AuthedRequest) {
  if (!req.auth?.organizationId) throw new Error('Organization context missing');
  return req.auth.organizationId;
}
function propertyScope(req:AuthedRequest){return req.auth?.propertyScope || [];}
function propertyAllowed(req:AuthedRequest,propertyId:string){const scope=propertyScope(req);return scope.length===0||scope.includes(propertyId);}

app.get('/health', async (_req, res) => {
  try { await query('SELECT 1'); res.json({ ok: true, service: 'polyizon-propos-api' }); }
  catch { res.status(503).json({ ok: false, service: 'polyizon-propos-api' }); }
});

app.use('/api/auth', authRouter);
app.use('/api', auth);
app.use('/api', workflowRouter);
app.use('/api', rentalRouter);

app.get('/api/dashboard', async (req: AuthedRequest, res) => {
  const org = tenantId(req), scope=propertyScope(req);
  const [units, occupied, properties, outstanding, collection, maintenance, expiring] = await Promise.all([
    query<{count:string}>(`SELECT count(*) FROM units WHERE organization_id=$1 AND status<>'inactive' AND (cardinality($2::uuid[])=0 OR property_id=ANY($2::uuid[]))`, [org,scope]),
    query<{count:string}>(`SELECT count(*) FROM units WHERE organization_id=$1 AND status='occupied' AND (cardinality($2::uuid[])=0 OR property_id=ANY($2::uuid[]))`, [org,scope]),
    query<{count:string}>(`SELECT count(*) FROM properties WHERE organization_id=$1 AND status='active' AND (cardinality($2::uuid[])=0 OR id=ANY($2::uuid[]))`, [org,scope]),
    query<{total:string}>(`SELECT coalesce(sum(i.total-i.paid_amount),0)::text total FROM invoices i LEFT JOIN leases l ON l.id=i.lease_id LEFT JOIN units u ON u.id=l.unit_id WHERE i.organization_id=$1 AND i.status IN ('issued','partial','overdue') AND (cardinality($2::uuid[])=0 OR u.property_id=ANY($2::uuid[]))`, [org,scope]),
    query<{total:string}>(`SELECT coalesce(sum(p.amount),0)::text total FROM payments p WHERE p.organization_id=$1 AND p.status='posted' AND p.paid_at>=date_trunc('month',now()) AND (cardinality($2::uuid[])=0 OR p.tenant_id IN (SELECT l.tenant_id FROM leases l JOIN units u ON u.id=l.unit_id WHERE l.organization_id=$1 AND u.property_id=ANY($2::uuid[])))`, [org,scope]),
    query<{count:string}>(`SELECT count(*) FROM maintenance_requests WHERE organization_id=$1 AND status NOT IN ('closed','completed','cancelled') AND (cardinality($2::uuid[])=0 OR property_id=ANY($2::uuid[]))`, [org,scope]),
    query<{count:string}>(`SELECT count(*) FROM leases l JOIN units u ON u.id=l.unit_id WHERE l.organization_id=$1 AND l.status IN ('active','expiring') AND l.end_date BETWEEN current_date AND current_date+30 AND (cardinality($2::uuid[])=0 OR u.property_id=ANY($2::uuid[]))`, [org,scope]),
  ]);
  const totalUnits=Number(units.rows[0].count), occupiedUnits=Number(occupied.rows[0].count);
  res.json({ properties:Number(properties.rows[0].count), units:totalUnits, occupied:occupiedUnits, occupancyRate:totalUnits?Math.round((occupiedUnits/totalUnits)*1000)/10:0, outstanding:Number(outstanding.rows[0].total), collectedThisMonth:Number(collection.rows[0].total), openMaintenance:Number(maintenance.rows[0].count), expiringLeases:Number(expiring.rows[0].count), scoped:scope.length>0 });
});

app.get('/api/properties', async (req: AuthedRequest, res) => {
  const scope=propertyScope(req);
  const result=await query(`SELECT p.*, po.name owner_name, count(u.id)::int unit_count,
    count(u.id) FILTER (WHERE u.status='occupied')::int occupied_count
    FROM properties p LEFT JOIN property_owners po ON po.id=p.owner_id
    LEFT JOIN units u ON u.property_id=p.id
    WHERE p.organization_id=$1 AND (cardinality($2::uuid[])=0 OR p.id=ANY($2::uuid[])) GROUP BY p.id,po.name ORDER BY p.created_at DESC`,[tenantId(req),scope]);
  res.json(result.rows);
});

app.post('/api/properties', requirePermission('property.write'), async (req: AuthedRequest, res) => {
  if(propertyScope(req).length>0)return res.status(403).json({error:'Scoped users cannot create portfolio-level properties'});
  const input=z.object({ name:z.string().min(2), code:z.string().min(1).optional(), propertyType:z.string().default('residential'), ownerId:z.string().uuid().optional(), address:z.string().optional(), city:z.string().optional(), county:z.string().optional() }).safeParse(req.body);
  if(!input.success) return res.status(400).json({error:input.error.flatten()});
  const d=input.data, result=await query(`INSERT INTO properties(organization_id,owner_id,name,code,property_type,address,city,county) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[tenantId(req),d.ownerId||null,d.name,d.code||null,d.propertyType,d.address||null,d.city||null,d.county||null]);
  res.status(201).json(result.rows[0]);
});

app.get('/api/units', async (req: AuthedRequest, res) => {
  const scope=propertyScope(req);
  const result=await query(`SELECT u.*,p.name property_name,b.name building_name,rt.first_name||' '||rt.last_name tenant_name,l.monthly_rent current_rent
    FROM units u JOIN properties p ON p.id=u.property_id LEFT JOIN buildings b ON b.id=u.building_id
    LEFT JOIN leases l ON l.unit_id=u.id AND l.status IN ('active','expiring') LEFT JOIN rental_tenants rt ON rt.id=l.tenant_id
    WHERE u.organization_id=$1 AND (cardinality($2::uuid[])=0 OR u.property_id=ANY($2::uuid[])) ORDER BY p.name,u.unit_number`,[tenantId(req),scope]);
  res.json(result.rows);
});

app.post('/api/units', requirePermission('property.write'), async (req: AuthedRequest, res) => {
  const input=z.object({ propertyId:z.string().uuid(), buildingId:z.string().uuid().optional(), unitNumber:z.string().min(1), unitType:z.string().default('apartment'), bedrooms:z.number().int().nonnegative().optional(), marketRent:z.number().nonnegative().default(0), depositAmount:z.number().nonnegative().default(0) }).safeParse(req.body);
  if(!input.success) return res.status(400).json({error:input.error.flatten()});
  const d=input.data;
  if(!propertyAllowed(req,d.propertyId))return res.status(403).json({error:'Property is outside your assigned scope'});
  const property=await query(`SELECT id FROM properties WHERE id=$1 AND organization_id=$2`,[d.propertyId,tenantId(req)]);
  if(!property.rowCount)return res.status(404).json({error:'Property not found'});
  const result=await query(`INSERT INTO units(organization_id,property_id,building_id,unit_number,unit_type,bedrooms,market_rent,deposit_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[tenantId(req),d.propertyId,d.buildingId||null,d.unitNumber,d.unitType,d.bedrooms??null,d.marketRent,d.depositAmount]);
  res.status(201).json(result.rows[0]);
});

app.get('/api/tenants', async (req: AuthedRequest, res) => {
  const scope=propertyScope(req);
  const result=await query(`SELECT rt.*,l.lease_number,l.monthly_rent,l.end_date,u.unit_number,p.name property_name,
    coalesce(sum(i.total-i.paid_amount) FILTER (WHERE i.status IN ('issued','partial','overdue')),0) balance
    FROM rental_tenants rt LEFT JOIN leases l ON l.tenant_id=rt.id AND l.status IN ('active','expiring')
    LEFT JOIN units u ON u.id=l.unit_id LEFT JOIN properties p ON p.id=u.property_id LEFT JOIN invoices i ON i.tenant_id=rt.id
    WHERE rt.organization_id=$1 AND (cardinality($2::uuid[])=0 OR p.id=ANY($2::uuid[])) GROUP BY rt.id,l.lease_number,l.monthly_rent,l.end_date,u.unit_number,p.name ORDER BY rt.first_name,rt.last_name`,[tenantId(req),scope]);
  res.json(result.rows);
});

app.post('/api/tenants', requirePermission('tenant.write'), async (req: AuthedRequest, res) => {
  const input=z.object({ firstName:z.string().min(1), lastName:z.string().min(1), phone:z.string().min(6), email:z.string().email().optional(), nationalId:z.string().optional() }).safeParse(req.body);
  if(!input.success) return res.status(400).json({error:input.error.flatten()});
  const d=input.data,result=await query(`INSERT INTO rental_tenants(organization_id,first_name,last_name,phone,email,national_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[tenantId(req),d.firstName,d.lastName,d.phone,d.email||null,d.nationalId||null]);
  res.status(201).json(result.rows[0]);
});

app.get('/api/leases', async (req: AuthedRequest, res) => {
  const scope=propertyScope(req);
  const result=await query(`SELECT l.*,rt.first_name||' '||rt.last_name tenant_name,u.unit_number,p.name property_name FROM leases l JOIN rental_tenants rt ON rt.id=l.tenant_id JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id WHERE l.organization_id=$1 AND (cardinality($2::uuid[])=0 OR p.id=ANY($2::uuid[])) ORDER BY l.end_date`,[tenantId(req),scope]);
  res.json(result.rows);
});

app.post('/api/leases', requirePermission('lease.write'), async (req: AuthedRequest, res) => {
  const input=z.object({ unitId:z.string().uuid(), tenantId:z.string().uuid(), leaseNumber:z.string().min(2), startDate:z.string(), endDate:z.string(), monthlyRent:z.number().positive(), depositAmount:z.number().nonnegative().default(0), dueDay:z.number().int().min(1).max(28).default(5) }).safeParse(req.body);
  if(!input.success) return res.status(400).json({error:input.error.flatten()});
  const d=input.data;
  const result=await withTransaction(async client=>{
    const unit=await client.query<{id:string;property_id:string}>('SELECT id,property_id FROM units WHERE id=$1 AND organization_id=$2 FOR UPDATE',[d.unitId,tenantId(req)]);
    if(!unit.rowCount) throw Object.assign(new Error('Unit not found'),{status:404});
    if(!propertyAllowed(req,unit.rows[0].property_id))throw Object.assign(new Error('Unit is outside your assigned property scope'),{status:403});
    const tenant=await client.query('SELECT id FROM rental_tenants WHERE id=$1 AND organization_id=$2',[d.tenantId,tenantId(req)]);
    if(!tenant.rowCount)throw Object.assign(new Error('Tenant not found'),{status:404});
    const lease=await client.query(`INSERT INTO leases(organization_id,unit_id,tenant_id,lease_number,start_date,end_date,monthly_rent,deposit_amount,due_day,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active') RETURNING *`,[tenantId(req),d.unitId,d.tenantId,d.leaseNumber,d.startDate,d.endDate,d.monthlyRent,d.depositAmount,d.dueDay]);
    await client.query("UPDATE units SET status='occupied' WHERE id=$1",[d.unitId]);
    return lease.rows[0];
  });
  res.status(201).json(result);
});

app.get('/api/payments', async (req: AuthedRequest, res) => {
  const scope=propertyScope(req);
  const result=await query(`SELECT p.*,rt.first_name||' '||rt.last_name tenant_name FROM payments p LEFT JOIN rental_tenants rt ON rt.id=p.tenant_id WHERE p.organization_id=$1 AND (cardinality($2::uuid[])=0 OR p.tenant_id IN (SELECT l.tenant_id FROM leases l JOIN units u ON u.id=l.unit_id WHERE l.organization_id=$1 AND u.property_id=ANY($2::uuid[]))) ORDER BY p.paid_at DESC LIMIT 250`,[tenantId(req),scope]);
  res.json(result.rows);
});

app.post('/api/payments', requirePermission('finance.write'), async (req: AuthedRequest, res) => {
  const input=z.object({ tenantId:z.string().uuid().optional(), reference:z.string().min(2), paymentMethod:z.enum(['mpesa','bank','card','cash','cheque','wallet','adjustment']), amount:z.number().positive(), paidAt:z.string().optional() }).safeParse(req.body);
  if(!input.success) return res.status(400).json({error:input.error.flatten()});
  const d=input.data;
  if(d.tenantId && propertyScope(req).length>0){
    const allowed=await query(`SELECT 1 FROM leases l JOIN units u ON u.id=l.unit_id WHERE l.organization_id=$1 AND l.tenant_id=$2 AND u.property_id=ANY($3::uuid[]) LIMIT 1`,[tenantId(req),d.tenantId,propertyScope(req)]);
    if(!allowed.rowCount)return res.status(403).json({error:'Tenant is outside your assigned property scope'});
  }
  const result=await query(`INSERT INTO payments(organization_id,tenant_id,reference,payment_method,amount,paid_at,status) VALUES($1,$2,$3,$4,$5,coalesce($6::timestamptz,now()),'posted') RETURNING *`,[tenantId(req),d.tenantId||null,d.reference,d.paymentMethod,d.amount,d.paidAt||null]);
  res.status(201).json(result.rows[0]);
});

app.get('/api/arrears', async (req: AuthedRequest, res) => {
  const scope=propertyScope(req);
  const result=await query(`SELECT i.id,i.invoice_number,i.due_date,(current_date-i.due_date) age_days,(i.total-i.paid_amount) balance,rt.first_name||' '||rt.last_name tenant_name,u.unit_number,p.name property_name FROM invoices i JOIN rental_tenants rt ON rt.id=i.tenant_id LEFT JOIN leases l ON l.id=i.lease_id LEFT JOIN units u ON u.id=l.unit_id LEFT JOIN properties p ON p.id=u.property_id WHERE i.organization_id=$1 AND i.status IN ('issued','partial','overdue') AND i.total>i.paid_amount AND (cardinality($2::uuid[])=0 OR p.id=ANY($2::uuid[])) ORDER BY age_days DESC,balance DESC`,[tenantId(req),scope]);
  res.json(result.rows);
});

app.get('/api/maintenance', async (req: AuthedRequest, res) => {
  const scope=propertyScope(req);
  const result=await query(`SELECT m.*,p.name property_name,u.unit_number,v.name vendor_name FROM maintenance_requests m JOIN properties p ON p.id=m.property_id LEFT JOIN units u ON u.id=m.unit_id LEFT JOIN vendors v ON v.id=m.vendor_id WHERE m.organization_id=$1 AND (cardinality($2::uuid[])=0 OR m.property_id=ANY($2::uuid[])) ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,m.created_at DESC`,[tenantId(req),scope]);
  res.json(result.rows);
});

app.post('/api/maintenance', requirePermission('maintenance.write'), async (req: AuthedRequest, res) => {
  const input=z.object({ propertyId:z.string().uuid(), unitId:z.string().uuid().optional(), tenantId:z.string().uuid().optional(), requestNumber:z.string().min(2), title:z.string().min(3), description:z.string().optional(), category:z.string().optional(), priority:z.enum(['low','medium','high','urgent']).default('medium') }).safeParse(req.body);
  if(!input.success) return res.status(400).json({error:input.error.flatten()});
  const d=input.data;
  if(!propertyAllowed(req,d.propertyId))return res.status(403).json({error:'Property is outside your assigned scope'});
  const property=await query(`SELECT id FROM properties WHERE id=$1 AND organization_id=$2`,[d.propertyId,tenantId(req)]);
  if(!property.rowCount)return res.status(404).json({error:'Property not found'});
  const result=await query(`INSERT INTO maintenance_requests(organization_id,property_id,unit_id,tenant_id,request_number,title,description,category,priority) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[tenantId(req),d.propertyId,d.unitId||null,d.tenantId||null,d.requestNumber,d.title,d.description||null,d.category||null,d.priority]);
  res.status(201).json(result.rows[0]);
});

app.get('/api/owners', async (req: AuthedRequest, res) => {
  const scope=propertyScope(req);
  const result=await query(`SELECT po.*,count(distinct p.id)::int property_count,count(u.id)::int unit_count FROM property_owners po LEFT JOIN properties p ON p.owner_id=po.id AND (cardinality($2::uuid[])=0 OR p.id=ANY($2::uuid[])) LEFT JOIN units u ON u.property_id=p.id WHERE po.organization_id=$1 GROUP BY po.id HAVING cardinality($2::uuid[])=0 OR count(p.id)>0 ORDER BY po.name`,[tenantId(req),scope]);
  res.json(result.rows);
});

app.get('/api/reports/rent-roll', async (req: AuthedRequest, res) => {
  const scope=propertyScope(req);
  const result=await query(`SELECT p.name property,u.unit_number,rt.first_name||' '||rt.last_name tenant,l.lease_number,l.monthly_rent,l.end_date,coalesce(sum(i.total-i.paid_amount) FILTER(WHERE i.status IN ('issued','partial','overdue')),0) balance FROM leases l JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id JOIN rental_tenants rt ON rt.id=l.tenant_id LEFT JOIN invoices i ON i.lease_id=l.id WHERE l.organization_id=$1 AND l.status IN ('active','expiring') AND (cardinality($2::uuid[])=0 OR p.id=ANY($2::uuid[])) GROUP BY p.name,u.unit_number,rt.first_name,rt.last_name,l.lease_number,l.monthly_rent,l.end_date ORDER BY p.name,u.unit_number`,[tenantId(req),scope]);
  res.json(result.rows);
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  const status = typeof error === 'object' && error && 'status' in error && typeof (error as {status?:unknown}).status === 'number' ? (error as {status:number}).status : 500;
  res.status(status).json({ error: error instanceof Error ? error.message : 'Internal server error' });
});

app.listen(PORT, () => console.log(`Polyizon PropOS API listening on :${PORT}`));
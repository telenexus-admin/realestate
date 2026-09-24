import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from './db.js';
import { requirePermission, type AuthedRequest } from './auth.js';

const router=Router();
function org(req:AuthedRequest){if(!req.auth?.organizationId)throw new Error('Organization context missing');return req.auth.organizationId;}
function scope(req:AuthedRequest){return req.auth?.propertyScope||[];}
function inScope(req:AuthedRequest,propertyId:string){const s=scope(req);return s.length===0||s.includes(propertyId);}
function monthKey(date:string){return date.slice(0,7).replace('-','');}
const billingMonth=z.string().regex(/^\d{4}-\d{2}-01$/,'Use the first day of the billing month');
async function tenantAccess(req:AuthedRequest,tenantParam:string|string[]){
 const tenantId=Array.isArray(tenantParam)?tenantParam[0]:tenantParam;
 const result=await query<{id:string;property_id:string|null}>(`SELECT rt.id,(SELECT u.property_id FROM leases l JOIN units u ON u.id=l.unit_id WHERE l.organization_id=rt.organization_id AND l.tenant_id=rt.id AND l.status IN ('active','expiring') ORDER BY l.end_date DESC LIMIT 1) property_id FROM rental_tenants rt WHERE rt.id=$1 AND rt.organization_id=$2`,[tenantId,org(req)]);
 if(!result.rowCount)throw Object.assign(new Error('Tenant not found'),{status:404});
 const propertyId=result.rows[0].property_id;if(propertyId&&!inScope(req,propertyId))throw Object.assign(new Error('Tenant is outside your property scope'),{status:403});
 return result.rows[0];
}

router.get('/rental/rent-schedules',async(req:AuthedRequest,res)=>{
 const result=await query(`SELECT rs.*,l.lease_number,l.tenant_id,u.unit_number,p.id property_id,p.name property_name,rt.first_name||' '||rt.last_name tenant_name FROM rent_schedules rs JOIN leases l ON l.id=rs.lease_id JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id JOIN rental_tenants rt ON rt.id=l.tenant_id WHERE rs.organization_id=$1 AND (cardinality($2::uuid[])=0 OR p.id=ANY($2::uuid[])) ORDER BY p.name,u.unit_number,rs.starts_on`,[org(req),scope(req)]);
 res.json(result.rows);
});

router.post('/rental/rent-schedules',requirePermission('lease.write'),async(req:AuthedRequest,res)=>{
 const input=z.object({leaseId:z.string().uuid(),amount:z.number().positive(),frequency:z.enum(['monthly','quarterly','annual']).default('monthly'),dueDay:z.number().int().min(1).max(28).optional(),startsOn:z.string(),endsOn:z.string().optional(),escalationType:z.enum(['fixed','percent','cpi']).optional(),escalationValue:z.number().nonnegative().optional(),nextEscalationOn:z.string().optional(),graceDays:z.number().int().min(0).max(60).default(0),prorationMethod:z.enum(['daily','thirty_day','none']).default('daily')}).safeParse(req.body);
 if(!input.success)return res.status(400).json({error:input.error.flatten()});
 const lease=await query<{property_id:string}>(`SELECT u.property_id FROM leases l JOIN units u ON u.id=l.unit_id WHERE l.id=$1 AND l.organization_id=$2`,[input.data.leaseId,org(req)]);
 if(!lease.rowCount)return res.status(404).json({error:'Lease not found'}); if(!inScope(req,lease.rows[0].property_id))return res.status(403).json({error:'Lease is outside your property scope'});
 const d=input.data,result=await query(`INSERT INTO rent_schedules(organization_id,lease_id,amount,frequency,due_day,starts_on,ends_on,escalation_type,escalation_value,next_escalation_on,grace_days,proration_method) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[org(req),d.leaseId,d.amount,d.frequency,d.dueDay||null,d.startsOn,d.endsOn||null,d.escalationType||null,d.escalationValue??null,d.nextEscalationOn||null,d.graceDays,d.prorationMethod]);
 res.status(201).json(result.rows[0]);
});

router.get('/rental/billing/context',async(req:AuthedRequest,res)=>{
 const [organization,user,properties]=await Promise.all([
  query<{name:string;slug:string}>(`SELECT name,slug FROM organizations WHERE id=$1`,[org(req)]),
  query<{first_name:string;last_name:string;email:string}>(`SELECT first_name,last_name,email FROM users WHERE id=$1`,[req.auth!.userId]),
  query(`SELECT id,name FROM properties WHERE organization_id=$1 AND status='active' AND (cardinality($2::uuid[])=0 OR id=ANY($2::uuid[])) ORDER BY name`,[org(req),scope(req)])
 ]);
 res.json({role:req.auth!.role,organization:organization.rows[0],user:user.rows[0],properties:properties.rows,canManageBilling:['owner','admin','accountant','property_manager'].includes(req.auth!.role),canManageTeam:['owner','admin'].includes(req.auth!.role)});
});

router.get('/rental/water-settings',async(req:AuthedRequest,res)=>{
 const result=await query(`SELECT p.id property_id,p.name property_name,coalesce(ws.billing_method,'meter') billing_method,coalesce(ws.rate_per_unit,0) rate_per_unit,coalesce(ws.flat_amount,0) flat_amount,coalesce(ws.shared_amount,0) shared_amount,coalesce(ws.active,true) active
  FROM properties p LEFT JOIN property_water_settings ws ON ws.property_id=p.id WHERE p.organization_id=$1 AND p.status='active' AND (cardinality($2::uuid[])=0 OR p.id=ANY($2::uuid[])) ORDER BY p.name`,[org(req),scope(req)]);
 res.json(result.rows);
});

router.put('/rental/water-settings/:propertyId',requirePermission('property.write'),async(req:AuthedRequest,res)=>{
 const propertyId=z.string().uuid().safeParse(req.params.propertyId);
 const input=z.object({billingMethod:z.enum(['meter','flat','shared']),ratePerUnit:z.number().nonnegative().default(0),flatAmount:z.number().nonnegative().default(0),sharedAmount:z.number().nonnegative().default(0),active:z.boolean().default(true)}).safeParse(req.body);
 if(!propertyId.success||!input.success)return res.status(400).json({error:'Please enter valid water billing settings'});
 if(!inScope(req,propertyId.data))return res.status(403).json({error:'Property is outside your assigned scope'});
 const property=await query(`SELECT 1 FROM properties WHERE id=$1 AND organization_id=$2`,[propertyId.data,org(req)]);if(!property.rowCount)return res.status(404).json({error:'Property not found'});
 const d=input.data,result=await query(`INSERT INTO property_water_settings(property_id,organization_id,billing_method,rate_per_unit,flat_amount,shared_amount,active,updated_by)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(property_id) DO UPDATE SET billing_method=excluded.billing_method,rate_per_unit=excluded.rate_per_unit,flat_amount=excluded.flat_amount,shared_amount=excluded.shared_amount,active=excluded.active,updated_by=excluded.updated_by,updated_at=now() RETURNING *`,[propertyId.data,org(req),d.billingMethod,d.ratePerUnit,d.flatAmount,d.sharedAmount,d.active,req.auth!.userId]);
 res.json(result.rows[0]);
});

router.get('/rental/water-readings',requirePermission('portfolio.read'),async(req:AuthedRequest,res)=>{
 const parsed=z.object({month:billingMonth,propertyId:z.string().uuid().optional()}).safeParse(req.query);if(!parsed.success)return res.status(400).json({error:'Choose a valid billing month'});
 if(parsed.data.propertyId&&!inScope(req,parsed.data.propertyId))return res.status(403).json({error:'Property is outside your assigned scope'});
 const propertyFilter=parsed.data.propertyId?[parsed.data.propertyId]:scope(req);
 const result=await query(`SELECT u.id unit_id,u.unit_number,p.id property_id,p.name property_name,coalesce(ws.billing_method,'meter') billing_method,coalesce(ws.rate_per_unit,0) rate_per_unit,
  wr.id,wr.billing_month,wr.previous_reading,wr.current_reading,wr.consumption,wr.amount,wr.notes,wr.status,wr.rejection_reason,
  coalesce(wr.previous_reading,(SELECT prior.current_reading FROM water_readings prior WHERE prior.organization_id=$1 AND prior.unit_id=u.id AND prior.billing_month<$2::date AND prior.status='approved' ORDER BY prior.billing_month DESC LIMIT 1),0) suggested_previous
  FROM units u JOIN properties p ON p.id=u.property_id LEFT JOIN property_water_settings ws ON ws.property_id=p.id AND ws.active=true LEFT JOIN water_readings wr ON wr.organization_id=$1 AND wr.unit_id=u.id AND wr.billing_month=$2::date
  WHERE u.organization_id=$1 AND u.status<>'inactive' AND (cardinality($3::uuid[])=0 OR p.id=ANY($3::uuid[])) ORDER BY p.name,u.unit_number`,[org(req),parsed.data.month,propertyFilter]);
 res.json(result.rows);
});

router.post('/rental/water-readings',requirePermission('water.write'),async(req:AuthedRequest,res)=>{
 const input=z.object({month:billingMonth,readings:z.array(z.object({unitId:z.string().uuid(),currentReading:z.number().nonnegative(),notes:z.string().trim().max(500).optional()})).min(1).max(500)}).safeParse(req.body);
 if(!input.success)return res.status(400).json({error:'Enter at least one valid meter reading',fields:input.error.flatten().fieldErrors});
 const saved=await withTransaction(async client=>{
  const rows=[];
  for(const item of input.data.readings){
   const unit=await client.query<{property_id:string;rate_per_unit:string;previous:string;existing_status:string|null}>(`SELECT u.property_id,coalesce(ws.rate_per_unit,0)::text rate_per_unit,
    coalesce((SELECT wr.current_reading::text FROM water_readings wr WHERE wr.organization_id=u.organization_id AND wr.unit_id=u.id AND wr.billing_month<$3::date AND wr.status='approved' ORDER BY wr.billing_month DESC LIMIT 1),'0') previous,
    (SELECT wr.status FROM water_readings wr WHERE wr.organization_id=u.organization_id AND wr.unit_id=u.id AND wr.billing_month=$3::date) existing_status
    FROM units u JOIN property_water_settings ws ON ws.property_id=u.property_id AND ws.organization_id=u.organization_id AND ws.active=true AND ws.billing_method='meter'
    WHERE u.id=$1 AND u.organization_id=$2 FOR UPDATE OF u`,[item.unitId,org(req),input.data.month]);
   if(!unit.rowCount)throw Object.assign(new Error('A unit is missing active meter billing settings'),{status:400});
   const row=unit.rows[0];if(!inScope(req,row.property_id))throw Object.assign(new Error('A unit is outside your assigned property scope'),{status:403});
   if(row.existing_status==='approved')throw Object.assign(new Error('An approved reading cannot be changed'),{status:409});
   const previous=Number(row.previous),consumption=item.currentReading-previous;if(consumption<0)throw Object.assign(new Error('Current reading cannot be below the previous approved reading'),{status:400});
   const amount=Math.round(consumption*Number(row.rate_per_unit)*100)/100;
   const reading=await client.query(`INSERT INTO water_readings(organization_id,property_id,unit_id,billing_month,previous_reading,current_reading,consumption,amount,notes,status,submitted_by,submitted_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted',$10,now()) ON CONFLICT(organization_id,unit_id,billing_month) DO UPDATE SET previous_reading=excluded.previous_reading,current_reading=excluded.current_reading,consumption=excluded.consumption,amount=excluded.amount,notes=excluded.notes,status='submitted',submitted_by=excluded.submitted_by,submitted_at=now(),approved_by=null,approved_at=null,rejection_reason=null,updated_at=now() RETURNING *`,[org(req),row.property_id,item.unitId,input.data.month,previous,item.currentReading,consumption,amount,item.notes||null,req.auth!.userId]);
   rows.push(reading.rows[0]);
  }
  return rows;
 });
 res.status(201).json(saved);
});

router.post('/rental/water-readings/:id/approve',requirePermission('finance.write'),async(req:AuthedRequest,res)=>{
 const id=z.string().uuid().safeParse(req.params.id);if(!id.success)return res.status(400).json({error:'Invalid reading'});
 const reading=await query<{property_id:string}>(`SELECT property_id FROM water_readings WHERE id=$1 AND organization_id=$2`,[id.data,org(req)]);if(!reading.rowCount)return res.status(404).json({error:'Reading not found'});if(!inScope(req,reading.rows[0].property_id))return res.status(403).json({error:'Reading is outside your assigned scope'});
 const result=await query(`UPDATE water_readings SET status='approved',approved_by=$1,approved_at=now(),rejection_reason=null,updated_at=now() WHERE id=$2 AND organization_id=$3 AND status='submitted' RETURNING *`,[req.auth!.userId,id.data,org(req)]);if(!result.rowCount)return res.status(409).json({error:'Only submitted readings can be approved'});res.json(result.rows[0]);
});

router.post('/rental/water-readings/:id/reject',requirePermission('finance.write'),async(req:AuthedRequest,res)=>{
 const parsed=z.object({reason:z.string().trim().min(2).max(300)}).safeParse(req.body),id=z.string().uuid().safeParse(req.params.id);if(!parsed.success||!id.success)return res.status(400).json({error:'Add a short rejection reason'});
 const reading=await query<{property_id:string}>(`SELECT property_id FROM water_readings WHERE id=$1 AND organization_id=$2`,[id.data,org(req)]);if(!reading.rowCount)return res.status(404).json({error:'Reading not found'});if(!inScope(req,reading.rows[0].property_id))return res.status(403).json({error:'Reading is outside your assigned scope'});
 const result=await query(`UPDATE water_readings SET status='rejected',rejection_reason=$1,approved_by=null,approved_at=null,updated_at=now() WHERE id=$2 AND organization_id=$3 AND status='submitted' RETURNING *`,[parsed.data.reason,id.data,org(req)]);if(!result.rowCount)return res.status(409).json({error:'Only submitted readings can be rejected'});res.json(result.rows[0]);
});

router.get('/rental/utility-settings',async(req:AuthedRequest,res)=>{
 const result=await query(`SELECT us.*,p.name property_name FROM property_utility_settings us JOIN properties p ON p.id=us.property_id WHERE us.organization_id=$1 AND (cardinality($2::uuid[])=0 OR us.property_id=ANY($2::uuid[])) ORDER BY p.name,us.name`,[org(req),scope(req)]);res.json(result.rows);
});

const utilitySettingSchema=z.object({propertyId:z.string().uuid(),utilityType:z.enum(['electricity','garbage','security','service_charge','other']),name:z.string().trim().min(2).max(80),billingMethod:z.enum(['meter','flat','shared']),ratePerUnit:z.number().nonnegative().default(0),flatAmount:z.number().nonnegative().default(0),sharedAmount:z.number().nonnegative().default(0),active:z.boolean().default(true)});
router.post('/rental/utility-settings',requirePermission('property.write'),async(req:AuthedRequest,res)=>{
 const input=utilitySettingSchema.safeParse(req.body);if(!input.success)return res.status(400).json({error:'Complete the utility charge details',fields:input.error.flatten().fieldErrors});const d=input.data;if(!inScope(req,d.propertyId))return res.status(403).json({error:'Property is outside your assigned scope'});const property=await query(`SELECT 1 FROM properties WHERE id=$1 AND organization_id=$2`,[d.propertyId,org(req)]);if(!property.rowCount)return res.status(404).json({error:'Property not found'});
 try{const result=await query(`INSERT INTO property_utility_settings(organization_id,property_id,utility_type,name,billing_method,rate_per_unit,flat_amount,shared_amount,active,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[org(req),d.propertyId,d.utilityType,d.name,d.billingMethod,d.ratePerUnit,d.flatAmount,d.sharedAmount,d.active,req.auth!.userId]);res.status(201).json(result.rows[0]);}catch(error){if((error as {code?:string}).code==='23505')return res.status(409).json({error:'That utility already exists for this property'});throw error;}
});
router.put('/rental/utility-settings/:id',requirePermission('property.write'),async(req:AuthedRequest,res)=>{
 const id=z.string().uuid().safeParse(req.params.id),input=utilitySettingSchema.omit({propertyId:true,utilityType:true}).safeParse(req.body);if(!id.success||!input.success)return res.status(400).json({error:'Enter valid utility settings'});const current=await query<{property_id:string}>(`SELECT property_id FROM property_utility_settings WHERE id=$1 AND organization_id=$2`,[id.success?id.data:null,org(req)]);if(!current.rowCount)return res.status(404).json({error:'Utility not found'});if(!inScope(req,current.rows[0].property_id))return res.status(403).json({error:'Utility is outside your assigned scope'});const d=input.data,result=await query(`UPDATE property_utility_settings SET name=$1,billing_method=$2,rate_per_unit=$3,flat_amount=$4,shared_amount=$5,active=$6,updated_by=$7,updated_at=now() WHERE id=$8 RETURNING *`,[d.name,d.billingMethod,d.ratePerUnit,d.flatAmount,d.sharedAmount,d.active,req.auth!.userId,id.data]);res.json(result.rows[0]);
});

router.get('/rental/utility-readings',requirePermission('portfolio.read'),async(req:AuthedRequest,res)=>{
 const parsed=z.object({month:billingMonth,propertyId:z.string().uuid().optional()}).safeParse(req.query);if(!parsed.success)return res.status(400).json({error:'Choose a valid billing month'});if(parsed.data.propertyId&&!inScope(req,parsed.data.propertyId))return res.status(403).json({error:'Property is outside your assigned scope'});const filter=parsed.data.propertyId?[parsed.data.propertyId]:scope(req);
 const result=await query(`SELECT us.id setting_id,us.name utility_name,us.utility_type,us.rate_per_unit,u.id unit_id,u.unit_number,p.id property_id,p.name property_name,ur.id,ur.previous_reading,ur.current_reading,ur.consumption,ur.amount,ur.notes,ur.status,ur.rejection_reason,
  coalesce(ur.previous_reading,(SELECT prior.current_reading FROM billing_utility_readings prior WHERE prior.organization_id=$1 AND prior.setting_id=us.id AND prior.unit_id=u.id AND prior.billing_month<$2::date AND prior.status='approved' ORDER BY prior.billing_month DESC LIMIT 1),0) suggested_previous
  FROM property_utility_settings us JOIN properties p ON p.id=us.property_id JOIN units u ON u.property_id=p.id AND u.status<>'inactive' LEFT JOIN billing_utility_readings ur ON ur.organization_id=$1 AND ur.setting_id=us.id AND ur.unit_id=u.id AND ur.billing_month=$2::date
  WHERE us.organization_id=$1 AND us.active=true AND us.billing_method='meter' AND (cardinality($3::uuid[])=0 OR us.property_id=ANY($3::uuid[])) ORDER BY p.name,us.name,u.unit_number`,[org(req),parsed.data.month,filter]);res.json(result.rows);
});
router.post('/rental/utility-readings',requirePermission('water.write'),async(req:AuthedRequest,res)=>{
 const input=z.object({month:billingMonth,readings:z.array(z.object({settingId:z.string().uuid(),unitId:z.string().uuid(),currentReading:z.number().nonnegative(),notes:z.string().trim().max(500).optional()})).min(1).max(500)}).safeParse(req.body);if(!input.success)return res.status(400).json({error:'Enter at least one valid utility reading'});
 const saved=await withTransaction(async client=>{const rows=[];for(const item of input.data.readings){const found=await client.query<any>(`SELECT us.property_id,us.rate_per_unit,(SELECT current_reading FROM billing_utility_readings x WHERE x.organization_id=us.organization_id AND x.setting_id=us.id AND x.unit_id=$3 AND x.billing_month<$4::date AND x.status='approved' ORDER BY x.billing_month DESC LIMIT 1) previous,(SELECT status FROM billing_utility_readings x WHERE x.organization_id=us.organization_id AND x.setting_id=us.id AND x.unit_id=$3 AND x.billing_month=$4::date) existing_status FROM property_utility_settings us JOIN units u ON u.id=$3 AND u.property_id=us.property_id AND u.organization_id=us.organization_id WHERE us.id=$1 AND us.organization_id=$2 AND us.active=true AND us.billing_method='meter'`,[item.settingId,org(req),item.unitId,input.data.month]);if(!found.rowCount)throw Object.assign(new Error('A utility meter is not configured for this unit'),{status:400});const row=found.rows[0];if(!inScope(req,row.property_id))throw Object.assign(new Error('A unit is outside your assigned property scope'),{status:403});if(row.existing_status==='approved')throw Object.assign(new Error('An approved reading cannot be changed'),{status:409});const previous=Number(row.previous||0),consumption=item.currentReading-previous;if(consumption<0)throw Object.assign(new Error('Current reading cannot be below the previous approved reading'),{status:400});const amount=Math.round(consumption*Number(row.rate_per_unit)*100)/100;const reading=await client.query(`INSERT INTO billing_utility_readings(organization_id,setting_id,property_id,unit_id,billing_month,previous_reading,current_reading,consumption,amount,notes,status,submitted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'submitted',$11) ON CONFLICT(organization_id,setting_id,unit_id,billing_month) DO UPDATE SET previous_reading=excluded.previous_reading,current_reading=excluded.current_reading,consumption=excluded.consumption,amount=excluded.amount,notes=excluded.notes,status='submitted',submitted_by=excluded.submitted_by,submitted_at=now(),approved_by=null,approved_at=null,rejection_reason=null,updated_at=now() RETURNING *`,[org(req),item.settingId,row.property_id,item.unitId,input.data.month,previous,item.currentReading,consumption,amount,item.notes||null,req.auth!.userId]);rows.push(reading.rows[0]);}return rows;});res.status(201).json(saved);
});
async function utilityReadingDecision(req:AuthedRequest,id:string,status:'approved'|'rejected',reason?:string){const found=await query<{property_id:string}>(`SELECT property_id FROM billing_utility_readings WHERE id=$1 AND organization_id=$2`,[id,org(req)]);if(!found.rowCount)throw Object.assign(new Error('Reading not found'),{status:404});if(!inScope(req,found.rows[0].property_id))throw Object.assign(new Error('Reading is outside your assigned scope'),{status:403});const result=await query(`UPDATE billing_utility_readings SET status=$1,approved_by=CASE WHEN $1='approved' THEN $2::uuid END,approved_at=CASE WHEN $1='approved' THEN now() END,rejection_reason=$3,updated_at=now() WHERE id=$4 AND organization_id=$5 AND status='submitted' RETURNING *`,[status,req.auth!.userId,status==='rejected'?reason||'Please check this reading':null,id,org(req)]);if(!result.rowCount)throw Object.assign(new Error('Only submitted readings can be reviewed'),{status:409});return result.rows[0];}
router.post('/rental/utility-readings/:id/approve',requirePermission('finance.write'),async(req:AuthedRequest,res)=>{const id=z.string().uuid().safeParse(req.params.id);if(!id.success)return res.status(400).json({error:'Invalid reading'});res.json(await utilityReadingDecision(req,id.data,'approved'));});
router.post('/rental/utility-readings/:id/reject',requirePermission('finance.write'),async(req:AuthedRequest,res)=>{const id=z.string().uuid().safeParse(req.params.id),input=z.object({reason:z.string().trim().min(2).max(300)}).safeParse(req.body);if(!id.success||!input.success)return res.status(400).json({error:'Add a short rejection reason'});res.json(await utilityReadingDecision(req,id.data,'rejected',input.data.reason));});

async function billingCandidates(req:AuthedRequest,periodStart:string,periodEnd:string,propertyId?:string){
 if(propertyId&&!inScope(req,propertyId))throw Object.assign(new Error('Property is outside your assigned scope'),{status:403});
 const propertyFilter=propertyId?[propertyId]:scope(req);
 const result=await query(`SELECT l.id lease_id,l.lease_number,l.tenant_id,l.monthly_rent,l.due_day,l.start_date,l.end_date,u.id unit_id,u.unit_number,p.id property_id,p.name property_name,rt.first_name||' '||rt.last_name tenant_name,rt.phone tenant_phone,rt.email tenant_email,
  coalesce(rs.amount,l.monthly_rent) rent_amount,coalesce(rs.due_day,l.due_day) scheduled_due_day,coalesce(rs.grace_days,l.grace_days) grace_days,
  ws.billing_method,ws.rate_per_unit,ws.flat_amount,ws.shared_amount,wr.id water_reading_id,wr.amount meter_amount,wr.status water_reading_status
  FROM leases l JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id JOIN rental_tenants rt ON rt.id=l.tenant_id
  LEFT JOIN LATERAL (SELECT * FROM rent_schedules x WHERE x.lease_id=l.id AND x.organization_id=l.organization_id AND x.active=true AND x.starts_on<=$3::date AND (x.ends_on IS NULL OR x.ends_on>=$2::date) ORDER BY x.starts_on DESC LIMIT 1) rs ON true
  LEFT JOIN property_water_settings ws ON ws.property_id=p.id AND ws.active=true
  LEFT JOIN water_readings wr ON wr.organization_id=l.organization_id AND wr.unit_id=u.id AND wr.billing_month=date_trunc('month',$2::date)::date
  WHERE l.organization_id=$1 AND l.status IN ('active','expiring') AND l.start_date<=$3::date AND l.end_date>=$2::date AND (cardinality($4::uuid[])=0 OR p.id=ANY($4::uuid[])) ORDER BY p.name,u.unit_number`,[org(req),periodStart,periodEnd,propertyFilter]);
 const counts=new Map<string,number>();for(const row of result.rows as any[])counts.set(row.property_id,(counts.get(row.property_id)||0)+1);
 const candidates=(result.rows as any[]).map(row=>{const method=row.billing_method||'none';let waterAmount=0,waterStatus='not_set',ready=true;if(method==='meter'){waterAmount=row.water_reading_status==='approved'?Number(row.meter_amount||0):0;waterStatus=row.water_reading_status||'missing';ready=row.water_reading_status==='approved';}else if(method==='flat'){waterAmount=Number(row.flat_amount||0);waterStatus='automatic';}else if(method==='shared'){waterAmount=Math.round((Number(row.shared_amount||0)/Math.max(1,counts.get(row.property_id)||1))*100)/100;waterStatus='automatic';}const rentAmount=Number(row.rent_amount);return {...row,rent_amount:rentAmount,water_amount:waterAmount,total_amount:rentAmount+waterAmount,water_status:waterStatus,utility_amount:0,utility_items:[],ready};});
 if(!candidates.length)return candidates;const propertyIds=[...new Set(candidates.map(row=>row.property_id))];const utilitySettings=await query<any>(`SELECT us.*,ur.amount meter_amount,ur.status reading_status,ur.id reading_id,ur.unit_id reading_unit_id FROM property_utility_settings us LEFT JOIN billing_utility_readings ur ON ur.organization_id=us.organization_id AND ur.setting_id=us.id AND ur.billing_month=date_trunc('month',$2::date)::date WHERE us.organization_id=$1 AND us.active=true AND us.property_id=ANY($3::uuid[])`,[org(req),periodStart,propertyIds]);
 const uniqueSettings=[...new Map(utilitySettings.rows.map((item:any)=>[item.id,item])).values()] as any[];
 for(const row of candidates){const items=[];for(const setting of uniqueSettings.filter((item:any)=>item.property_id===row.property_id)){let amount=0,status='automatic';if(setting.billing_method==='meter'){const reading=utilitySettings.rows.find((item:any)=>item.id===setting.id&&item.reading_unit_id===row.unit_id);amount=reading?.reading_status==='approved'?Number(reading.meter_amount||0):0;status=reading?.reading_status||'missing';if(status!=='approved')row.ready=false;}else if(setting.billing_method==='flat')amount=Number(setting.flat_amount||0);else amount=Math.round((Number(setting.shared_amount||0)/Math.max(1,counts.get(row.property_id)||1))*100)/100;items.push({setting_id:setting.id,type:setting.utility_type,name:setting.name,amount,status});row.utility_amount+=amount;}row.utility_items=items;row.total_amount+=row.utility_amount;}
 return candidates;
}

router.post('/rental/billing/preview',requirePermission('finance.read'),async(req:AuthedRequest,res)=>{
 const input=z.object({periodStart:z.string(),periodEnd:z.string(),propertyId:z.string().uuid().optional()}).safeParse(req.body); if(!input.success)return res.status(400).json({error:input.error.flatten()});
 const rows=await billingCandidates(req,input.data.periodStart,input.data.periodEnd,input.data.propertyId); const total=rows.reduce((sum:any,r:any)=>sum+Number(r.total_amount),0),missingReadings=rows.filter((r:any)=>!r.ready).length;
 res.json({periodStart:input.data.periodStart,periodEnd:input.data.periodEnd,count:rows.length,total,missingReadings,ready:missingReadings===0,items:rows});
});

router.post('/rental/billing/post',requirePermission('finance.write'),async(req:AuthedRequest,res)=>{
 const input=z.object({periodStart:z.string(),periodEnd:z.string(),propertyId:z.string().uuid().optional(),runKey:z.string().min(8).max(120)}).safeParse(req.body); if(!input.success)return res.status(400).json({error:input.error.flatten()});
 const d=input.data,existing=await query(`SELECT * FROM billing_runs WHERE organization_id=$1 AND run_key=$2`,[org(req),d.runKey]); if(existing.rowCount)return res.json({...existing.rows[0],idempotentReplay:true});
 const candidates=await billingCandidates(req,d.periodStart,d.periodEnd,d.propertyId);
 const missing=candidates.filter((row:any)=>!row.ready);if(missing.length)return res.status(409).json({error:`Approve the missing meter readings for ${missing.length} unit${missing.length===1?'':'s'} before creating invoices`});
 const result=await withTransaction(async client=>{
  const run=await client.query(`INSERT INTO billing_runs(organization_id,run_key,period_start,period_end,property_id,status,created_by) VALUES($1,$2,$3,$4,$5,'previewed',$6) RETURNING *`,[org(req),d.runKey,d.periodStart,d.periodEnd,d.propertyId||null,req.auth!.userId]);
  let count=0,total=0;
  for(const row of candidates as any[]){
   const rentAmount=Number(row.rent_amount),waterAmount=Number(row.water_amount),amount=rentAmount+waterAmount; const dueDay=Math.max(1,Math.min(28,Number(row.scheduled_due_day||5))); const dueDate=`${d.periodStart.slice(0,7)}-${String(dueDay).padStart(2,'0')}`; const number=`RNT-${monthKey(d.periodStart)}-${String(row.lease_number).replace(/[^A-Za-z0-9]/g,'').slice(-12)}`;
   const invoice=await client.query(`INSERT INTO invoices(organization_id,tenant_id,lease_id,invoice_number,period_start,period_end,due_date,subtotal,total,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,'issued') ON CONFLICT DO NOTHING RETURNING id`,[org(req),row.tenant_id,row.lease_id,number,d.periodStart,d.periodEnd,dueDate,amount]);
   if(invoice.rowCount){await client.query(`INSERT INTO invoice_items(organization_id,invoice_id,item_type,description,quantity,unit_price,total) VALUES($1,$2,'rent',$3,1,$4,$4)`,[org(req),invoice.rows[0].id,`Rent · ${row.property_name} ${row.unit_number}`,rentAmount]);if(waterAmount>0)await client.query(`INSERT INTO invoice_items(organization_id,invoice_id,item_type,description,quantity,unit_price,total) VALUES($1,$2,'water',$3,1,$4,$4)`,[org(req),invoice.rows[0].id,`Water · ${row.property_name} ${row.unit_number}`,waterAmount]);for(const item of row.utility_items||[])if(Number(item.amount)>0)await client.query(`INSERT INTO invoice_items(organization_id,invoice_id,item_type,description,quantity,unit_price,total) VALUES($1,$2,$3,$4,1,$5,$5)`,[org(req),invoice.rows[0].id,item.type,item.name,Number(item.amount)]);count+=1;total+=amount;}
  }
  await client.query(`UPDATE billing_runs SET status='posted',invoice_count=$1,total_amount=$2,posted_at=now(),metadata=$3::jsonb WHERE id=$4`,[count,total,JSON.stringify({candidateCount:candidates.length,skipped:candidates.length-count}),run.rows[0].id]);
  await client.query(`INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'billing.run.post','billing_run',$3,$4::jsonb)`,[org(req),req.auth!.userId,run.rows[0].id,JSON.stringify({periodStart:d.periodStart,periodEnd:d.periodEnd,count,total})]);
  return {...run.rows[0],status:'posted',invoice_count:count,total_amount:total,posted_at:new Date().toISOString(),skipped:candidates.length-count};
 });
 res.status(201).json(result);
});
router.get('/rental/billing/runs',requirePermission('finance.read'),async(req:AuthedRequest,res)=>{const r=await query(`SELECT br.*,p.name property_name FROM billing_runs br LEFT JOIN properties p ON p.id=br.property_id WHERE br.organization_id=$1 ORDER BY br.created_at DESC LIMIT 100`,[org(req)]);res.json(r.rows)});

router.get('/rental/invoices',requirePermission('finance.read'),async(req:AuthedRequest,res)=>{
 const result=await query(`SELECT i.*,rt.first_name||' '||rt.last_name tenant_name,rt.phone tenant_phone,rt.email tenant_email,u.unit_number,p.id property_id,p.name property_name,
  coalesce((SELECT json_agg(json_build_object('type',ii.item_type,'description',ii.description,'amount',ii.total) ORDER BY ii.id) FROM invoice_items ii WHERE ii.invoice_id=i.id),'[]'::json) items,
  (SELECT ic.channel FROM invoice_communications ic WHERE ic.invoice_id=i.id ORDER BY ic.created_at DESC LIMIT 1) last_channel,
  (SELECT ic.sent_at FROM invoice_communications ic WHERE ic.invoice_id=i.id ORDER BY ic.created_at DESC LIMIT 1) last_shared_at
  FROM invoices i JOIN rental_tenants rt ON rt.id=i.tenant_id LEFT JOIN leases l ON l.id=i.lease_id LEFT JOIN units u ON u.id=l.unit_id LEFT JOIN properties p ON p.id=u.property_id
  WHERE i.organization_id=$1 AND (cardinality($2::uuid[])=0 OR p.id=ANY($2::uuid[])) ORDER BY i.created_at DESC LIMIT 250`,[org(req),scope(req)]);res.json(result.rows);
});

router.post('/rental/invoices/:id/share',requirePermission('finance.write'),async(req:AuthedRequest,res)=>{
 const id=z.string().uuid().safeParse(req.params.id),input=z.object({channel:z.enum(['whatsapp','sms','email'])}).safeParse(req.body);if(!id.success||!input.success)return res.status(400).json({error:'Choose a valid invoice and channel'});
 const found=await query<any>(`SELECT i.id,i.invoice_number,i.total,i.due_date,rt.id tenant_id,rt.first_name,rt.phone,rt.email,u.unit_number,p.id property_id,p.name property_name FROM invoices i JOIN rental_tenants rt ON rt.id=i.tenant_id LEFT JOIN leases l ON l.id=i.lease_id LEFT JOIN units u ON u.id=l.unit_id LEFT JOIN properties p ON p.id=u.property_id WHERE i.id=$1 AND i.organization_id=$2`,[id.data,org(req)]);if(!found.rowCount)return res.status(404).json({error:'Invoice not found'});const invoice=found.rows[0];if(invoice.property_id&&!inScope(req,invoice.property_id))return res.status(403).json({error:'Invoice is outside your assigned scope'});
 const channel=input.data.channel,recipient=channel==='email'?invoice.email:invoice.phone;if(!recipient)return res.status(400).json({error:`Tenant has no ${channel==='email'?'email address':'phone number'}`});
 const message=`Hello ${invoice.first_name}, your ${invoice.property_name||'property'} bill for unit ${invoice.unit_number||'—'} is KES ${Number(invoice.total).toLocaleString()} and is due on ${new Date(invoice.due_date).toLocaleDateString('en-KE')}. Invoice ${invoice.invoice_number}.`;
 let actionUrl='';if(channel==='email')actionUrl=`mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(`Invoice ${invoice.invoice_number}`)}&body=${encodeURIComponent(message)}`;else{let phone=String(recipient).replace(/\D/g,'');if(phone.startsWith('0'))phone=`254${phone.slice(1)}`;actionUrl=channel==='whatsapp'?`https://wa.me/${phone}?text=${encodeURIComponent(message)}`:`sms:+${phone}?body=${encodeURIComponent(message)}`;}
 await query(`INSERT INTO invoice_communications(organization_id,invoice_id,tenant_id,channel,recipient,message,status,sent_by) VALUES($1,$2,$3,$4,$5,$6,'opened',$7)`,[org(req),id.data,invoice.tenant_id,channel,recipient,message,req.auth!.userId]);
 res.json({actionUrl,message,status:'opened'});
});

router.get('/rental/tenant/:tenantId/lifecycle',async(req:AuthedRequest,res)=>{
 await tenantAccess(req,req.params.tenantId);
 const tenantId=req.params.tenantId,o=org(req);
 const [tenant,contacts,kyc,leases,wallet,plans,maintenance,documents]=await Promise.all([
  query(`SELECT rt.*,l.id lease_id,l.lease_number,l.start_date,l.end_date,l.monthly_rent,l.deposit_amount,l.status lease_status,u.unit_number,p.id property_id,p.name property_name FROM rental_tenants rt LEFT JOIN LATERAL (SELECT * FROM leases x WHERE x.organization_id=rt.organization_id AND x.tenant_id=rt.id ORDER BY CASE WHEN x.status IN ('active','expiring') THEN 0 ELSE 1 END,x.end_date DESC LIMIT 1) l ON true LEFT JOIN units u ON u.id=l.unit_id LEFT JOIN properties p ON p.id=u.property_id WHERE rt.organization_id=$1 AND rt.id=$2`,[o,tenantId]),
  query(`SELECT * FROM tenant_contacts WHERE organization_id=$1 AND tenant_id=$2 ORDER BY is_primary DESC,created_at`,[o,tenantId]),
  query(`SELECT * FROM tenant_kyc WHERE organization_id=$1 AND tenant_id=$2 ORDER BY created_at DESC`,[o,tenantId]),
  query(`SELECT l.*,u.unit_number,p.name property_name,(SELECT json_agg(lp ORDER BY lp.party_type,lp.name) FROM lease_parties lp WHERE lp.organization_id=l.organization_id AND lp.lease_id=l.id) parties,(SELECT json_agg(la ORDER BY la.version DESC) FROM lease_amendments la WHERE la.organization_id=l.organization_id AND la.lease_id=l.id) amendments FROM leases l JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id WHERE l.organization_id=$1 AND l.tenant_id=$2 ORDER BY l.end_date DESC`,[o,tenantId]),
  query(`SELECT * FROM tenant_wallet_entries WHERE organization_id=$1 AND tenant_id=$2 ORDER BY posted_at DESC LIMIT 100`,[o,tenantId]),
  query(`SELECT * FROM payment_plans WHERE organization_id=$1 AND tenant_id=$2 ORDER BY created_at DESC`,[o,tenantId]),
  query(`SELECT mr.*,p.name property_name,u.unit_number FROM maintenance_requests mr JOIN properties p ON p.id=mr.property_id LEFT JOIN units u ON u.id=mr.unit_id WHERE mr.organization_id=$1 AND mr.tenant_id=$2 ORDER BY mr.created_at DESC LIMIT 50`,[o,tenantId]),
  query(`SELECT d.* FROM documents d WHERE d.organization_id=$1 AND ((d.entity_type='tenant' AND d.entity_id=$2) OR (d.entity_type='lease' AND d.entity_id IN (SELECT id FROM leases WHERE organization_id=$1 AND tenant_id=$2))) ORDER BY d.created_at DESC LIMIT 50`,[o,tenantId])
 ]);
 const walletBalance=wallet.rows.reduce((sum:any,e:any)=>sum+(e.entry_type==='debit'?-Number(e.amount):Number(e.amount)),0);
 res.json({tenant:tenant.rows[0],contacts:contacts.rows,kyc:kyc.rows,leases:leases.rows,wallet:{balance:walletBalance,entries:wallet.rows},paymentPlans:plans.rows,maintenance:maintenance.rows,documents:documents.rows});
});

router.get('/rental/tenant/:tenantId/contacts',async(req:AuthedRequest,res)=>{await tenantAccess(req,req.params.tenantId);const r=await query(`SELECT * FROM tenant_contacts WHERE organization_id=$1 AND tenant_id=$2 ORDER BY is_primary DESC,created_at`,[org(req),req.params.tenantId]);res.json(r.rows)});
router.post('/rental/tenant/:tenantId/contacts',requirePermission('tenant.write'),async(req:AuthedRequest,res)=>{await tenantAccess(req,req.params.tenantId);const input=z.object({contactType:z.enum(['emergency','next_of_kin','employer','reference','household','other']),name:z.string().min(2),phone:z.string().optional(),email:z.string().email().optional(),relationship:z.string().optional(),isPrimary:z.boolean().default(false)}).safeParse(req.body);if(!input.success)return res.status(400).json({error:input.error.flatten()});const d=input.data,r=await query(`INSERT INTO tenant_contacts(organization_id,tenant_id,contact_type,name,phone,email,relationship,is_primary) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[org(req),req.params.tenantId,d.contactType,d.name,d.phone||null,d.email||null,d.relationship||null,d.isPrimary]);res.status(201).json(r.rows[0])});

router.get('/rental/tenant/:tenantId/kyc',async(req:AuthedRequest,res)=>{await tenantAccess(req,req.params.tenantId);const r=await query(`SELECT * FROM tenant_kyc WHERE organization_id=$1 AND tenant_id=$2 ORDER BY created_at DESC`,[org(req),req.params.tenantId]);res.json(r.rows)});
router.post('/rental/tenant/:tenantId/kyc',requirePermission('tenant.write'),async(req:AuthedRequest,res)=>{await tenantAccess(req,req.params.tenantId);const input=z.object({documentType:z.string().optional(),documentNumber:z.string().optional(),employer:z.string().optional(),status:z.enum(['pending','verified','rejected']).default('pending'),metadata:z.record(z.string(),z.any()).default({})}).safeParse(req.body);if(!input.success)return res.status(400).json({error:input.error.flatten()});const d=input.data,r=await query(`INSERT INTO tenant_kyc(organization_id,tenant_id,document_type,document_number,employer,status,verified_at,metadata) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6='verified' THEN now() END,$7::jsonb) RETURNING *`,[org(req),req.params.tenantId,d.documentType||null,d.documentNumber||null,d.employer||null,d.status,JSON.stringify(d.metadata)]);res.status(201).json(r.rows[0])});

router.get('/rental/tenant/:tenantId/wallet',requirePermission('finance.read'),async(req:AuthedRequest,res)=>{await tenantAccess(req,req.params.tenantId);const r=await query(`SELECT * FROM tenant_wallet_entries WHERE organization_id=$1 AND tenant_id=$2 ORDER BY posted_at DESC LIMIT 200`,[org(req),req.params.tenantId]);const balance=r.rows.reduce((sum:any,e:any)=>sum+(e.entry_type==='debit'?-Number(e.amount):Number(e.amount)),0);res.json({balance,entries:r.rows})});
router.post('/rental/tenant/:tenantId/wallet',requirePermission('finance.write'),async(req:AuthedRequest,res)=>{await tenantAccess(req,req.params.tenantId);const input=z.object({entryType:z.enum(['credit','debit']),amount:z.number().positive(),reference:z.string().min(2),sourceType:z.string().optional(),sourceId:z.string().uuid().optional(),metadata:z.record(z.string(),z.any()).default({})}).safeParse(req.body);if(!input.success)return res.status(400).json({error:input.error.flatten()});const d=input.data,r=await query(`INSERT INTO tenant_wallet_entries(organization_id,tenant_id,entry_type,amount,reference,source_type,source_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,[org(req),req.params.tenantId,d.entryType,d.amount,d.reference,d.sourceType||null,d.sourceId||null,JSON.stringify(d.metadata)]);res.status(201).json(r.rows[0])});

router.get('/rental/tenant/:tenantId/payment-plans',requirePermission('finance.read'),async(req:AuthedRequest,res)=>{await tenantAccess(req,req.params.tenantId);const r=await query(`SELECT * FROM payment_plans WHERE organization_id=$1 AND tenant_id=$2 ORDER BY created_at DESC`,[org(req),req.params.tenantId]);res.json(r.rows)});
router.post('/rental/tenant/:tenantId/payment-plans',requirePermission('finance.write'),async(req:AuthedRequest,res)=>{await tenantAccess(req,req.params.tenantId);const input=z.object({leaseId:z.string().uuid().optional(),originalBalance:z.number().positive(),installmentAmount:z.number().positive(),frequency:z.enum(['weekly','biweekly','monthly']).default('monthly'),startsOn:z.string(),nextDueOn:z.string().optional()}).safeParse(req.body);if(!input.success)return res.status(400).json({error:input.error.flatten()});const d=input.data,r=await query(`INSERT INTO payment_plans(organization_id,tenant_id,lease_id,original_balance,installment_amount,frequency,starts_on,next_due_on,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[org(req),req.params.tenantId,d.leaseId||null,d.originalBalance,d.installmentAmount,d.frequency,d.startsOn,d.nextDueOn||d.startsOn,req.auth!.userId]);res.status(201).json(r.rows[0])});

router.get('/rental/lease/:leaseId/parties',async(req:AuthedRequest,res)=>{const lease=await query<{tenant_id:string;property_id:string}>(`SELECT l.tenant_id,u.property_id FROM leases l JOIN units u ON u.id=l.unit_id WHERE l.id=$1 AND l.organization_id=$2`,[req.params.leaseId,org(req)]);if(!lease.rowCount)return res.status(404).json({error:'Lease not found'});if(!inScope(req,lease.rows[0].property_id))return res.status(403).json({error:'Lease is outside your property scope'});const r=await query(`SELECT * FROM lease_parties WHERE organization_id=$1 AND lease_id=$2 ORDER BY party_type,name`,[org(req),req.params.leaseId]);res.json(r.rows)});
router.post('/rental/lease/:leaseId/parties',requirePermission('lease.write'),async(req:AuthedRequest,res)=>{const lease=await query<{property_id:string}>(`SELECT u.property_id FROM leases l JOIN units u ON u.id=l.unit_id WHERE l.id=$1 AND l.organization_id=$2`,[req.params.leaseId,org(req)]);if(!lease.rowCount)return res.status(404).json({error:'Lease not found'});if(!inScope(req,lease.rows[0].property_id))return res.status(403).json({error:'Lease is outside your property scope'});const input=z.object({tenantId:z.string().uuid().optional(),partyType:z.enum(['co_tenant','guarantor','occupant']),name:z.string().min(2),phone:z.string().optional(),email:z.string().email().optional(),liabilityPercent:z.number().min(0).max(100).optional(),guaranteeAmount:z.number().nonnegative().optional(),startDate:z.string().optional(),endDate:z.string().optional(),metadata:z.record(z.string(),z.any()).default({})}).safeParse(req.body);if(!input.success)return res.status(400).json({error:input.error.flatten()});const d=input.data,r=await query(`INSERT INTO lease_parties(organization_id,lease_id,tenant_id,party_type,name,phone,email,liability_percent,guarantee_amount,start_date,end_date,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING *`,[org(req),req.params.leaseId,d.tenantId||null,d.partyType,d.name,d.phone||null,d.email||null,d.liabilityPercent??null,d.guaranteeAmount??null,d.startDate||null,d.endDate||null,JSON.stringify(d.metadata)]);res.status(201).json(r.rows[0])});

router.get('/rental/lease/:leaseId/amendments',async(req:AuthedRequest,res)=>{const lease=await query<{property_id:string}>(`SELECT u.property_id FROM leases l JOIN units u ON u.id=l.unit_id WHERE l.id=$1 AND l.organization_id=$2`,[req.params.leaseId,org(req)]);if(!lease.rowCount)return res.status(404).json({error:'Lease not found'});if(!inScope(req,lease.rows[0].property_id))return res.status(403).json({error:'Lease is outside your property scope'});const r=await query(`SELECT * FROM lease_amendments WHERE organization_id=$1 AND lease_id=$2 ORDER BY version DESC`,[org(req),req.params.leaseId]);res.json(r.rows)});
router.post('/rental/lease/:leaseId/amendments',requirePermission('lease.write'),async(req:AuthedRequest,res)=>{const lease=await query<{property_id:string}>(`SELECT u.property_id FROM leases l JOIN units u ON u.id=l.unit_id WHERE l.id=$1 AND l.organization_id=$2`,[req.params.leaseId,org(req)]);if(!lease.rowCount)return res.status(404).json({error:'Lease not found'});if(!inScope(req,lease.rows[0].property_id))return res.status(403).json({error:'Lease is outside your property scope'});const input=z.object({amendmentType:z.string().min(2),effectiveOn:z.string(),summary:z.string().min(3),terms:z.record(z.string(),z.any()).default({}),status:z.enum(['draft','pending_signature','executed','cancelled']).default('draft')}).safeParse(req.body);if(!input.success)return res.status(400).json({error:input.error.flatten()});const version=await query<{next:number}>(`SELECT coalesce(max(version),0)+1 next FROM lease_amendments WHERE organization_id=$1 AND lease_id=$2`,[org(req),req.params.leaseId]);const d=input.data,r=await query(`INSERT INTO lease_amendments(organization_id,lease_id,version,amendment_type,effective_on,summary,terms,status,signed_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,CASE WHEN $8='executed' THEN now() END,$9) RETURNING *`,[org(req),req.params.leaseId,version.rows[0].next,d.amendmentType,d.effectiveOn,d.summary,JSON.stringify(d.terms),d.status,req.auth!.userId]);res.status(201).json(r.rows[0])});

router.get('/rental/turnovers',async(req:AuthedRequest,res)=>{const r=await query(`SELECT vt.*,u.unit_number,p.name property_name,p.id property_id FROM vacancy_turnovers vt JOIN units u ON u.id=vt.unit_id JOIN properties p ON p.id=u.property_id WHERE vt.organization_id=$1 AND (cardinality($2::uuid[])=0 OR p.id=ANY($2::uuid[])) ORDER BY coalesce(vt.target_ready_on,current_date),p.name,u.unit_number`,[org(req),scope(req)]);res.json(r.rows)});

export default router;

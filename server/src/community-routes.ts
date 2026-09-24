import { Router } from 'express';
import { z } from 'zod';
import { query } from './db.js';
import { requirePermission, type AuthedRequest } from './auth.js';

const router=Router();
const org=(req:AuthedRequest)=>{if(!req.auth?.organizationId)throw new Error('Organization context missing');return req.auth.organizationId};
const scope=(req:AuthedRequest)=>req.auth?.propertyScope||[];
const allowed=(req:AuthedRequest,propertyId:string)=>scope(req).length===0||scope(req).includes(propertyId);

async function verifyLocation(req:AuthedRequest,propertyId:string,unitId?:string){
  if(!allowed(req,propertyId))throw Object.assign(new Error('Property is outside your assigned scope'),{status:403});
  const property=await query(`SELECT id FROM properties WHERE id=$1 AND organization_id=$2`,[propertyId,org(req)]);
  if(!property.rowCount)throw Object.assign(new Error('Property not found'),{status:404});
  if(unitId){const unit=await query(`SELECT id FROM units WHERE id=$1 AND property_id=$2 AND organization_id=$3`,[unitId,propertyId,org(req)]);if(!unit.rowCount)throw Object.assign(new Error('Unit does not belong to this property'),{status:400})}
}

router.get('/visitors',async(req:AuthedRequest,res)=>{
  const result=await query(`SELECT v.*,p.name property_name,u.unit_number,trim(concat(ru.first_name,' ',ru.last_name)) registered_by_name,rou.role registered_by_role FROM visitor_logs v JOIN properties p ON p.id=v.property_id LEFT JOIN units u ON u.id=v.unit_id LEFT JOIN users ru ON ru.id=v.registered_by LEFT JOIN organization_users rou ON rou.user_id=ru.id AND rou.organization_id=v.organization_id WHERE v.organization_id=$1 AND (cardinality($2::uuid[])=0 OR v.property_id=ANY($2::uuid[])) ORDER BY v.checked_in_at DESC LIMIT 500`,[org(req),scope(req)]);
  res.json(result.rows);
});

router.post('/visitors',requirePermission('maintenance.write'),async(req:AuthedRequest,res)=>{
  const input=z.object({propertyId:z.string().uuid(),unitId:z.string().uuid().optional(),visitorName:z.string().trim().min(2).max(120),phone:z.string().trim().max(40).optional(),vehiclePlate:z.string().trim().max(30).optional(),approvedBy:z.string().trim().max(120).optional()}).safeParse(req.body);
  if(!input.success)return res.status(400).json({error:'Complete the visitor name and property',fields:input.error.flatten().fieldErrors});
  const d=input.data;await verifyLocation(req,d.propertyId,d.unitId);
  const result=await query(`INSERT INTO visitor_logs(organization_id,property_id,unit_id,visitor_name,phone,vehicle_plate,approved_by,registered_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[org(req),d.propertyId,d.unitId||null,d.visitorName,d.phone||null,d.vehiclePlate||null,d.approvedBy||null,req.auth!.userId]);
  res.status(201).json(result.rows[0]);
});

router.patch('/visitors/:id/checkout',requirePermission('maintenance.write'),async(req:AuthedRequest,res)=>{
  const id=z.string().uuid().safeParse(req.params.id);if(!id.success)return res.status(400).json({error:'Invalid visitor record'});
  const result=await query(`UPDATE visitor_logs SET checked_out_at=coalesce(checked_out_at,now()) WHERE id=$1 AND organization_id=$2 AND (cardinality($3::uuid[])=0 OR property_id=ANY($3::uuid[])) RETURNING *`,[id.data,org(req),scope(req)]);
  if(!result.rowCount)return res.status(404).json({error:'Visitor record not found'});res.json(result.rows[0]);
});

router.get('/complaints',async(req:AuthedRequest,res)=>{
  const result=await query(`SELECT c.*,p.name property_name,u.unit_number,trim(concat(rt.first_name,' ',rt.last_name)) tenant_name FROM complaints c LEFT JOIN properties p ON p.id=c.property_id LEFT JOIN units u ON u.id=c.unit_id LEFT JOIN rental_tenants rt ON rt.id=c.tenant_id WHERE c.organization_id=$1 AND (cardinality($2::uuid[])=0 OR c.property_id=ANY($2::uuid[])) ORDER BY CASE c.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,c.created_at DESC LIMIT 500`,[org(req),scope(req)]);
  res.json(result.rows);
});

router.post('/complaints',requirePermission('maintenance.write'),async(req:AuthedRequest,res)=>{
  const input=z.object({propertyId:z.string().uuid(),unitId:z.string().uuid().optional(),tenantId:z.string().uuid().optional(),category:z.string().trim().min(2).max(80),priority:z.enum(['low','normal','high','urgent']).default('normal'),subject:z.string().trim().min(3).max(160),description:z.string().trim().max(2000).optional()}).safeParse(req.body);
  if(!input.success)return res.status(400).json({error:'Complete the complaint details',fields:input.error.flatten().fieldErrors});
  const d=input.data;await verifyLocation(req,d.propertyId,d.unitId);
  if(d.tenantId){const tenant=await query(`SELECT 1 FROM rental_tenants rt JOIN leases l ON l.tenant_id=rt.id JOIN units u ON u.id=l.unit_id WHERE rt.id=$1 AND rt.organization_id=$2 AND u.property_id=$3 LIMIT 1`,[d.tenantId,org(req),d.propertyId]);if(!tenant.rowCount)return res.status(400).json({error:'Tenant does not belong to this property'})}
  const result=await query(`INSERT INTO complaints(organization_id,property_id,unit_id,tenant_id,category,priority,subject,description,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'open') RETURNING *`,[org(req),d.propertyId,d.unitId||null,d.tenantId||null,d.category,d.priority,d.subject,d.description||null]);
  res.status(201).json(result.rows[0]);
});

router.patch('/complaints/:id/status',requirePermission('maintenance.write'),async(req:AuthedRequest,res)=>{
  const id=z.string().uuid().safeParse(req.params.id),body=z.object({status:z.enum(['open','in_progress','resolved','closed'])}).safeParse(req.body);
  if(!id.success||!body.success)return res.status(400).json({error:'Choose a valid complaint status'});
  const result=await query(`UPDATE complaints SET status=$1,resolved_at=CASE WHEN $1 IN ('resolved','closed') THEN coalesce(resolved_at,now()) ELSE NULL END WHERE id=$2 AND organization_id=$3 AND (cardinality($4::uuid[])=0 OR property_id=ANY($4::uuid[])) RETURNING *`,[body.data.status,id.data,org(req),scope(req)]);
  if(!result.rowCount)return res.status(404).json({error:'Complaint not found'});res.json(result.rows[0]);
});

export default router;

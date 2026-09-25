import { Router } from "express";
import { resolve } from "path";
import { z } from "zod";
import { type AuthedRequest } from "./auth.js";
import { query } from "./db.js";

const router = Router();

async function portalTenant(req: AuthedRequest) {
  if (!req.auth || req.auth.role !== "tenant")
    throw Object.assign(new Error("Tenant portal access required"), {
      status: 403,
    });
  const result = await query<{ tenant_id: string }>(
    `SELECT tenant_id FROM tenant_portal_accounts WHERE organization_id=$1 AND user_id=$2`,
    [req.auth.organizationId, req.auth.userId],
  );
  if (!result.rowCount)
    throw Object.assign(
      new Error("This account is not linked to a tenant record"),
      { status: 403 },
    );
  return {
    organizationId: req.auth.organizationId,
    tenantId: result.rows[0].tenant_id,
    userId: req.auth.userId,
  };
}

router.get("/portal", async (req: AuthedRequest, res) => {
  const account = await portalTenant(req),
    o = account.organizationId,
    t = account.tenantId;
  const [tenant, payments, invoices, documents, tickets] = await Promise.all([
    query(
      `SELECT rt.id,rt.first_name,rt.last_name,rt.email,rt.phone,l.id lease_id,l.lease_number,l.start_date,l.end_date,l.monthly_rent,l.due_day,l.status lease_status,u.id unit_id,u.unit_number,p.id property_id,p.name property_name,p.address property_address
      FROM rental_tenants rt
      LEFT JOIN LATERAL (SELECT * FROM leases x WHERE x.organization_id=rt.organization_id AND x.tenant_id=rt.id ORDER BY CASE WHEN x.status IN ('active','expiring') THEN 0 ELSE 1 END,x.end_date DESC LIMIT 1) l ON true
      LEFT JOIN units u ON u.id=l.unit_id LEFT JOIN properties p ON p.id=u.property_id
      WHERE rt.organization_id=$1 AND rt.id=$2`,
      [o, t],
    ),
    query(
      `SELECT p.id,p.reference,p.payment_method,p.amount,p.paid_at,p.status,(SELECT r.id FROM tenant_payment_requests r WHERE r.payment_id=p.id ORDER BY r.created_at DESC LIMIT 1) payment_request_id FROM payments p WHERE p.organization_id=$1 AND p.tenant_id=$2 ORDER BY p.paid_at DESC LIMIT 100`,
      [o, t],
    ),
    query(
      `SELECT id,invoice_number,period_start,period_end,due_date,total,paid_amount,status,created_at FROM invoices WHERE organization_id=$1 AND tenant_id=$2 ORDER BY due_date DESC LIMIT 100`,
      [o, t],
    ),
    query(
      `SELECT d.* FROM documents d WHERE d.organization_id=$1 AND ((d.entity_type='tenant' AND d.entity_id=$2) OR (d.entity_type='lease' AND d.entity_id IN (SELECT id FROM leases WHERE organization_id=$1 AND tenant_id=$2))) ORDER BY d.created_at DESC LIMIT 100`,
      [o, t],
    ),
    query(
      `SELECT id,category,priority,subject,description,status,created_at,resolved_at FROM complaints WHERE organization_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 100`,
      [o, t],
    ),
  ]);
  if (!tenant.rowCount)
    return res.status(404).json({ error: "Tenant record not found" });
  const balance = invoices.rows.reduce(
    (sum: number, item: any) =>
      sum +
      Math.max(0, Number(item.total || 0) - Number(item.paid_amount || 0)),
    0,
  );
  const documentRows = (documents.rows as any[]).map((item) => ({
    id: item.id,
    name:
      item.name ||
      item.title ||
      item.file_name ||
      item.document_type ||
      "Tenant document",
    type: item.document_type || item.category || item.entity_type || "Document",
    status: item.status || "available",
    created_at: item.created_at,
    url: item.storage_key
      ? `/api/portal/documents/${item.id}`
      : item.file_url || item.download_url || item.url || null,
  }));
  res.json({
    tenant: tenant.rows[0],
    balance,
    payments: payments.rows,
    invoices: invoices.rows,
    documents: documentRows,
    tickets: tickets.rows,
  });
});

router.get("/portal/documents/:id", async (req: AuthedRequest, res) => {
  const account = await portalTenant(req),
    id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Invalid document" });
  const result = await query<any>(
    `SELECT d.file_name,d.storage_key FROM documents d WHERE d.id=$1 AND d.organization_id=$2 AND ((d.entity_type='tenant' AND d.entity_id=$3) OR (d.entity_type='lease' AND d.entity_id IN (SELECT id FROM leases WHERE organization_id=$2 AND tenant_id=$3)))`,
    [id.data, account.organizationId, account.tenantId],
  );
  if (!result.rowCount || !result.rows[0].storage_key)
    return res.status(404).json({ error: "Document not found" });
  const root = resolve(
      process.env.DOCUMENT_STORAGE_ROOT || "/opt/realestate/uploads",
    ),
    file = resolve(root, result.rows[0].storage_key);
  if (!file.startsWith(`${root}/`) && !file.startsWith(`${root}\\`))
    return res.status(400).json({ error: "Invalid document path" });
  res.download(file, result.rows[0].file_name);
});

router.post("/portal/tickets", async (req: AuthedRequest, res) => {
  const account = await portalTenant(req);
  const input = z
    .object({
      category: z.enum([
        "maintenance",
        "water",
        "payment",
        "security",
        "noise",
        "other",
      ]),
      priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      subject: z.string().trim().min(3).max(160),
      description: z.string().trim().min(5).max(2000),
    })
    .safeParse(req.body);
  if (!input.success)
    return res
      .status(400)
      .json({
        error: "Please complete the ticket details",
        fields: input.error.flatten().fieldErrors,
      });
  const home = await query<{ property_id: string; unit_id: string }>(
    `SELECT u.property_id,l.unit_id FROM leases l JOIN units u ON u.id=l.unit_id WHERE l.organization_id=$1 AND l.tenant_id=$2 AND l.status IN ('active','expiring') ORDER BY l.end_date DESC LIMIT 1`,
    [account.organizationId, account.tenantId],
  );
  if (!home.rowCount)
    return res
      .status(409)
      .json({ error: "No active home is linked to this tenant account" });
  const d = input.data,
    h = home.rows[0];
  const result = await query(
    `INSERT INTO complaints(organization_id,property_id,unit_id,tenant_id,category,priority,subject,description,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'open') RETURNING id,category,priority,subject,description,status,created_at,resolved_at`,
    [
      account.organizationId,
      h.property_id,
      h.unit_id,
      account.tenantId,
      d.category,
      d.priority,
      d.subject,
      d.description,
    ],
  );
  await query(
    `INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'tenant.ticket_created','complaint',$3,$4::jsonb)`,
    [
      account.organizationId,
      account.userId,
      result.rows[0].id,
      JSON.stringify({ tenantId: account.tenantId }),
    ],
  );
  res.status(201).json(result.rows[0]);
});

export default router;

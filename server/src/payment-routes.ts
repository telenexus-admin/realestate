import { createHash, randomBytes, randomUUID } from "crypto";
import { Router } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { requirePermission, type AuthedRequest } from "./auth.js";
import { query } from "./db.js";
import {
  BANKS,
  completePaymentRequest,
  encryptBankAccount,
  initiateDirectBankStk,
  normalizePhone,
} from "./payment-service.js";

const router = Router(),
  publicRouter = Router();
function org(req: AuthedRequest) {
  if (!req.auth?.organizationId)
    throw new Error("Organization context missing");
  return req.auth.organizationId;
}
async function portalAccount(req: AuthedRequest) {
  if (!req.auth || req.auth.role !== "tenant")
    throw Object.assign(new Error("Tenant portal access required"), {
      status: 403,
    });
  const result = await query<any>(
    `SELECT tpa.tenant_id,rt.first_name,rt.last_name,rt.phone FROM tenant_portal_accounts tpa JOIN rental_tenants rt ON rt.id=tpa.tenant_id WHERE tpa.organization_id=$1 AND tpa.user_id=$2`,
    [req.auth.organizationId, req.auth.userId],
  );
  if (!result.rowCount)
    throw Object.assign(
      new Error("This account is not linked to a tenant record"),
      { status: 403 },
    );
  return {
    organizationId: req.auth.organizationId,
    userId: req.auth.userId,
    ...result.rows[0],
  };
}

router.get(
  "/payment-settings",
  requirePermission("team.write"),
  async (req: AuthedRequest, res) => {
    const found = await query(
      `SELECT id,institution_code,bank_name,account_name,masked_account,branch_name,mpesa_paybill,verification_status,routing_status,is_active,review_notes,updated_at FROM organization_payment_destinations WHERE organization_id=$1`,
      [org(req)],
    );
    res.json({
      provider: "polyizon_stk",
      institutions: BANKS.map(({ code, name, paybill, hint }) => ({
        code,
        name,
        paybill,
        hint,
      })),
      profile: found.rows[0] || null,
    });
  },
);

router.put(
  "/payment-settings/destination",
  requirePermission("team.write"),
  async (req: AuthedRequest, res) => {
    const input = z
      .object({
        institutionCode: z.string(),
        accountName: z.string().trim().min(2).max(120),
        accountNumber: z.string().trim().max(80).default(""),
        branchName: z.string().trim().max(120).default(""),
      })
      .safeParse(req.body);
    if (!input.success)
      return res
        .status(400)
        .json({ error: "Complete the bank destination details" });
    const d = input.data,
      bank = BANKS.find((item) => item.code === d.institutionCode),
      account = d.accountNumber.replace(/\s/g, "");
    if (!bank)
      return res.status(400).json({ error: "Choose a supported bank" });
    const existing = await query<any>(
      `SELECT institution_code,account_ciphertext,masked_account FROM organization_payment_destinations WHERE organization_id=$1`,
      [org(req)],
    );
    const canKeep =
      !account &&
      existing.rows[0]?.institution_code === bank.code &&
      existing.rows[0]?.account_ciphertext;
    if (!canKeep && !bank.pattern.test(account))
      return res.status(400).json({ error: `Enter a valid ${bank.hint}` });
    const ciphertext = account
        ? encryptBankAccount(account)
        : existing.rows[0].account_ciphertext,
      masked = account
        ? `••••${account.slice(-4)}`
        : existing.rows[0].masked_account;
    const saved = await query(
      `INSERT INTO organization_payment_destinations(organization_id,institution_code,bank_name,account_name,account_ciphertext,masked_account,branch_name,mpesa_paybill,verification_status,routing_status,is_active,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending','disabled',false,$9) ON CONFLICT(organization_id) DO UPDATE SET institution_code=excluded.institution_code,bank_name=excluded.bank_name,account_name=excluded.account_name,account_ciphertext=excluded.account_ciphertext,masked_account=excluded.masked_account,branch_name=excluded.branch_name,mpesa_paybill=excluded.mpesa_paybill,verification_status='pending',routing_status='disabled',is_active=false,reviewed_by=NULL,reviewed_at=NULL,review_notes=NULL,updated_at=now() RETURNING id,institution_code,bank_name,account_name,masked_account,branch_name,mpesa_paybill,verification_status,routing_status,is_active,updated_at`,
      [
        org(req),
        bank.code,
        bank.name,
        d.accountName,
        ciphertext,
        masked,
        d.branchName || null,
        bank.paybill,
        req.auth!.userId,
      ],
    );
    await query(
      `INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'payment.destination_submitted','payment_destination',$3,$4::jsonb)`,
      [
        org(req),
        req.auth!.userId,
        saved.rows[0].id,
        JSON.stringify({ bank: bank.name, maskedAccount: masked }),
      ],
    );
    res.json(saved.rows[0]);
  },
);

router.get("/portal/payment-options", async (req: AuthedRequest, res) => {
  const account = await portalAccount(req);
  const [destination, lease, invoices] = await Promise.all([
    query<any>(
      `SELECT bank_name,masked_account,mpesa_paybill FROM organization_payment_destinations WHERE organization_id=$1 AND verification_status='verified' AND routing_status='active' AND is_active=true`,
      [account.organizationId],
    ),
    query<any>(
      `SELECT id,monthly_rent FROM leases WHERE organization_id=$1 AND tenant_id=$2 AND status IN ('active','expiring') ORDER BY start_date DESC LIMIT 1`,
      [account.organizationId, account.tenant_id],
    ),
    query<any>(
      `SELECT coalesce(sum(total-paid_amount),0) balance FROM invoices WHERE organization_id=$1 AND tenant_id=$2 AND status IN ('issued','partial','overdue')`,
      [account.organizationId, account.tenant_id],
    ),
  ]);
  res.json({
    ready: !!destination.rowCount,
    destination: destination.rows[0] || null,
    monthlyRent: Number(lease.rows[0]?.monthly_rent || 0),
    balance: Number(invoices.rows[0]?.balance || 0),
    phone: account.phone || "",
  });
});

router.post("/portal/payments/stk", async (req: AuthedRequest, res) => {
  const account = await portalAccount(req),
    input = z
      .object({
        mode: z.enum(["overdue", "months"]),
        months: z.number().int().min(1).max(12).optional(),
        phone: z.string().trim().min(9).max(30),
      })
      .safeParse(req.body);
  if (!input.success)
    return res
      .status(400)
      .json({ error: "Choose what to pay and enter a valid phone number" });
  const d = input.data,
    destination = await query<any>(
      `SELECT * FROM organization_payment_destinations WHERE organization_id=$1 AND verification_status='verified' AND routing_status='active' AND is_active=true`,
      [account.organizationId],
    );
  if (!destination.rowCount)
    return res
      .status(409)
      .json({
        error: "Online rent payment is not active for this property yet",
      });
  const [lease, balance] = await Promise.all([
    query<any>(
      `SELECT id,monthly_rent FROM leases WHERE organization_id=$1 AND tenant_id=$2 AND status IN ('active','expiring') ORDER BY start_date DESC LIMIT 1`,
      [account.organizationId, account.tenant_id],
    ),
    query<any>(
      `SELECT coalesce(sum(total-paid_amount),0) balance FROM invoices WHERE organization_id=$1 AND tenant_id=$2 AND status IN ('issued','partial','overdue')`,
      [account.organizationId, account.tenant_id],
    ),
  ]);
  if (!lease.rowCount)
    return res
      .status(409)
      .json({ error: "No active lease is linked to your account" });
  const amount =
    d.mode === "overdue"
      ? Number(balance.rows[0].balance)
      : Number(lease.rows[0].monthly_rent) * Number(d.months || 1);
  if (!Number.isFinite(amount) || amount < 1)
    return res
      .status(400)
      .json({
        error:
          d.mode === "overdue"
            ? "You do not have an overdue balance"
            : "Your monthly rent is not configured",
      });
  let phone;
  try {
    phone = normalizePhone(d.phone);
  } catch (error) {
    return res
      .status(400)
      .json({
        error: error instanceof Error ? error.message : "Invalid phone number",
      });
  }
  const id = randomUUID(),
    callbackToken = randomBytes(32).toString("base64url"),
    externalReference = `RENT-${id.slice(0, 8).toUpperCase()}`,
    dest = destination.rows[0];
  await query(
    `INSERT INTO tenant_payment_requests(id,organization_id,tenant_id,lease_id,destination_id,mode,months,amount,phone,external_reference,callback_token_hash,destination_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
    [
      id,
      account.organizationId,
      account.tenant_id,
      lease.rows[0].id,
      dest.id,
      d.mode,
      d.mode === "months" ? d.months : null,
      amount,
      phone,
      externalReference,
      createHash("sha256").update(callbackToken).digest("hex"),
      JSON.stringify({
        bankName: dest.bank_name,
        maskedAccount: dest.masked_account,
        paybill: dest.mpesa_paybill,
      }),
    ],
  );
  try {
    const result = await initiateDirectBankStk({
      requestId: id,
      organizationId: account.organizationId,
      tenantName: `${account.first_name} ${account.last_name}`,
      phone,
      amount,
      destination: dest,
      callbackToken,
    });
    res.status(201).json({ ...result, amount, externalReference });
  } catch (error) {
    res
      .status(502)
      .json({
        error:
          error instanceof Error
            ? error.message
            : "Could not send the M-Pesa prompt",
        requestId: id,
      });
  }
});

router.get("/portal/payments/requests/:id", async (req: AuthedRequest, res) => {
  const account = await portalAccount(req),
    id = z.string().uuid().safeParse(req.params.id);
  if (!id.success)
    return res.status(400).json({ error: "Invalid payment request" });
  const found = await query(
    `SELECT id,mode,months,amount,status,result_description,mpesa_receipt,transaction_at,payment_id,created_at FROM tenant_payment_requests WHERE id=$1 AND organization_id=$2 AND tenant_id=$3`,
    [id.data, account.organizationId, account.tenant_id],
  );
  if (!found.rowCount)
    return res.status(404).json({ error: "Payment request not found" });
  res.json(found.rows[0]);
});

router.get("/portal/payments/:id/receipt", async (req: AuthedRequest, res) => {
  const account = await portalAccount(req),
    id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Invalid receipt" });
  const found = await query<any>(
    `SELECT r.id,r.amount,r.mpesa_receipt,r.transaction_at,r.destination_snapshot,rt.first_name,rt.last_name,o.name organization_name,u.unit_number,p.name property_name FROM tenant_payment_requests r JOIN rental_tenants rt ON rt.id=r.tenant_id JOIN organizations o ON o.id=r.organization_id LEFT JOIN leases l ON l.id=r.lease_id LEFT JOIN units u ON u.id=l.unit_id LEFT JOIN properties p ON p.id=u.property_id WHERE r.id=$1 AND r.organization_id=$2 AND r.tenant_id=$3 AND r.status='paid'`,
    [id.data, account.organizationId, account.tenant_id],
  );
  if (!found.rowCount)
    return res.status(404).json({ error: "Confirmed receipt not found" });
  const row = found.rows[0],
    doc = new PDFDocument({ size: "A4", margin: 54 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="receipt-${row.mpesa_receipt}.pdf"`,
  );
  doc.pipe(res);
  doc.fontSize(11).fillColor("#167d7f").text("POLYIZON PROPERTY MANAGER");
  doc.moveDown(0.5).fontSize(25).fillColor("#102a38").text("Payment receipt");
  doc
    .moveDown()
    .fontSize(11)
    .fillColor("#52666d")
    .text(`Receipt: ${row.mpesa_receipt}`)
    .text(
      `Date: ${new Date(row.transaction_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}`,
    );
  doc
    .moveDown(1.5)
    .fillColor("#102a38")
    .fontSize(13)
    .text(`${row.first_name} ${row.last_name}`)
    .fontSize(10)
    .fillColor("#52666d")
    .text(
      `${row.property_name || row.organization_name}${row.unit_number ? ` · Unit ${row.unit_number}` : ""}`,
    );
  doc
    .moveDown(2)
    .fontSize(12)
    .fillColor("#52666d")
    .text("Amount paid")
    .fontSize(28)
    .fillColor("#102a38")
    .text(
      `KES ${Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`,
    );
  doc
    .moveDown()
    .fontSize(10)
    .fillColor("#52666d")
    .text(
      `Paid via M-Pesa to ${(row.destination_snapshot || {}).bankName || "property bank account"} ${(row.destination_snapshot || {}).maskedAccount || ""}`,
    );
  doc
    .moveDown(3)
    .fontSize(9)
    .text(
      "This receipt was generated automatically after M-Pesa confirmed the transaction.",
    );
  doc.end();
});

publicRouter.post("/payments/stk-callback/:id", async (req, res) => {
  try {
    await completePaymentRequest(
      req.params.id,
      String(req.query.token || ""),
      req.body,
    );
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    const status = (error as any)?.status || 500;
    console.error("rent_stk_callback_failed", error);
    res.status(status).json({ ResultCode: 1, ResultDesc: "Rejected" });
  }
});

export { publicRouter as paymentPublicRouter };
export default router;

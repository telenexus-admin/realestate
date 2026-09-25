import { createHash, randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { pool, query } from "./db.js";
import { completePaymentRequest } from "./payment-service.js";

async function main() {
  const session = await query<any>(
    `SELECT s.id session_id,s.user_id,s.organization_id FROM auth_sessions s JOIN organization_users ou ON ou.organization_id=s.organization_id AND ou.user_id=s.user_id WHERE s.revoked_at IS NULL AND s.expires_at>now() AND ou.role IN ('owner','admin') ORDER BY s.last_seen_at DESC LIMIT 1`,
  );
  if (!session.rowCount)
    throw new Error(
      "No active owner or admin session is available for the payment smoke test",
    );
  const row = session.rows[0],
    token = jwt.sign(
      {
        userId: row.user_id,
        organizationId: row.organization_id,
        sessionId: row.session_id,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "2m", issuer: "polyizon", audience: "propos-api" },
    ),
    headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  const settings = await fetch("http://127.0.0.1:4010/api/payment-settings", {
      headers,
    }),
    body = (await settings.json()) as any;
  if (settings.status !== 200)
    throw new Error(`Payment settings returned ${settings.status}`);
  if (!Array.isArray(body.institutions) || body.institutions.length !== 9)
    throw new Error("Supported bank list is incomplete");
  if (JSON.stringify(body).includes("account_ciphertext"))
    throw new Error("Payment settings leaked an encrypted bank account");
  const callback = await fetch(
    `http://127.0.0.1:4010/api/public/payments/stk-callback/${randomUUID()}?token=invalid`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Body: { stkCallback: { ResultCode: 0 } } }),
    },
  );
  if (callback.status !== 403)
    throw new Error(`Invalid callback token returned ${callback.status}`);
  const tenantId = randomUUID(),
    requestId = randomUUID(),
    callbackToken = randomUUID(),
    receipt = `SMOKE${Date.now()}`,
    invoiceNumber = `SMOKE-${Date.now()}`;
  try {
    await query(
      `INSERT INTO rental_tenants(id,organization_id,first_name,last_name,phone) VALUES($1,$2,'Payment','Smoke','254700000001')`,
      [tenantId, row.organization_id],
    );
    const invoice = await query<any>(
      `INSERT INTO invoices(organization_id,tenant_id,invoice_number,due_date,subtotal,tax,total,paid_amount,status) VALUES($1,$2,$3,current_date,100,0,100,0,'issued') RETURNING id`,
      [row.organization_id, tenantId, invoiceNumber],
    );
    await query(
      `INSERT INTO tenant_payment_requests(id,organization_id,tenant_id,mode,amount,phone,external_reference,checkout_request_id,callback_token_hash,status) VALUES($1,$2,$3,'overdue',100,'254700000001',$4,$5,$6,'queued')`,
      [
        requestId,
        row.organization_id,
        tenantId,
        `SMOKE-${requestId}`,
        `CHK-${requestId}`,
        createHash("sha256").update(callbackToken).digest("hex"),
      ],
    );
    const paid = await completePaymentRequest(requestId, callbackToken, {
      Body: {
        stkCallback: {
          CheckoutRequestID: `CHK-${requestId}`,
          ResultCode: 0,
          ResultDesc: "Success",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: 100 },
              { Name: "MpesaReceiptNumber", Value: receipt },
              { Name: "PhoneNumber", Value: 254700000001 },
            ],
          },
        },
      },
    });
    if (paid.status !== "paid")
      throw new Error("Synthetic callback was not posted");
    const updated = await query<any>(
      `SELECT status,paid_amount FROM invoices WHERE id=$1`,
      [invoice.rows[0].id],
    );
    if (
      updated.rows[0]?.status !== "paid" ||
      Number(updated.rows[0]?.paid_amount) !== 100
    )
      throw new Error("Synthetic payment was not allocated to its invoice");
  } finally {
    await query(
      `DELETE FROM payments WHERE organization_id=$1 AND tenant_id=$2`,
      [row.organization_id, tenantId],
    ).catch(() => undefined);
    await query(
      `DELETE FROM invoices WHERE organization_id=$1 AND tenant_id=$2`,
      [row.organization_id, tenantId],
    ).catch(() => undefined);
    await query(`DELETE FROM tenant_payment_requests WHERE id=$1`, [
      requestId,
    ]).catch(() => undefined);
    await query(`DELETE FROM rental_tenants WHERE id=$1`, [tenantId]).catch(
      () => undefined,
    );
  }
  console.log(
    `Payment smoke passed: ${body.institutions.length} supported banks, safe settings, protected callback, payment posting and invoice allocation.`,
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

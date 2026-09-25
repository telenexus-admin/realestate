import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { query, withTransaction } from "./db.js";

export const BANKS = [
  {
    code: "equity",
    name: "Equity Bank Kenya",
    paybill: "247247",
    pattern: /^\d{10,20}$/,
    hint: "10 to 20 digit Equity account number",
  },
  {
    code: "coop",
    name: "Co-operative Bank of Kenya",
    paybill: "400200",
    pattern: /^\d{14}$/,
    hint: "14 digit Co-op account number",
  },
  {
    code: "kcb",
    name: "KCB Bank Kenya",
    paybill: "522522",
    pattern: /^\d{4,40}$/,
    hint: "KCB account number",
  },
  {
    code: "ncba",
    name: "NCBA Bank Kenya",
    paybill: "880100",
    pattern: /^\d{5,20}$/,
    hint: "5 to 20 digit NCBA collection reference",
  },
  {
    code: "im_bank",
    name: "I&M Bank Kenya",
    paybill: "542542",
    pattern: /^\d{14}$/,
    hint: "14 digit I&M account number",
  },
  {
    code: "absa",
    name: "Absa Bank Kenya",
    paybill: "303030",
    pattern: /^\d{4,40}$/,
    hint: "Absa account number",
  },
  {
    code: "dtb",
    name: "Diamond Trust Bank Kenya",
    paybill: "516600",
    pattern: /^\d{4,40}$/,
    hint: "DTB account number",
  },
  {
    code: "family",
    name: "Family Bank Kenya",
    paybill: "222111",
    pattern: /^\d{4,40}$/,
    hint: "Family Bank account number",
  },
  {
    code: "prime",
    name: "Prime Bank Kenya",
    paybill: "982800",
    pattern: /^\d{4,40}$/,
    hint: "Prime Bank account number",
  },
] as const;

const key = createHash("sha256")
  .update(
    `${process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET || "development"}:bank-destination`,
  )
  .digest();
export function encryptBankAccount(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv),
    encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function decryptBankAccount(value: string) {
  const packed = Buffer.from(value, "base64url"),
    iv = packed.subarray(0, 12),
    tag = packed.subarray(12, 28),
    encrypted = packed.subarray(28),
    decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}
export function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `254${digits.slice(1)}`;
  if (digits.startsWith("7") || digits.startsWith("1")) digits = `254${digits}`;
  if (!/^254[17]\d{8}$/.test(digits))
    throw new Error("Enter a valid Safaricom M-Pesa phone number");
  return digits;
}
function timestamp() {
  const now = new Date(),
    parts = [
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
    ];
  return parts
    .map((value, index) =>
      index ? String(value).padStart(2, "0") : String(value),
    )
    .join("");
}
async function accessToken() {
  const consumerKey = process.env.DARAJA_CONSUMER_KEY,
    secret = process.env.DARAJA_CONSUMER_SECRET;
  if (!consumerKey || !secret)
    throw new Error("Polyizon M-Pesa collection is not configured");
  const base =
    process.env.DARAJA_ENVIRONMENT === "sandbox"
      ? "https://sandbox.safaricom.co.ke"
      : "https://api.safaricom.co.ke";
  const response = await fetch(
    `${base}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${consumerKey}:${secret}`).toString("base64")}`,
      },
    },
  );
  const data = (await response.json()) as any;
  if (!response.ok || !data.access_token)
    throw new Error(data.errorMessage || "Could not connect to M-Pesa");
  return { token: data.access_token, base };
}

export async function initiateDirectBankStk(input: {
  requestId: string;
  organizationId: string;
  tenantName: string;
  phone: string;
  amount: number;
  destination: any;
  callbackToken: string;
}) {
  const shortcode = process.env.DARAJA_SHORTCODE,
    passkey = process.env.DARAJA_PASSKEY;
  if (
    !shortcode ||
    !passkey ||
    !/^true$/i.test(process.env.DARAJA_DIRECT_BANK_ENABLED || "")
  )
    throw new Error("Polyizon direct-bank M-Pesa collection is not enabled");
  const phone = normalizePhone(input.phone),
    stamp = timestamp(),
    account = decryptBankAccount(input.destination.account_ciphertext),
    auth = await accessToken();
  const callbackBase = (
    process.env.PUBLIC_BASE_URL || "https://propos.polyizon.tech"
  ).replace(/\/$/, "");
  const payload = {
    BusinessShortCode: shortcode,
    Password: Buffer.from(`${shortcode}${passkey}${stamp}`).toString("base64"),
    Timestamp: stamp,
    TransactionType:
      process.env.DARAJA_TRANSACTION_TYPE || "CustomerPayBillOnline",
    Amount: Math.round(input.amount),
    PartyA: phone,
    PartyB: input.destination.mpesa_paybill,
    PhoneNumber: phone,
    CallBackURL: `${callbackBase}/api/public/payments/stk-callback/${input.requestId}?token=${encodeURIComponent(input.callbackToken)}`,
    AccountReference: account,
    TransactionDesc: `Rent payment · ${input.tenantName}`.slice(0, 100),
  };
  const response = await fetch(`${auth.base}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    }),
    data = (await response.json().catch(() => ({}))) as any;
  const accepted = response.ok && String(data.ResponseCode) === "0";
  await query(
    `UPDATE tenant_payment_requests SET checkout_request_id=$1,merchant_request_id=$2,status=$3,result_description=$4,raw_response=$5::jsonb,updated_at=now() WHERE id=$6 AND organization_id=$7`,
    [
      data.CheckoutRequestID || null,
      data.MerchantRequestID || null,
      accepted ? "queued" : "failed",
      data.ResponseDescription || data.CustomerMessage || null,
      JSON.stringify(data),
      input.requestId,
      input.organizationId,
    ],
  );
  if (!accepted)
    throw new Error(
      data.errorMessage ||
        data.ResponseDescription ||
        data.CustomerMessage ||
        "M-Pesa rejected the payment request",
    );
  return {
    requestId: input.requestId,
    status: "queued",
    customerMessage:
      data.CustomerMessage || "Check your phone and enter your M-Pesa PIN",
  };
}

export function parseStkCallback(body: any) {
  const callback = body?.Body?.stkCallback || body?.stkCallback || body || {},
    items = callback?.CallbackMetadata?.Item || [];
  const values = Object.fromEntries(
    items.map((item: any) => [item.Name, item.Value]),
  );
  return {
    checkoutRequestId: String(callback.CheckoutRequestID || ""),
    merchantRequestId: String(callback.MerchantRequestID || ""),
    resultCode: String(callback.ResultCode ?? ""),
    description: String(callback.ResultDesc || ""),
    receipt: values.MpesaReceiptNumber
      ? String(values.MpesaReceiptNumber)
      : null,
    amount: Number(values.Amount || 0),
    phone: values.PhoneNumber ? String(values.PhoneNumber) : null,
    transactionDate: values.TransactionDate
      ? String(values.TransactionDate)
      : null,
  };
}

function parsedTransactionDate(value: string | null) {
  if (!value || !/^\d{14}$/.test(value)) return new Date();
  return new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+03:00`,
  );
}
export async function completePaymentRequest(
  requestId: string,
  token: string,
  body: any,
) {
  const tokenHash = createHash("sha256").update(token).digest("hex"),
    callback = parseStkCallback(body);
  return withTransaction(async (client) => {
    const found = await client.query<any>(
      `SELECT r.*,d.bank_name,d.masked_account FROM tenant_payment_requests r LEFT JOIN organization_payment_destinations d ON d.id=r.destination_id WHERE r.id=$1 AND r.callback_token_hash=$2 FOR UPDATE OF r`,
      [requestId, tokenHash],
    );
    if (!found.rowCount)
      throw Object.assign(new Error("Invalid payment callback"), {
        status: 403,
      });
    const request = found.rows[0];
    if (request.status === "paid") return request;
    if (
      callback.checkoutRequestId &&
      request.checkout_request_id &&
      callback.checkoutRequestId !== request.checkout_request_id
    )
      throw Object.assign(new Error("Payment callback reference mismatch"), {
        status: 409,
      });
    if (
      callback.resultCode === "0" &&
      callback.amount &&
      Math.abs(callback.amount - Number(request.amount)) > 0.01
    )
      throw Object.assign(new Error("Payment callback amount mismatch"), {
        status: 409,
      });
    if (callback.resultCode !== "0") {
      const failed = await client.query(
        `UPDATE tenant_payment_requests SET status='failed',result_code=$1,result_description=$2,raw_response=$3::jsonb,updated_at=now() WHERE id=$4 RETURNING *`,
        [
          callback.resultCode,
          callback.description,
          JSON.stringify(body),
          requestId,
        ],
      );
      return failed.rows[0];
    }
    const receipt = callback.receipt || `MPESA-${requestId.slice(0, 8)}`,
      paidAt = parsedTransactionDate(callback.transactionDate);
    const existing = await client.query<any>(
      `SELECT id FROM payments WHERE organization_id=$1 AND reference=$2 LIMIT 1`,
      [request.organization_id, receipt],
    );
    let paymentId = existing.rows[0]?.id;
    if (!paymentId) {
      const payment = await client.query<any>(
        `INSERT INTO payments(organization_id,tenant_id,reference,provider_reference,payment_method,amount,paid_at,status,raw_payload) VALUES($1,$2,$3,$4,'mpesa', $5,$6,'posted',$7::jsonb) RETURNING id`,
        [
          request.organization_id,
          request.tenant_id,
          receipt,
          callback.checkoutRequestId || request.checkout_request_id,
          request.amount,
          paidAt,
          JSON.stringify(body),
        ],
      );
      paymentId = payment.rows[0].id;
      let remaining = Number(request.amount);
      const invoices = await client.query<any>(
        `SELECT id,total,paid_amount FROM invoices WHERE organization_id=$1 AND tenant_id=$2 AND status IN ('issued','partial','overdue') AND total>paid_amount ORDER BY due_date,created_at FOR UPDATE`,
        [request.organization_id, request.tenant_id],
      );
      for (const invoice of invoices.rows) {
        if (remaining <= 0) break;
        const due = Number(invoice.total) - Number(invoice.paid_amount),
          allocated = Math.min(due, remaining);
        await client.query(
          `INSERT INTO payment_allocations(organization_id,payment_id,invoice_id,amount) VALUES($1,$2,$3,$4) ON CONFLICT(payment_id,invoice_id) DO NOTHING`,
          [request.organization_id, paymentId, invoice.id, allocated],
        );
        await client.query(
          `UPDATE invoices SET paid_amount=least(total,paid_amount+$1),status=CASE WHEN paid_amount+$1>=total THEN 'paid' ELSE 'partial' END,updated_at=now() WHERE id=$2`,
          [allocated, invoice.id],
        );
        remaining -= allocated;
      }
      if (remaining > 0)
        await client.query(
          `INSERT INTO tenant_wallet_entries(organization_id,tenant_id,entry_type,amount,reference,source_type,source_id,metadata) VALUES($1,$2,'credit',$3,$4,'payment',$5,$6::jsonb)`,
          [
            request.organization_id,
            request.tenant_id,
            remaining,
            receipt,
            paymentId,
            JSON.stringify({ note: "Advance rent credit" }),
          ],
        );
    }
    const completed = await client.query(
      `UPDATE tenant_payment_requests SET payment_id=$1,status='paid',result_code='0',result_description=$2,mpesa_receipt=$3,transaction_at=$4,raw_response=$5::jsonb,updated_at=now() WHERE id=$6 RETURNING *`,
      [
        paymentId,
        callback.description || "Payment completed",
        receipt,
        paidAt,
        JSON.stringify(body),
        requestId,
      ],
    );
    return completed.rows[0];
  });
}

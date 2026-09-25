import { createHash, randomBytes, randomUUID } from "crypto";
import { copyFile, mkdir, writeFile } from "fs/promises";
import { join, resolve } from "path";
import type pg from "pg";
import { hashPassword } from "./auth.js";
import { agreementPdf, invoicePdf } from "./pdf.js";

type ProvisionArgs = {
  organizationId: string;
  tenantId: string;
  leaseId: string;
  createdBy: string;
  createPortal: boolean;
  sendWelcome: boolean;
  invoiceFirstRent: boolean;
  invoiceDeposit: boolean;
};
const root = () =>
  process.env.DOCUMENT_STORAGE_ROOT || "/opt/realestate/uploads";
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const money = (value: number) =>
  `KES ${value.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char]!,
  );
export function dateOnly(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime()))
    throw Object.assign(new Error("A valid lease date is required"), {
      status: 400,
    });
  return parsed.toISOString().slice(0, 10);
}

async function saveTenantDocument(
  client: pg.PoolClient,
  args: {
    organizationId: string;
    tenantId: string;
    leaseId: string;
    createdBy: string;
    fileName: string;
    content?: Buffer;
    copyFrom?: string;
    mimeType: string;
    template?: any;
    documentType: string;
  },
) {
  const relative = join(
    "tenant-documents",
    args.organizationId,
    `${randomUUID()}${args.mimeType === "application/pdf" ? ".pdf" : args.fileName.match(/\.[A-Za-z0-9]+$/)?.[0] || ""}`,
  );
  const destination = join(root(), relative);
  await mkdir(join(root(), "tenant-documents", args.organizationId), {
    recursive: true,
  });
  if (args.content) await writeFile(destination, args.content, { flag: "wx" });
  else if (args.copyFrom)
    await copyFile(resolve(root(), args.copyFrom), destination);
  else throw new Error("Document content missing");
  const size = args.content?.length ?? null;
  const document = await client.query<{ id: string }>(
    `INSERT INTO documents(organization_id,entity_type,entity_id,file_name,storage_key,mime_type,size_bytes,uploaded_by) VALUES($1,'lease',$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      args.organizationId,
      args.leaseId,
      args.fileName,
      relative,
      args.mimeType,
      size,
      args.createdBy,
    ],
  );
  await client.query(
    `INSERT INTO tenant_onboarding_issues(organization_id,tenant_id,lease_id,template_id,document_id,document_type,template_version) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [
      args.organizationId,
      args.tenantId,
      args.leaseId,
      args.template?.id || null,
      document.rows[0].id,
      args.documentType,
      args.template?.version || null,
    ],
  );
  return document.rows[0].id;
}

function replaceFields(body: string, row: any) {
  const values: Record<string, string> = {
    tenant_name: row.tenant_name,
    property_name: row.property_name,
    unit_number: row.unit_number,
    lease_number: row.lease_number,
    start_date: dateOnly(row.start_date),
    end_date: dateOnly(row.end_date),
    monthly_rent: money(Number(row.monthly_rent)),
    deposit: money(Number(row.deposit_amount)),
    organization_name: row.organization_name,
  };
  return body.replace(
    /\{\{\s*([a-z_]+)\s*\}\}/gi,
    (_match, key) => values[String(key).toLowerCase()] ?? _match,
  );
}

async function createInvoice(
  client: pg.PoolClient,
  row: any,
  kind: "rent" | "deposit",
  createdBy: string,
) {
  const isRent = kind === "rent",
    amount = Number(isRent ? row.monthly_rent : row.deposit_amount);
  if (amount <= 0) return null;
  const start = dateOnly(row.start_date),
    month = start.slice(0, 7),
    periodStart = isRent ? `${month}-01` : null;
  const periodEnd = isRent
    ? new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
      )
        .toISOString()
        .slice(0, 10)
    : null;
  const suffix = String(row.lease_number)
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(-12),
    number = `${isRent ? "RNT" : "DEP"}-${month.replace("-", "")}-${suffix}`;
  const inserted = await client.query<any>(
    `INSERT INTO invoices(organization_id,tenant_id,lease_id,invoice_number,period_start,period_end,due_date,subtotal,total,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,'issued') ON CONFLICT DO NOTHING RETURNING *`,
    [
      row.organization_id,
      row.tenant_id,
      row.lease_id,
      number,
      periodStart,
      periodEnd,
      start,
      amount,
    ],
  );
  if (!inserted.rowCount) return null;
  const invoice = inserted.rows[0],
    description = isRent
      ? `First month's rent · ${row.property_name} ${row.unit_number}`
      : `Security deposit · ${row.property_name} ${row.unit_number}`;
  await client.query(
    `INSERT INTO invoice_items(organization_id,invoice_id,item_type,description,quantity,unit_price,total) VALUES($1,$2,$3,$4,1,$5,$5)`,
    [row.organization_id, invoice.id, kind, description, amount],
  );
  const pdf = await invoicePdf({
    organization: row.organization_name,
    tenant: row.tenant_name,
    property: row.property_name,
    unit: row.unit_number,
    invoiceNumber: number,
    issuedOn: new Date().toISOString().slice(0, 10),
    dueOn: start,
    items: [{ description, amount }],
    total: amount,
  });
  const documentId = await saveTenantDocument(client, {
    organizationId: row.organization_id,
    tenantId: row.tenant_id,
    leaseId: row.lease_id,
    createdBy,
    fileName: `${number}.pdf`,
    content: pdf,
    mimeType: "application/pdf",
    documentType: `${kind}_invoice`,
  });
  return { id: invoice.id, number, amount, documentId, kind };
}

async function buildWelcome(
  client: pg.PoolClient,
  row: any,
  settings: any,
  token: string,
  attachments: string[],
  invoices: any[],
) {
  const activationUrl = `${String(settings.portal_base_url || "https://propos.polyizon.tech").replace(/\/$/, "")}/activate?token=${encodeURIComponent(token)}`;
  const invoiceLines = invoices
    .map(
      (item) =>
        `<li>${item.kind === "rent" ? "First month's rent" : "Security deposit"}: <strong>${money(item.amount)}</strong> (${escapeHtml(item.number)})</li>`,
    )
    .join("");
  const subject = `Welcome to ${row.property_name} — your PropOS account`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fa;font-family:Arial,sans-serif;color:#172033"><div style="max-width:620px;margin:24px auto;background:#fff;border:1px solid #e5e9f0;border-radius:14px;overflow:hidden"><div style="padding:24px 28px;background:#111827;color:#fff"><div style="font-size:22px;font-weight:800">PropOS</div><div style="font-size:12px;color:#cbd5e1">by Polyizon</div></div><div style="padding:28px"><h1 style="font-size:24px;margin:0 0 12px">Welcome, ${escapeHtml(row.first_name)}</h1><p style="line-height:1.6;color:#475467">${escapeHtml(settings.welcome_message)}</p><div style="background:#f7f8fb;border-radius:10px;padding:16px;margin:20px 0"><strong>${escapeHtml(row.property_name)} · Unit ${escapeHtml(row.unit_number)}</strong><br><span style="color:#667085">Rent ${money(Number(row.monthly_rent))} · due day ${row.due_day}</span><br><span style="color:#667085">Lease ${dateOnly(row.start_date)} to ${dateOnly(row.end_date)}</span></div>${invoiceLines ? `<h3 style="font-size:15px">Your onboarding invoices</h3><ul style="line-height:1.8;color:#475467">${invoiceLines}</ul>` : ""}<p style="color:#475467">Sign-in email: <strong>${escapeHtml(row.email)}</strong><br>Company code: <strong>${escapeHtml(row.organization_slug)}</strong></p><a href="${activationUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:9px;margin:10px 0 18px">Activate my account</a><p style="font-size:12px;color:#667085">This secure link expires in 48 hours. Your agreements and invoices are attached and will remain available in your portal.</p></div></div></body></html>`;
  const text = `Welcome, ${row.first_name}. Your tenancy at ${row.property_name}, Unit ${row.unit_number}, is ready. Sign-in email: ${row.email}. Company code: ${row.organization_slug}. Activate your account within 48 hours: ${activationUrl}`;
  await client.query(
    `INSERT INTO email_jobs(organization_id,tenant_id,recipient,sender_name,reply_to_email,subject,html_body,text_body,attachment_document_ids,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid[],'queued')`,
    [
      row.organization_id,
      row.tenant_id,
      row.email,
      settings.sender_name || "PropOS by Polyizon",
      settings.reply_to_email || row.organization_email,
      subject,
      html,
      text,
      attachments,
    ],
  );
}

async function tenancyRow(
  client: pg.PoolClient,
  organizationId: string,
  tenantId: string,
) {
  const found = await client.query<any>(
    `SELECT o.id organization_id,o.name organization_name,o.slug organization_slug,o.email organization_email,rt.id tenant_id,rt.first_name,rt.last_name,rt.first_name||' '||rt.last_name tenant_name,rt.email,rt.phone,l.id lease_id,l.lease_number,l.start_date,l.end_date,l.monthly_rent,l.deposit_amount,l.due_day,u.unit_number,p.id property_id,p.name property_name FROM rental_tenants rt JOIN leases l ON l.organization_id=rt.organization_id AND l.tenant_id=rt.id JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id JOIN organizations o ON o.id=rt.organization_id WHERE rt.organization_id=$1 AND rt.id=$2 ORDER BY l.created_at DESC LIMIT 1`,
    [organizationId, tenantId],
  );
  if (!found.rowCount)
    throw new Error("Tenant onboarding details were not found");
  return found.rows[0];
}

async function settingsRow(client: pg.PoolClient, organizationId: string) {
  const found = await client.query<any>(
    `SELECT * FROM tenant_onboarding_settings WHERE organization_id=$1`,
    [organizationId],
  );
  return (
    found.rows[0] || {
      sender_name: "PropOS by Polyizon",
      welcome_message:
        "Welcome to your new home. Your portal keeps your payments, documents and support requests in one place.",
      portal_base_url: "https://propos.polyizon.tech",
      auto_create_portal: true,
      auto_send_welcome: true,
      invoice_first_rent: true,
      invoice_deposit: true,
    }
  );
}

async function createAccess(
  client: pg.PoolClient,
  row: any,
  createdBy: string,
) {
  if (!row.email)
    throw Object.assign(
      new Error("Tenant email is required to create portal access"),
      { status: 400 },
    );
  const duplicate = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE lower(email)=lower($1)`,
    [row.email],
  );
  if (duplicate.rowCount)
    throw Object.assign(
      new Error("That email address already has an account"),
      { status: 409 },
    );
  const user = await client.query<{ id: string }>(
    `INSERT INTO users(email,password_hash,first_name,last_name,phone) VALUES($1,$2,$3,$4,$5) RETURNING id`,
    [
      row.email,
      hashPassword(randomBytes(48).toString("base64url")),
      row.first_name,
      row.last_name,
      row.phone,
    ],
  );
  await client.query(
    `INSERT INTO organization_users(organization_id,user_id,role,property_scope) VALUES($1,$2,'tenant','{}'::uuid[])`,
    [row.organization_id, user.rows[0].id],
  );
  await client.query(
    `INSERT INTO tenant_portal_accounts(organization_id,tenant_id,user_id,created_by) VALUES($1,$2,$3,$4)`,
    [row.organization_id, row.tenant_id, user.rows[0].id, createdBy],
  );
  return user.rows[0].id;
}

async function newActivation(client: pg.PoolClient, row: any, userId: string) {
  await client.query(
    `UPDATE tenant_activation_tokens SET expires_at=LEAST(expires_at,now()) WHERE organization_id=$1 AND user_id=$2 AND used_at IS NULL`,
    [row.organization_id, userId],
  );
  const token = randomBytes(32).toString("base64url");
  await client.query(
    `INSERT INTO tenant_activation_tokens(organization_id,tenant_id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '48 hours')`,
    [row.organization_id, row.tenant_id, userId, tokenHash(token)],
  );
  return token;
}

export async function provisionTenantOnboarding(
  client: pg.PoolClient,
  args: ProvisionArgs,
) {
  const row = await tenancyRow(client, args.organizationId, args.tenantId),
    settings = await settingsRow(client, args.organizationId);
  if (!args.createPortal)
    return { portalCreated: false, emailQueued: false, invoices: [] };
  const userId = await createAccess(client, row, args.createdBy),
    token = await newActivation(client, row, userId),
    attachments: string[] = [];
  const templates = await client.query<any>(
    `SELECT DISTINCT ON (document_type) * FROM tenant_onboarding_templates WHERE organization_id=$1 AND status='active' AND (property_id=$2 OR property_id IS NULL) ORDER BY document_type,(property_id IS NOT NULL) DESC,version DESC,created_at DESC`,
    [args.organizationId, row.property_id],
  );
  for (const template of templates.rows) {
    const extension =
      template.mime_type === "application/pdf"
        ? ".pdf"
        : template.file_name?.match(/\.[A-Za-z0-9]+$/)?.[0] || ".pdf";
    const fileName = `${template.name} v${template.version}${extension}`;
    const content =
      template.source_type === "draft"
        ? await agreementPdf({
            organization: row.organization_name,
            property: row.property_name,
            unit: row.unit_number,
            tenant: row.tenant_name,
            leaseNumber: row.lease_number,
            startDate: dateOnly(row.start_date),
            endDate: dateOnly(row.end_date),
            body: replaceFields(template.body, row),
          })
        : undefined;
    attachments.push(
      await saveTenantDocument(client, {
        organizationId: args.organizationId,
        tenantId: args.tenantId,
        leaseId: args.leaseId,
        createdBy: args.createdBy,
        fileName,
        content,
        copyFrom: template.storage_key,
        mimeType:
          template.source_type === "draft"
            ? "application/pdf"
            : template.mime_type,
        template,
        documentType: template.document_type,
      }),
    );
  }
  const invoices = [];
  if (args.invoiceFirstRent) {
    const item = await createInvoice(client, row, "rent", args.createdBy);
    if (item) {
      invoices.push(item);
      attachments.push(item.documentId);
    }
  }
  if (args.invoiceDeposit) {
    const item = await createInvoice(client, row, "deposit", args.createdBy);
    if (item) {
      invoices.push(item);
      attachments.push(item.documentId);
    }
  }
  if (args.sendWelcome)
    await buildWelcome(client, row, settings, token, attachments, invoices);
  await client.query(
    `INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'tenant.onboarding_created','tenant',$3,$4::jsonb)`,
    [
      args.organizationId,
      args.createdBy,
      args.tenantId,
      JSON.stringify({
        portal: true,
        emailQueued: args.sendWelcome,
        documents: attachments.length,
        invoices: invoices.length,
      }),
    ],
  );
  return {
    portalCreated: true,
    emailQueued: args.sendWelcome,
    invoices: invoices.map((item) => ({
      id: item.id,
      number: item.number,
      amount: item.amount,
    })),
  };
}

export async function queueWelcomeAgain(
  client: pg.PoolClient,
  organizationId: string,
  tenantId: string,
) {
  const row = await tenancyRow(client, organizationId, tenantId),
    settings = await settingsRow(client, organizationId);
  if (!row.email)
    throw Object.assign(new Error("Tenant has no email address"), {
      status: 400,
    });
  const account = await client.query<{ user_id: string }>(
    `SELECT user_id FROM tenant_portal_accounts WHERE organization_id=$1 AND tenant_id=$2`,
    [organizationId, tenantId],
  );
  if (!account.rowCount)
    throw Object.assign(
      new Error("Tenant portal access has not been created"),
      { status: 409 },
    );
  const token = await newActivation(client, row, account.rows[0].user_id);
  const docs = await client.query<{ document_id: string }>(
    `SELECT document_id FROM tenant_onboarding_issues WHERE organization_id=$1 AND tenant_id=$2 ORDER BY created_at`,
    [organizationId, tenantId],
  );
  const invoices = await client.query<any>(
    `SELECT i.invoice_number number,i.total amount,CASE WHEN i.invoice_number LIKE 'DEP-%' THEN 'deposit' ELSE 'rent' END kind FROM invoices i WHERE i.organization_id=$1 AND i.tenant_id=$2 AND (i.invoice_number LIKE 'DEP-%' OR i.invoice_number LIKE 'RNT-%') ORDER BY i.created_at DESC LIMIT 2`,
    [organizationId, tenantId],
  );
  await buildWelcome(
    client,
    row,
    settings,
    token,
    docs.rows.map((item) => item.document_id),
    invoices.rows,
  );
}

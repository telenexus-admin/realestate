import { Router } from "express";
import { z } from "zod";
import { requirePermission, type AuthedRequest } from "./auth.js";
import { query } from "./db.js";
import {
  encryptSmsSecret,
  normalizeSmsPhone,
  sendOrganizationSms,
  SMS_PROVIDERS,
  type SmsProvider,
} from "./sms-service.js";

const router = Router();
function org(req: AuthedRequest) {
  if (!req.auth?.organizationId)
    throw new Error("Organization context missing");
  return req.auth.organizationId;
}
const providerSchema = z.enum(SMS_PROVIDERS);
const senderSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(
    /^[A-Za-z0-9_. -]+$/,
    "Use only letters, numbers, spaces, dots, underscores or hyphens",
  );
const audienceSchema = z.enum([
  "all",
  "due",
  "paid",
  "tenant",
  "property",
  "unit",
]);
type Audience = z.infer<typeof audienceSchema>;

async function communicationRecipients(
  organizationId: string,
  audience: Audience,
  targetId?: string,
) {
  const target = targetId || null;
  return query<any>(
    `WITH balances AS (
      SELECT tenant_id,coalesce(sum(greatest(total-paid_amount,0)) FILTER(WHERE status IN ('issued','partial','overdue')),0) balance
      FROM invoices WHERE organization_id=$1 GROUP BY tenant_id
    ), tenant_rows AS (
      SELECT rt.id,rt.first_name,rt.last_name,rt.phone,coalesce(b.balance,0) balance,
        coalesce(home.property_name,'') property_name,coalesce(home.unit_number,'') unit_number,
        home.property_id,home.unit_id
      FROM rental_tenants rt
      LEFT JOIN balances b ON b.tenant_id=rt.id
      LEFT JOIN LATERAL (
        SELECT p.id property_id,p.name property_name,u.id unit_id,u.unit_number
        FROM leases l JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id
        WHERE l.organization_id=rt.organization_id AND l.tenant_id=rt.id AND l.status IN ('active','expiring')
        ORDER BY l.start_date DESC LIMIT 1
      ) home ON true
      WHERE rt.organization_id=$1
        AND nullif(regexp_replace(coalesce(rt.phone,''),'[^0-9]','','g'),'') IS NOT NULL
    ) SELECT * FROM tenant_rows
    WHERE ($2='all')
      OR ($2='due' AND balance>0)
      OR ($2='paid' AND balance<=0)
      OR ($2='tenant' AND id=$3::uuid)
      OR ($2='property' AND property_id=$3::uuid)
      OR ($2='unit' AND unit_id=$3::uuid)
    ORDER BY first_name,last_name`,
    [organizationId, audience, target],
  );
}

router.get(
  "/sms/settings",
  requirePermission("team.write"),
  async (req: AuthedRequest, res) => {
    const found = await query<any>(
      `SELECT provider,sender_id,partner_id,enabled,configured_at,updated_at,api_key_ciphertext IS NOT NULL has_api_key FROM organization_sms_settings WHERE organization_id=$1`,
      [org(req)],
    );
    res.json(
      found.rows[0] || {
        provider: "blessed_text",
        sender_id: "",
        partner_id: "",
        enabled: false,
        configured_at: null,
        has_api_key: false,
      },
    );
  },
);

router.put(
  "/sms/settings",
  requirePermission("team.write"),
  async (req: AuthedRequest, res) => {
    const input = z
      .object({
        provider: providerSchema,
        apiKey: z.string().trim().max(500).default(""),
        senderId: senderSchema,
        partnerId: z.string().trim().max(80).default(""),
        enabled: z.boolean().default(true),
      })
      .safeParse(req.body);
    if (!input.success)
      return res
        .status(400)
        .json({
          error: "Check the SMS provider details",
          fields: input.error.flatten().fieldErrors,
        });
    const d = input.data,
      existing = await query<any>(
        `SELECT provider,api_key_ciphertext FROM organization_sms_settings WHERE organization_id=$1`,
        [org(req)],
      );
    const canKeepKey =
      existing.rows[0]?.provider === d.provider &&
      existing.rows[0]?.api_key_ciphertext;
    if (!d.apiKey && !canKeepKey)
      return res
        .status(400)
        .json({ error: "Enter the provider API key or token" });
    if (d.provider === "savvy" && !d.partnerId)
      return res.status(400).json({ error: "Enter the Savvy Partner ID" });
    const ciphertext = d.apiKey
      ? encryptSmsSecret(d.apiKey)
      : existing.rows[0].api_key_ciphertext;
    const saved = await query<any>(
      `INSERT INTO organization_sms_settings(organization_id,provider,api_key_ciphertext,sender_id,partner_id,enabled,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id) DO UPDATE SET provider=excluded.provider,api_key_ciphertext=excluded.api_key_ciphertext,sender_id=excluded.sender_id,partner_id=excluded.partner_id,enabled=excluded.enabled,configured_at=CASE WHEN organization_sms_settings.provider<>excluded.provider OR organization_sms_settings.api_key_ciphertext<>excluded.api_key_ciphertext THEN now() ELSE organization_sms_settings.configured_at END,updated_at=now(),updated_by=excluded.updated_by RETURNING provider,sender_id,partner_id,enabled,configured_at,updated_at`,
      [
        org(req),
        d.provider,
        ciphertext,
        d.senderId,
        d.provider === "savvy" ? d.partnerId : null,
        d.enabled,
        req.auth!.userId,
      ],
    );
    await query(
      `INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'sms.settings_updated','organization',$1,$3::jsonb)`,
      [
        org(req),
        req.auth!.userId,
        JSON.stringify({
          provider: d.provider,
          senderId: d.senderId,
          enabled: d.enabled,
        }),
      ],
    );
    res.json({ ...saved.rows[0], has_api_key: true });
  },
);

router.post(
  "/sms/test",
  requirePermission("team.write"),
  async (req: AuthedRequest, res) => {
    const input = z
      .object({ phone: z.string().trim().min(8).max(30) })
      .safeParse(req.body);
    if (!input.success)
      return res.status(400).json({ error: "Enter a valid test phone number" });
    const sent = await sendOrganizationSms({
      organizationId: org(req),
      phone: normalizeSmsPhone(input.data.phone),
      message:
        "Polyizon PropOS test: your SMS provider is configured correctly.",
      category: "configuration_test",
      sentBy: req.auth!.userId,
    });
    res.json({
      sent: true,
      recipient: sent.recipient,
      provider: sent.provider,
    });
  },
);

router.get(
  "/communication/recipients",
  requirePermission("team.write"),
  async (req: AuthedRequest, res) => {
    const input = z
      .object({
        audience: audienceSchema.default("all"),
        targetId: z.string().uuid().optional(),
      })
      .safeParse(req.query);
    if (!input.success)
      return res.status(400).json({ error: "Choose a valid audience" });
    if (
      ["tenant", "property", "unit"].includes(input.data.audience) &&
      !input.data.targetId
    )
      return res
        .status(400)
        .json({ error: "Choose a tenant, property or unit" });
    const recipients = await communicationRecipients(
      org(req),
      input.data.audience,
      input.data.targetId,
    );
    res.json({
      count: recipients.rowCount,
      recipients: recipients.rows.slice(0, 100),
    });
  },
);

router.get(
  "/communication/templates",
  requirePermission("team.write"),
  async (req: AuthedRequest, res) => {
    const found = await query(
      `SELECT id,name,message,category,created_at,updated_at FROM communication_templates WHERE organization_id=$1 AND active=true ORDER BY updated_at DESC`,
      [org(req)],
    );
    res.json(found.rows);
  },
);

router.post(
  "/communication/templates",
  requirePermission("team.write"),
  async (req: AuthedRequest, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(100),
        message: z.string().trim().min(2).max(480),
        category: z
          .enum(["general", "maintenance", "payment", "notice"])
          .default("general"),
      })
      .safeParse(req.body);
    if (!input.success)
      return res
        .status(400)
        .json({
          error: "Enter a template name and a message of up to 480 characters",
        });
    const d = input.data,
      saved = await query(
        `INSERT INTO communication_templates(organization_id,name,message,category,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,name,message,category,created_at,updated_at`,
        [org(req), d.name, d.message, d.category, req.auth!.userId],
      );
    res.status(201).json(saved.rows[0]);
  },
);

router.delete(
  "/communication/templates/:id",
  requirePermission("team.write"),
  async (req: AuthedRequest, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid template" });
    const removed = await query(
      `UPDATE communication_templates SET active=false,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id`,
      [id.data, org(req)],
    );
    if (!removed.rowCount)
      return res.status(404).json({ error: "Template not found" });
    res.status(204).end();
  },
);

router.get(
  "/communication/history",
  requirePermission("team.write"),
  async (req: AuthedRequest, res) => {
    const found = await query(
      `SELECT sd.id,sd.recipient,sd.message,sd.status,sd.error,sd.sent_at,sd.created_at,rt.first_name,rt.last_name FROM sms_deliveries sd LEFT JOIN rental_tenants rt ON rt.id=sd.tenant_id WHERE sd.organization_id=$1 AND sd.category='tenant_message' ORDER BY sd.created_at DESC LIMIT 30`,
      [org(req)],
    );
    res.json(found.rows);
  },
);

router.post(
  "/sms/messages",
  requirePermission("team.write"),
  async (req: AuthedRequest, res) => {
    const input = z
      .object({
        audience: audienceSchema,
        targetId: z.string().uuid().optional(),
        tenantId: z.string().uuid().optional(),
        message: z.string().trim().min(2).max(480),
      })
      .safeParse(req.body);
    if (!input.success)
      return res
        .status(400)
        .json({
          error:
            "Choose recipients and write a message of up to 480 characters",
        });
    const d = input.data;
    const targetId = d.targetId || d.tenantId;
    if (["tenant", "property", "unit"].includes(d.audience) && !targetId)
      return res
        .status(400)
        .json({ error: "Choose the specific recipient group" });
    const tenants = await communicationRecipients(
      org(req),
      d.audience,
      targetId,
    );
    if (!tenants.rowCount)
      return res
        .status(404)
        .json({ error: "No tenant with a valid phone number was found" });
    let sent = 0,
      failed = 0;
    const failures: string[] = [];
    for (const tenant of tenants.rows) {
      const message = d.message
        .replaceAll("{{name}}", tenant.first_name)
        .replaceAll("{{property}}", tenant.property_name || "your property")
        .replaceAll("{{unit}}", tenant.unit_number || "")
        .replaceAll(
          "{{balance}}",
          `KES ${Number(tenant.balance || 0).toLocaleString("en-KE")}`,
        );
      try {
        await sendOrganizationSms({
          organizationId: org(req),
          phone: tenant.phone,
          message,
          tenantId: tenant.id,
          category: "tenant_message",
          sentBy: req.auth!.userId,
        });
        sent++;
      } catch (error) {
        failed++;
        failures.push(
          `${tenant.first_name}: ${error instanceof Error ? error.message : "failed"}`,
        );
      }
    }
    res
      .status(sent ? 200 : 502)
      .json({
        sent,
        failed,
        total: tenants.rowCount,
        errors: failures.slice(0, 5),
      });
  },
);

export default router;

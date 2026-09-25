import jwt from "jsonwebtoken";
import { dateOnly } from "./onboarding-service.js";
import { pool, query } from "./db.js";

async function main() {
  const converted = dateOnly(new Date("2026-09-25T00:00:00.000Z"));
  if (converted !== "2026-09-25")
    throw new Error(`Date conversion returned ${converted}`);
  const session = await query<any>(
    `SELECT s.id session_id,s.user_id,s.organization_id FROM auth_sessions s JOIN organization_users ou ON ou.organization_id=s.organization_id AND ou.user_id=s.user_id WHERE s.revoked_at IS NULL AND s.expires_at>now() AND ou.role IN ('owner','admin') ORDER BY s.last_seen_at DESC LIMIT 1`,
  );
  if (!session.rowCount)
    throw new Error("No active owner or admin session is available");
  const row = session.rows[0],
    token = jwt.sign(
      {
        userId: row.user_id,
        organizationId: row.organization_id,
        sessionId: row.session_id,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "2m", issuer: "polyizon", audience: "propos-api" },
    );
  const response = await fetch("http://127.0.0.1:4010/api/tenants", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    tenants = (await response.json()) as any;
  if (response.status !== 200 || !Array.isArray(tenants))
    throw new Error(`Tenant list returned ${response.status}`);
  for (const tenant of tenants) {
    if (tenant.end_date && !/^\d{4}-\d{2}-\d{2}/.test(String(tenant.end_date)))
      throw new Error(`Tenant ${tenant.id} has an invalid lease end date`);
  }
  console.log(
    `Tenant smoke passed: PostgreSQL Date conversion and ${tenants.length} tenant lease record(s).`,
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

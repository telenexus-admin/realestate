CREATE TABLE IF NOT EXISTS tenant_portal_accounts (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES rental_tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, tenant_id),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_portal_user
  ON tenant_portal_accounts (user_id, organization_id);

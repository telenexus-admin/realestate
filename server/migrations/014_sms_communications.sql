CREATE TABLE IF NOT EXISTS organization_sms_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('blessed_text','savvy','talksasa')),
  api_key_ciphertext text NOT NULL,
  sender_id varchar(40) NOT NULL,
  partner_id varchar(80),
  enabled boolean NOT NULL DEFAULT true,
  configured_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sms_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES rental_tenants(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'tenant_message',
  provider text NOT NULL,
  recipient varchar(30) NOT NULL,
  message text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent','failed')),
  provider_message_id text,
  error text,
  sent_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS sms_deliveries_org_created_idx ON sms_deliveries(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS sms_deliveries_tenant_created_idx ON sms_deliveries(tenant_id,created_at DESC);

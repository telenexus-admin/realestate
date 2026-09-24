CREATE TABLE IF NOT EXISTS tenant_onboarding_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  sender_name text NOT NULL DEFAULT 'PropOS by Polyizon',
  reply_to_email text,
  welcome_message text NOT NULL DEFAULT 'Welcome to your new home. Your portal keeps your payments, documents and support requests in one place.',
  portal_base_url text NOT NULL DEFAULT 'https://propos.polyizon.tech',
  auto_create_portal boolean NOT NULL DEFAULT true,
  auto_send_welcome boolean NOT NULL DEFAULT true,
  invoice_first_rent boolean NOT NULL DEFAULT true,
  invoice_deposit boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_onboarding_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'agreement' CHECK (document_type IN ('agreement','house_rules','move_in','other')),
  name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('draft','upload')),
  body text,
  storage_key text,
  file_name text,
  mime_type text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_type='draft' AND body IS NOT NULL) OR (source_type='upload' AND storage_key IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_onboarding_templates_lookup ON tenant_onboarding_templates(organization_id,property_id,status,document_type);

CREATE TABLE IF NOT EXISTS tenant_activation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES rental_tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_activation_user ON tenant_activation_tokens(user_id,expires_at DESC);

CREATE TABLE IF NOT EXISTS tenant_onboarding_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES rental_tenants(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  template_id uuid REFERENCES tenant_onboarding_templates(id) ON DELETE SET NULL,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  template_version integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_issues_tenant ON tenant_onboarding_issues(organization_id,tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES rental_tenants(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'tenant_welcome',
  recipient text NOT NULL,
  sender_name text NOT NULL DEFAULT 'PropOS by Polyizon',
  reply_to_email text,
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text NOT NULL,
  attachment_document_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_jobs_due ON email_jobs(status,next_attempt_at) WHERE status IN ('queued','failed');

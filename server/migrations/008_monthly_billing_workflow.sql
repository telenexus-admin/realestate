CREATE TABLE IF NOT EXISTS property_water_settings (
  property_id uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  billing_method text NOT NULL DEFAULT 'meter' CHECK (billing_method IN ('meter','flat','shared')),
  rate_per_unit numeric(14,4) NOT NULL DEFAULT 0 CHECK (rate_per_unit >= 0),
  flat_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (flat_amount >= 0),
  shared_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (shared_amount >= 0),
  active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_property_water_settings_org ON property_water_settings(organization_id);

CREATE TABLE IF NOT EXISTS water_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  billing_month date NOT NULL,
  previous_reading numeric(14,3) NOT NULL CHECK (previous_reading >= 0),
  current_reading numeric(14,3) NOT NULL CHECK (current_reading >= previous_reading),
  consumption numeric(14,3) NOT NULL CHECK (consumption >= 0),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  notes text,
  meter_photo_url text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,unit_id,billing_month)
);
CREATE INDEX IF NOT EXISTS idx_water_readings_org_month ON water_readings(organization_id,billing_month,status);
CREATE INDEX IF NOT EXISTS idx_water_readings_property_month ON water_readings(property_id,billing_month);

CREATE TABLE IF NOT EXISTS invoice_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES rental_tenants(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','sms','email')),
  recipient text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'opened' CHECK (status IN ('queued','opened','sent','delivered','failed')),
  sent_by uuid REFERENCES users(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_communications_invoice ON invoice_communications(invoice_id,created_at DESC);

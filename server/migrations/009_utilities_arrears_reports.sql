CREATE TABLE IF NOT EXISTS property_utility_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  utility_type text NOT NULL CHECK (utility_type IN ('electricity','garbage','security','service_charge','other')),
  name text NOT NULL,
  billing_method text NOT NULL CHECK (billing_method IN ('meter','flat','shared')),
  rate_per_unit numeric(14,4) NOT NULL DEFAULT 0 CHECK (rate_per_unit >= 0),
  flat_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (flat_amount >= 0),
  shared_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (shared_amount >= 0),
  active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id,utility_type,name)
);
CREATE INDEX IF NOT EXISTS idx_property_utility_settings_org ON property_utility_settings(organization_id,property_id,active);

CREATE TABLE IF NOT EXISTS billing_utility_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  setting_id uuid NOT NULL REFERENCES property_utility_settings(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  billing_month date NOT NULL,
  previous_reading numeric(14,3) NOT NULL CHECK (previous_reading >= 0),
  current_reading numeric(14,3) NOT NULL CHECK (current_reading >= previous_reading),
  consumption numeric(14,3) NOT NULL CHECK (consumption >= 0),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  notes text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,setting_id,unit_id,billing_month)
);
CREATE INDEX IF NOT EXISTS idx_billing_utility_readings_org_month ON billing_utility_readings(organization_id,billing_month,status);

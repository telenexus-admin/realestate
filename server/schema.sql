CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  business_type text NOT NULL DEFAULT 'property_manager',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('trial','active','suspended','closed')),
  plan text NOT NULL DEFAULT 'starter',
  currency text NOT NULL DEFAULT 'KES',
  timezone text NOT NULL DEFAULT 'Africa/Nairobi',
  phone text,
  email text,
  kra_pin text,
  registration_number text,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'active',
  mfa_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_users (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','accountant','property_manager','leasing_agent','caretaker','maintenance','auditor')),
  property_scope uuid[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,user_id)
);

CREATE TABLE property_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_type text NOT NULL DEFAULT 'individual' CHECK (owner_type IN ('individual','company')),
  name text NOT NULL,
  email text,
  phone text,
  tax_id text,
  bank_name text,
  bank_account text,
  payout_method text NOT NULL DEFAULT 'bank',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_property_owners_org ON property_owners(organization_id);

CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES property_owners(id) ON DELETE SET NULL,
  name text NOT NULL,
  code text,
  property_type text NOT NULL DEFAULT 'residential',
  address text,
  city text,
  county text,
  country text NOT NULL DEFAULT 'Kenya',
  latitude numeric(10,7),
  longitude numeric(10,7),
  status text NOT NULL DEFAULT 'active',
  manager_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);
CREATE INDEX idx_properties_org ON properties(organization_id);
CREATE INDEX idx_properties_owner ON properties(owner_id);

CREATE TABLE buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  floors integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_buildings_property ON buildings(property_id);

CREATE TABLE units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  building_id uuid REFERENCES buildings(id) ON DELETE SET NULL,
  unit_number text NOT NULL,
  unit_type text NOT NULL DEFAULT 'apartment',
  bedrooms integer,
  bathrooms numeric(3,1),
  floor text,
  square_feet numeric(12,2),
  market_rent numeric(14,2) NOT NULL DEFAULT 0,
  deposit_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'vacant' CHECK (status IN ('occupied','vacant','reserved','maintenance','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, unit_number)
);
CREATE INDEX idx_units_org ON units(organization_id);
CREATE INDEX idx_units_property ON units(property_id);
CREATE INDEX idx_units_status ON units(organization_id,status);

CREATE TABLE rental_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text NOT NULL,
  national_id text,
  kra_pin text,
  emergency_contact_name text,
  emergency_contact_phone text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rental_tenants_org ON rental_tenants(organization_id);
CREATE INDEX idx_rental_tenants_phone ON rental_tenants(organization_id,phone);

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES units(id) ON DELETE CASCADE,
  applicant_name text NOT NULL,
  phone text,
  email text,
  stage text NOT NULL DEFAULT 'inquiry' CHECK (stage IN ('inquiry','viewing','application','screening','approved','rejected','lease_signing','converted')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_applications_org_stage ON applications(organization_id,stage);

CREATE TABLE leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES rental_tenants(id) ON DELETE RESTRICT,
  lease_number text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  monthly_rent numeric(14,2) NOT NULL,
  deposit_amount numeric(14,2) NOT NULL DEFAULT 0,
  due_day integer NOT NULL DEFAULT 5 CHECK (due_day BETWEEN 1 AND 28),
  grace_days integer NOT NULL DEFAULT 0,
  late_fee numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','expiring','ended','terminated')),
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,lease_number)
);
CREATE INDEX idx_leases_org ON leases(organization_id);
CREATE INDEX idx_leases_unit_status ON leases(unit_id,status);
CREATE INDEX idx_leases_end_date ON leases(organization_id,end_date);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES rental_tenants(id) ON DELETE SET NULL,
  lease_id uuid REFERENCES leases(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  period_start date,
  period_end date,
  due_date date NOT NULL,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','partial','paid','overdue','void')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,invoice_number)
);
CREATE INDEX idx_invoices_org_status ON invoices(organization_id,status);
CREATE INDEX idx_invoices_due ON invoices(organization_id,due_date);

CREATE TABLE invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_type text NOT NULL DEFAULT 'rent',
  description text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL,
  total numeric(14,2) NOT NULL
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES rental_tenants(id) ON DELETE SET NULL,
  reference text NOT NULL,
  provider_reference text,
  payment_method text NOT NULL CHECK (payment_method IN ('mpesa','bank','card','cash','cheque','wallet','adjustment')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('pending','posted','reversed','failed','unmatched')),
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,reference)
);
CREATE INDEX idx_payments_org_date ON payments(organization_id,paid_at DESC);
CREATE INDEX idx_payments_provider_ref ON payments(provider_reference);

CREATE TABLE payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chart_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense')),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id,code)
);

CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entry_number text NOT NULL,
  entry_date date NOT NULL DEFAULT current_date,
  description text,
  source_type text,
  source_id uuid,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,entry_number)
);

CREATE TABLE journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  debit numeric(14,2) NOT NULL DEFAULT 0,
  credit numeric(14,2) NOT NULL DEFAULT 0,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES property_owners(id) ON DELETE SET NULL,
  CHECK ((debit = 0 AND credit > 0) OR (credit = 0 AND debit > 0))
);

CREATE TABLE vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  phone text,
  email text,
  rating numeric(3,2),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES rental_tenants(id) ON DELETE SET NULL,
  request_number text NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','reviewed','assigned','scheduled','in_progress','completed','closed','cancelled')),
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  estimated_cost numeric(14,2),
  actual_cost numeric(14,2),
  sla_due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,request_number)
);
CREATE INDEX idx_maintenance_org_status ON maintenance_requests(organization_id,status);

CREATE TABLE inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  inspection_number text NOT NULL,
  inspection_type text NOT NULL,
  scheduled_at timestamptz,
  inspector_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'scheduled',
  score numeric(5,2),
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,inspection_number)
);

CREATE TABLE utility_meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  utility_type text NOT NULL,
  meter_number text,
  rate numeric(14,4),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE utility_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meter_id uuid NOT NULL REFERENCES utility_meters(id) ON DELETE CASCADE,
  reading numeric(16,4) NOT NULL,
  reading_date date NOT NULL,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meter_id,reading_date)
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_key text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_entity ON documents(organization_id,entity_type,entity_id);

CREATE TABLE communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES rental_tenants(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES property_owners(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','sms','email','portal')),
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  subject text,
  body text NOT NULL,
  provider_id text,
  status text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_communications_org_created ON communications(organization_id,created_at DESC);

CREATE TABLE automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}',
  actions jsonb NOT NULL DEFAULT '[]',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_org_created ON audit_logs(organization_id,created_at DESC);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan text NOT NULL,
  unit_limit integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'trial',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','users','property_owners','properties','units','rental_tenants','applications','leases','invoices','maintenance_requests','automation_rules','subscriptions']
  LOOP
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

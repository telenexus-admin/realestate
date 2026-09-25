CREATE TABLE IF NOT EXISTS organization_payment_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  institution_code varchar(30) NOT NULL,
  bank_name varchar(120) NOT NULL,
  account_name varchar(120) NOT NULL,
  account_ciphertext text NOT NULL,
  masked_account varchar(30) NOT NULL,
  branch_name varchar(120),
  mpesa_paybill varchar(30) NOT NULL,
  verification_status varchar(20) NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
  routing_status varchar(20) NOT NULL DEFAULT 'disabled' CHECK (routing_status IN ('disabled','active')),
  is_active boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES rental_tenants(id) ON DELETE CASCADE,
  lease_id uuid REFERENCES leases(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  destination_id uuid REFERENCES organization_payment_destinations(id) ON DELETE SET NULL,
  mode varchar(20) NOT NULL CHECK (mode IN ('overdue','months')),
  months integer,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  phone varchar(30) NOT NULL,
  external_reference varchar(100) NOT NULL UNIQUE,
  checkout_request_id varchar(120) UNIQUE,
  merchant_request_id varchar(120),
  callback_token_hash varchar(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','queued','paid','failed','cancelled')),
  result_code varchar(20),
  result_description text,
  mpesa_receipt varchar(80),
  transaction_at timestamptz,
  destination_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_id,invoice_id)
);

CREATE INDEX IF NOT EXISTS tenant_payment_requests_tenant_idx ON tenant_payment_requests(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_payment_requests_checkout_idx ON tenant_payment_requests(checkout_request_id);
CREATE INDEX IF NOT EXISTS payment_allocations_payment_idx ON payment_allocations(payment_id);

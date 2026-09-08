CREATE TABLE IF NOT EXISTS billing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_key text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed','posted','failed','cancelled')),
  invoice_count integer NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  posted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,run_key)
);
CREATE INDEX IF NOT EXISTS idx_billing_runs_org_period ON billing_runs(organization_id,period_start,period_end);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_org_lease_period ON invoices(organization_id,lease_id,period_start,period_end) WHERE lease_id IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL AND status<>'void';

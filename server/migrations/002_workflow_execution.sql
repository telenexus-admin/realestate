CREATE TABLE IF NOT EXISTS workflow_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('owner_payout','vendor_invoice','deposit_refund','write_off','renewal_offer','bank_reconciliation','expense_approval','maintenance_approval')),
  title text NOT NULL,
  description text,
  entity_type text,
  entity_id uuid,
  amount numeric(14,2),
  currency text NOT NULL DEFAULT 'KES',
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','critical')),
  department text NOT NULL DEFAULT 'operations',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('draft','pending','assigned','approved','rejected','executed','cancelled','blocked')),
  policy_state text NOT NULL DEFAULT 'clear' CHECK (policy_state IN ('clear','review','blocked')),
  policy_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  rejected_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_at timestamptz,
  executed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_actions_org_status ON workflow_actions(organization_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_actions_org_assignee ON workflow_actions(organization_id,assigned_to,status);
CREATE INDEX IF NOT EXISTS idx_workflow_actions_entity ON workflow_actions(organization_id,entity_type,entity_id);

CREATE TABLE IF NOT EXISTS workflow_action_events (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_action_id uuid NOT NULL REFERENCES workflow_actions(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workflow_action_events_action ON workflow_action_events(workflow_action_id,created_at DESC);

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  operation text NOT NULL,
  request_hash text,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  UNIQUE (organization_id,idempotency_key,operation)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON api_idempotency_keys(expires_at);

CREATE OR REPLACE FUNCTION workflow_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); NEW.version = OLD.version + 1; RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workflow_actions_updated_at ON workflow_actions;
CREATE TRIGGER workflow_actions_updated_at BEFORE UPDATE ON workflow_actions FOR EACH ROW EXECUTE FUNCTION workflow_set_updated_at();

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_active ON platform_admins(active) WHERE active;

-- Bootstrap the existing Polyizon owner as the first platform operator.
INSERT INTO platform_admins(user_id, active)
SELECT id, true FROM users WHERE lower(email)='admin@polyizon.tech'
ON CONFLICT (user_id) DO UPDATE SET active=true;

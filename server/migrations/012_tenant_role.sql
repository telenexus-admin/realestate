ALTER TABLE organization_users
  DROP CONSTRAINT IF EXISTS organization_users_role_check;

ALTER TABLE organization_users
  ADD CONSTRAINT organization_users_role_check
  CHECK (role IN ('owner','admin','accountant','property_manager','leasing_agent','caretaker','maintenance','auditor','tenant'));

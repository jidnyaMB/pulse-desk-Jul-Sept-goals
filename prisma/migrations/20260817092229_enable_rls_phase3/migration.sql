-- Same pattern as patients (see 20260817073908_enable_rls): the pulsedesk_app
-- role gets grants + every tenant-scoped table gets forced RLS keyed off
-- app.tenant_id, fail-closed when that setting is unset.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pulsedesk_app;

ALTER TABLE care_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_teams FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON care_teams
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE care_team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_team_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON care_team_memberships
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE care_team_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_team_patients FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON care_team_patients
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON devices
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON alerts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pulsedesk_app;

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE readings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON readings
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

-- Real dedup boundary for alerts: only one OPEN alert per (patient, dedupeKey)
-- can exist at a time. Partial unique index — not expressible in schema.prisma,
-- which is why this is hand-written SQL rather than a generated migration.
CREATE UNIQUE INDEX alerts_open_dedupe_key_idx ON alerts (patient_id, dedupe_key)
  WHERE status = 'open' AND dedupe_key IS NOT NULL;

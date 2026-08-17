-- Restricted, non-superuser role used ONLY by the running application's
-- tenant-scoped queries (see TenantPrismaService / APP_DATABASE_URL).
-- Postgres superusers and roles with BYPASSRLS ignore RLS even when
-- FORCE ROW LEVEL SECURITY is set — so if the app connected as the same
-- superuser used for migrations, every policy below would be a no-op.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pulsedesk_app') THEN
    CREATE ROLE pulsedesk_app LOGIN PASSWORD 'pulsedesk_app_dev_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO pulsedesk_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pulsedesk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pulsedesk_app;

-- Row Level Security on all tenant-scoped tables.
-- ENABLE turns policies on; FORCE makes them apply even to the table owner
-- (the default is that owners bypass RLS, which would defeat the point).
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;

-- current_setting(..., true) returns NULL when app.tenant_id was never set
-- for this transaction (e.g. withTenant() was skipped). tenant_id = NULL is
-- NULL, never TRUE, so the policy denies by default: fail closed, not open.
-- tenant_id is stored as text (Prisma's default uuid() is an app-generated
-- string, not the native Postgres uuid type), so we compare as text too.
CREATE POLICY tenant_isolation ON patients
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

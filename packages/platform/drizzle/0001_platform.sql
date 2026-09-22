-- =====================================================================
-- Objetos compartilhados da plataforma (schema `platform`).
-- Roda antes das migrações dos módulos.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION migrator;
GRANT USAGE ON SCHEMA platform TO app, platform;

ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA platform
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA platform
  GRANT USAGE, SELECT ON SEQUENCES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA platform
  GRANT SELECT ON TABLES TO platform;

-- ---------------------------------------------------------------------
-- Contadores por tenant: números amigáveis (pedido, fatura) sem expor
-- volume entre tenants e sem sequência global (06-multi-tenancy.md §3.4).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.tenant_counters (
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  value bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, name)
);

ALTER TABLE platform.tenant_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON platform.tenant_counters;
CREATE POLICY tenant_isolation ON platform.tenant_counters
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON platform.tenant_counters TO app;

-- =====================================================================
-- Hub de integrações: qual provedor está ativo em cada categoria, por tenant.
-- Credenciais ficam CRIPTOGRAFADAS aqui, nunca em variável de ambiente
-- (docs/07-checklist-pre-desenvolvimento.md §F).
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS integrations AUTHORIZATION migrator;
GRANT USAGE ON SCHEMA integrations TO app, platform;

ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA integrations
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA integrations
  GRANT USAGE, SELECT ON SEQUENCES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA integrations
  GRANT SELECT ON TABLES TO platform;

CREATE TABLE IF NOT EXISTS integrations.provider_configs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  category text NOT NULL,
  provider text NOT NULL,
  -- AES-256-GCM; o texto claro nunca toca o banco nem o log
  credentials_encrypted text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- um provedor ativo por categoria em cada tenant
  CONSTRAINT provider_configs_tenant_category_provider_unique UNIQUE (tenant_id, category, provider)
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_configs_one_active_per_category
  ON integrations.provider_configs (tenant_id, category) WHERE is_active;

ALTER TABLE integrations.provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.provider_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON integrations.provider_configs;
CREATE POLICY tenant_isolation ON integrations.provider_configs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

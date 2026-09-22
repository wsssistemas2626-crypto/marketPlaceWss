-- =====================================================================
-- Registro de tenants (ADR-012 / US-075).
--
-- Este schema é o **registro da plataforma**: é ele que responde "que tenant
-- atende este host?" antes de existir TenantContext. Por isso `tenants`,
-- `plans` e `domains` não têm policy de RLS — é a exceção prevista em
-- `06-multi-tenancy.md` §3.3. Dado de negócio nenhum mora aqui.
-- `tenant_settings`, que é configuração do tenant, tem RLS normal.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS tenancy AUTHORIZATION migrator;
GRANT USAGE ON SCHEMA tenancy TO app, platform;

ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA tenancy
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA tenancy
  GRANT USAGE, SELECT ON SEQUENCES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA tenancy
  GRANT SELECT ON TABLES TO platform;

CREATE TABLE IF NOT EXISTS tenancy.plans (
  plan_id text PRIMARY KEY,
  name text NOT NULL,
  entitlements jsonb NOT NULL DEFAULT '{"modules":[],"limits":{}}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenancy.tenants (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  -- ciclo de vida em `06-multi-tenancy.md` §9
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'trial', 'active', 'suspended', 'cancelled')),
  cell text NOT NULL DEFAULT 'shared-1',
  plan_id text REFERENCES tenancy.plans (plan_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenancy.domains (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  hostname text NOT NULL UNIQUE,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS domains_tenant_idx ON tenancy.domains (tenant_id);

-- configuração por tenant: aqui o RLS vale normalmente
CREATE TABLE IF NOT EXISTS tenancy.tenant_settings (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

ALTER TABLE tenancy.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tenant_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenancy.tenant_settings;
CREATE POLICY tenant_isolation ON tenancy.tenant_settings
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

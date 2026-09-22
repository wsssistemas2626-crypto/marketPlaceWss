-- =====================================================================
-- Módulo de exemplo (_template) — schema `template`.
-- Gerado no padrão de `infra/db/module-schema-template.sql`:
-- schema do migrator, grants para app/platform e RLS forçado por tenant.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS template AUTHORIZATION migrator;
GRANT USAGE ON SCHEMA template TO app, platform;

ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA template
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA template
  GRANT USAGE, SELECT ON SEQUENCES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA template
  GRANT SELECT ON TABLES TO platform;

-- Agregado fictício. Toda tabela de negócio nasce com tenant_id (ADR-012).
CREATE TABLE IF NOT EXISTS template.widgets (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  price_cents bigint NOT NULL CHECK (price_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- unicidade SEMPRE inclui o tenant (06-multi-tenancy.md §3.1)
  CONSTRAINT widgets_tenant_slug_unique UNIQUE (tenant_id, slug)
);

-- índice começando por tenant_id: é o filtro de toda consulta
CREATE INDEX IF NOT EXISTS widgets_tenant_created_idx
  ON template.widgets (tenant_id, created_at DESC);

ALTER TABLE template.widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE template.widgets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON template.widgets;
CREATE POLICY tenant_isolation ON template.widgets
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

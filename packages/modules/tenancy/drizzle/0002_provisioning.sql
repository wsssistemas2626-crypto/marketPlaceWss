-- =====================================================================
-- Provisionamento de tenant (US-076).
--
-- Cada etapa é registrada para o processo ser **idempotente**: reexecutar
-- refaz só o que falta, e nada é duplicado. É o 2º cenário do Gherkin.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenancy.provisioning_steps (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  step text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  detail text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, step)
);

-- Consultada durante o provisionamento, quando ainda não há TenantContext
-- aberto (é operação de plataforma, como o resto do schema `tenancy`).

-- ---------------------------------------------------------------------
-- Outbox do módulo: tenant.created dispara o seed dos demais módulos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenancy.outbox (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz
);

CREATE INDEX IF NOT EXISTS tenancy_outbox_pending_idx
  ON tenancy.outbox (next_attempt_at NULLS FIRST, created_at) WHERE published_at IS NULL;

ALTER TABLE tenancy.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.outbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenancy.outbox;
CREATE POLICY tenant_isolation ON tenancy.outbox
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, UPDATE ON tenancy.outbox TO platform;

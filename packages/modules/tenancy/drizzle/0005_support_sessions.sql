-- =====================================================================
-- Modo suporte: staff acessando um tenant (US-080 / RF-TEN-07).
--
-- Cada acesso é uma sessão com motivo e prazo, registrada no tenant e
-- **visível ao admin dele** (`06-multi-tenancy.md` §7). Não é impersonação
-- silenciosa: o tenant vê quem entrou, quando, por quê e até quando.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenancy.support_sessions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  staff_user_id text NOT NULL,
  reason text NOT NULL,
  -- leitura por padrão; escrita exige decisão explícita de quem abre
  scope text NOT NULL DEFAULT 'read_only' CHECK (scope IN ('read_only', 'write')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_sessions_tenant_idx
  ON tenancy.support_sessions (tenant_id, expires_at DESC);

ALTER TABLE tenancy.support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.support_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenancy.support_sessions;
CREATE POLICY tenant_isolation ON tenancy.support_sessions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

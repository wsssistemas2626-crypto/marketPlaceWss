-- =====================================================================
-- Sessões do comprador (US-011 / RF-IAM-03).
--
-- Refresh token opaco e rotativo, agrupado em FAMÍLIA: o login abre a
-- família, cada refresh troca o token por outro da mesma família. Token já
-- trocado que volta a aparecer = cópia roubada → a família é revogada.
-- Só o SHA-256 do token fica aqui.
--
-- Bloqueio progressivo (RNF-SEG-02) mora na própria conta.
--
-- Reversão: `DROP TABLE identity.customer_refresh_tokens;
-- ALTER TABLE identity.customers DROP COLUMN failed_login_attempts,
-- DROP COLUMN locked_until;`
-- =====================================================================

ALTER TABLE identity.customers
  ADD COLUMN IF NOT EXISTS failed_login_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

CREATE TABLE IF NOT EXISTS identity.customer_refresh_tokens (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES identity.customers (id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_refresh_tokens_hash_uq
  ON identity.customer_refresh_tokens (tenant_id, token_hash);
CREATE INDEX IF NOT EXISTS customer_refresh_tokens_family_idx
  ON identity.customer_refresh_tokens (tenant_id, family_id);
CREATE INDEX IF NOT EXISTS customer_refresh_tokens_customer_idx
  ON identity.customer_refresh_tokens (tenant_id, customer_id) WHERE revoked_at IS NULL;

ALTER TABLE identity.customer_refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.customer_refresh_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON identity.customer_refresh_tokens;
CREATE POLICY tenant_isolation ON identity.customer_refresh_tokens
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

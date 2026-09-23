-- =====================================================================
-- Recuperação de senha do comprador (US-012 / RF-IAM-04).
--
-- Token de uso único, válido por 1 hora; só o SHA-256 fica aqui. Pedir um
-- link novo invalida os anteriores ainda abertos.
--
-- Reversão: `DROP TABLE identity.customer_password_resets;`
-- =====================================================================

CREATE TABLE IF NOT EXISTS identity.customer_password_resets (
  token_hash text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES identity.customers (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_password_resets_open_idx
  ON identity.customer_password_resets (tenant_id, customer_id) WHERE used_at IS NULL;

ALTER TABLE identity.customer_password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.customer_password_resets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON identity.customer_password_resets;
CREATE POLICY tenant_isolation ON identity.customer_password_resets
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

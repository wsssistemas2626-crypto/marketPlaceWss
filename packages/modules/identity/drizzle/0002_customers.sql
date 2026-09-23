-- =====================================================================
-- Compradores (identidade própria, ADR-013 / US-010).
--
-- Conta **por tenant**: o mesmo e-mail pode existir em outro marketplace,
-- por isso a unicidade começa por tenant_id (ADR-012). Todas as tabelas
-- têm RLS forçado.
--
-- Colunas marcadas `-- pii` são dados pessoais: nunca vão para log e são o
-- alvo da anonimização (RF-IAM-08, Fase 2).
--
-- Reversão: `DROP TABLE identity.customer_email_verifications,
-- identity.customer_consents, identity.customers, identity.outbox;` — sem
-- dado de outra tabela dependendo delas nesta fase.
-- =====================================================================

CREATE TABLE IF NOT EXISTS identity.customers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  name text NOT NULL,                     -- pii
  email text NOT NULL,                    -- pii (normalizado: minúsculas, sem espaços)
  document_type text NOT NULL CHECK (document_type IN ('cpf', 'cnpj')),
  document_number text NOT NULL,          -- pii (só dígitos)
  password_hash text NOT NULL,            -- Argon2id, formato PHC
  status text NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'active', 'blocked', 'anonymized')),
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_email_uq ON identity.customers (tenant_id, email);

-- RNF-LGPD-03: versão aceita, quando e de onde. Histórico, não estado:
-- aceitar uma versão nova é uma linha nova.
CREATE TABLE IF NOT EXISTS identity.customer_consents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES identity.customers (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('terms_of_use', 'privacy_policy', 'marketing')),
  version text NOT NULL,
  accepted_at timestamptz NOT NULL,
  ip inet NOT NULL                        -- pii
);

CREATE INDEX IF NOT EXISTS customer_consents_customer_idx
  ON identity.customer_consents (tenant_id, customer_id, kind, accepted_at DESC);

-- RF-IAM-02: link de confirmação de 24 h. Só o SHA-256 do token.
CREATE TABLE IF NOT EXISTS identity.customer_email_verifications (
  token_hash text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES identity.customers (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_email_verifications_customer_idx
  ON identity.customer_email_verifications (tenant_id, customer_id);

-- Outbox do módulo (CLAUDE.md §4.5)
CREATE TABLE IF NOT EXISTS identity.outbox (
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

CREATE INDEX IF NOT EXISTS identity_outbox_pending_idx
  ON identity.outbox (next_attempt_at NULLS FIRST, created_at) WHERE published_at IS NULL;

GRANT SELECT, UPDATE ON identity.outbox TO platform;

-- RLS em todas (ADR-012)
DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['customers', 'customer_consents', 'customer_email_verifications', 'outbox'] LOOP
    EXECUTE format('ALTER TABLE identity.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE identity.%I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON identity.%I', tabela);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON identity.%I
         USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      tabela
    );
  END LOOP;
END
$$;

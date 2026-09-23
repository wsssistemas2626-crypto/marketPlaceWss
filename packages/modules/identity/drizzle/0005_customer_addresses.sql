-- =====================================================================
-- Endereços do comprador (US-014 / RF-IAM-09).
--
-- Um endereço padrão por comprador, garantido pelo índice único parcial.
-- Colunas `-- pii` nunca vão para log e entram na anonimização (RF-IAM-08).
--
-- Reversão: `DROP TABLE identity.customer_addresses;`
-- =====================================================================

CREATE TABLE IF NOT EXISTS identity.customer_addresses (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES identity.customers (id) ON DELETE CASCADE,
  label text,
  recipient_name text NOT NULL,           -- pii
  zip_code text NOT NULL CHECK (zip_code ~ '^[0-9]{8}$'),
  street text NOT NULL,                   -- pii
  number text NOT NULL,                   -- pii
  complement text,                        -- pii
  district text NOT NULL,
  city text NOT NULL,
  state text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_addresses_customer_idx
  ON identity.customer_addresses (tenant_id, customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_one_default_uq
  ON identity.customer_addresses (tenant_id, customer_id) WHERE is_default;

ALTER TABLE identity.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.customer_addresses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON identity.customer_addresses;
CREATE POLICY tenant_isolation ON identity.customer_addresses
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

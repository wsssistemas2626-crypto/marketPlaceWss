-- =====================================================================
-- Tema e identidade visual do tenant (US-077 / RF-TEN-04).
--
-- Rascunho e publicado ficam lado a lado na mesma linha: o admin edita o
-- rascunho, vê o preview e só então publica. Sem essa separação, qualquer
-- ajuste de cor apareceria na loja no instante em que fosse salvo.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenancy.themes (
  tenant_id uuid PRIMARY KEY REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  published jsonb,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenancy.themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.themes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenancy.themes;
CREATE POLICY tenant_isolation ON tenancy.themes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

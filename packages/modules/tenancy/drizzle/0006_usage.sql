-- =====================================================================
-- Projeção de uso por tenant (US-081 / RF-TEN-11).
--
-- Alimentada por eventos, não por consulta direta aos módulos: o console
-- precisa de números de catálogo, pedidos e GMV, e o tenancy não pode ler a
-- tabela de ninguém (CLAUDE.md §4.2). Cada módulo publica o que aconteceu; a
-- projeção soma.
--
-- Tem RLS como qualquer tabela com tenant_id: o console lê tenant a tenant,
-- com o contexto de cada um. Isso custa uma consulta por linha da página e
-- evita mais uma exceção à regra.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenancy.tenant_usage (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  metric text NOT NULL,
  value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, metric)
);

ALTER TABLE tenancy.tenant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tenant_usage FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenancy.tenant_usage;
CREATE POLICY tenant_isolation ON tenancy.tenant_usage
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

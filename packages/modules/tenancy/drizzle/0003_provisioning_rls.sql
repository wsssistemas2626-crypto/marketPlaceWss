-- =====================================================================
-- RLS em provisioning_steps.
--
-- A tabela tem tenant_id, então segue a regra geral (ADR-012) em vez de
-- virar exceção: o provisionamento acontece sem TenantContext, mas sempre
-- conhece o tenant de que está tratando, e define `app.tenant_id`
-- explicitamente. Cada exceção à RLS enfraquece a garantia; esta não precisa
-- existir.
-- =====================================================================

ALTER TABLE tenancy.provisioning_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.provisioning_steps FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenancy.provisioning_steps;
CREATE POLICY tenant_isolation ON tenancy.provisioning_steps
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

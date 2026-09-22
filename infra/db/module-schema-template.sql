-- =====================================================================
-- MODELO do que o helper de migração `createModuleSchema('<modulo>')` e
-- `enableTenantRls('<schema>.<tabela>')` (pacote @mkt/platform) devem gerar.
-- Executado pelo role "migrator". Substitua <modulo> e <tabela>.
-- =====================================================================

-- 1) Schema do módulo, pertencente ao migrator
CREATE SCHEMA IF NOT EXISTS <modulo> AUTHORIZATION migrator;
GRANT USAGE ON SCHEMA <modulo> TO app, platform;

-- 2) Privilégios padrão para tabelas/sequências futuras criadas pelo migrator
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA <modulo>
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA <modulo>
  GRANT USAGE, SELECT ON SEQUENCES TO app;
-- platform: apenas leitura por padrão; outbox e purge recebem grants explícitos
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA <modulo>
  GRANT SELECT ON TABLES TO platform;

-- 3) Para CADA tabela com tenant_id
ALTER TABLE <modulo>.<tabela> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <modulo>.<tabela> FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON <modulo>.<tabela>;
CREATE POLICY tenant_isolation ON <modulo>.<tabela>
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- 4) Outbox do módulo: o relay (platform) marca como publicado
GRANT SELECT, UPDATE ON <modulo>.outbox TO platform;

-- 5) Tabelas imutáveis (ex.: ledger.journal_entries/lines): retirar UPDATE/DELETE do app
-- REVOKE UPDATE, DELETE ON ledger.journal_entries, ledger.journal_lines FROM app;

-- 6) Uso em runtime (sempre dentro de transação — compatível com PgBouncer em modo transaction):
-- BEGIN;
--   SELECT set_config('app.tenant_id', '<uuid-do-tenant>', true);  -- true = SET LOCAL
--   ... queries ...
-- COMMIT;

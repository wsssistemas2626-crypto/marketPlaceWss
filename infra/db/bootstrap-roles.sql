-- =====================================================================
-- Bootstrap de roles do PostgreSQL (ADR-012 multi-tenancy + ADR-014 Railway)
-- Idempotente: pode ser executado várias vezes.
--
-- USO (uma vez por ambiente — local, pr, staging, production):
--   psql "$DATABASE_ADMIN_URL" \
--     -v migrator_password="$DB_MIGRATOR_PASSWORD" \
--     -v app_password="$DB_APP_PASSWORD" \
--     -v platform_password="$DB_PLATFORM_PASSWORD" \
--     -f infra/db/bootstrap-roles.sql
--
-- DATABASE_ADMIN_URL = URL do usuário "postgres" (superusuário). Na Railway: variável
-- DATABASE_PUBLIC_URL do serviço postgres (execute da sua máquina) ou via `railway run`.
-- NUNCA configure DATABASE_ADMIN_URL em serviços de aplicação (api, worker, frontends).
--
-- Por que isso existe: superusuário IGNORA Row-Level Security. Se a aplicação usar o
-- usuário padrão "postgres", o isolamento entre tenants deixa de existir.
-- =====================================================================
\set ON_ERROR_STOP on

-- ---------- migrator: dono dos schemas, roda migrações ----------
SELECT format('CREATE ROLE migrator LOGIN PASSWORD %L NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS', :'migrator_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') \gexec
SELECT format('ALTER ROLE migrator WITH LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', :'migrator_password') \gexec

-- ---------- app: runtime da api/worker (sujeito a RLS) ----------
SELECT format('CREATE ROLE app LOGIN PASSWORD %L NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') \gexec
SELECT format('ALTER ROLE app WITH LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', :'app_password') \gexec

-- ---------- platform: outbox relay e @PlatformJob (ignora RLS, permissões mínimas) ----------
SELECT format('CREATE ROLE platform LOGIN PASSWORD %L NOSUPERUSER NOCREATEROLE NOCREATEDB BYPASSRLS', :'platform_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform') \gexec
SELECT format('ALTER ROLE platform WITH LOGIN PASSWORD %L NOSUPERUSER BYPASSRLS', :'platform_password') \gexec

-- ---------- permissões no banco ----------
SELECT format('GRANT CONNECT, CREATE, TEMPORARY ON DATABASE %I TO migrator', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO app, platform', current_database()) \gexec

-- ninguém além do migrator cria objetos no schema public
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO migrator, app, platform;

-- timeouts de segurança para o runtime (evitam transações presas segurando locks)
ALTER ROLE app SET statement_timeout = '15s';
ALTER ROLE app SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE platform SET statement_timeout = '60s';

-- ---------- verificação ----------
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
FROM pg_roles WHERE rolname IN ('migrator', 'app', 'platform') ORDER BY rolname;

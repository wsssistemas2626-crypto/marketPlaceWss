-- =====================================================================
-- Identidade dos painéis (ADR-013): espelho do que vive na Clerk.
--
-- Estas duas tabelas são **intencionalmente sem tenant_id na policy**: elas
-- são o mapeamento que DESCOBRE o tenant de uma organização, então precisam
-- ser legíveis antes de existir TenantContext. É a mesma exceção que o
-- `06-multi-tenancy.md` §3.3 abre para `identity.workforce_users`.
-- Nenhum dado de negócio mora aqui — só o vínculo organização → tenant/seller.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS identity AUTHORIZATION migrator;
GRANT USAGE ON SCHEMA identity TO app, platform;

ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA identity
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA identity
  GRANT USAGE, SELECT ON SEQUENCES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA identity
  GRANT SELECT ON TABLES TO platform;

-- Espelho mínimo do usuário da Clerk. Só o necessário ao login:
-- CPF/CNPJ, endereço e dados bancários NÃO vêm para cá (RNF-LGPD-05).
CREATE TABLE IF NOT EXISTS identity.workforce_users (
  clerk_user_id text PRIMARY KEY,
  email text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Organização da Clerk → tenant (e seller, quando kind = 'seller').
-- A API NUNCA confia só na claim do token: confere aqui (ADR-013 / §4.15).
CREATE TABLE IF NOT EXISTS identity.org_links (
  clerk_org_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('tenant', 'seller')),
  tenant_id uuid NOT NULL,
  seller_id uuid,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- organização de seller precisa apontar para um seller; a de tenant, não
  CONSTRAINT org_links_seller_consistency CHECK (
    (kind = 'seller' AND seller_id IS NOT NULL) OR (kind = 'tenant' AND seller_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS org_links_tenant_idx ON identity.org_links (tenant_id);

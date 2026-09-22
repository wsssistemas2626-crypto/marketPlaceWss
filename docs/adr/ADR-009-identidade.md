# ADR-009: IAM próprio no MVP; OIDC provider dedicado na Fase 3

**Status:** Parcialmente substituído pelo ADR-013 (painéis usam Clerk; vale apenas para compradores) · **Data:** 2026-09-21

## Contexto
Precisamos de login para 3 públicos, RBAC com escopo por loja, 2FA, API keys e, no futuro, OAuth para apps de terceiros.

## Decisão
Módulo `identity` próprio com bibliotecas maduras (argon2id, jose): access JWT curto (15 min), refresh rotativo com
detecção de reuso, RBAC por escopo, TOTP. API keys no módulo `integrations`. Na Fase 3 (Apps OAuth), adotar um provedor
OIDC dedicado (Keycloak, Zitadel, Ory ou Auth0/Clerk) — o módulo passa a ser um adaptador sobre ele.

## Alternativas consideradas
- **Keycloak/Zitadel desde o início** — descartada: mais um sistema para operar/customizar no MVP; UX de cadastro de
  e-commerce exige customização.
- **SaaS (Auth0/Clerk)** — viável; descartada por custo por MAU com muitos compradores e dados de clientes fora.

## Consequências
Controle total da UX; porém responsabilidade de segurança é nossa → testes de segurança dedicados e revisão.

## Quando revisitar
Início da Fase 3, ou exigência de SSO corporativo para sellers grandes.

## Atualização — multi-tenancy (ADR-012)
Usuários são **por tenant** (`UNIQUE(tenant_id, email)`), JWT carrega `tid` e é validado contra o host. Staff da
plataforma tem base separada (`tenancy.platform_users`) e só age em tenants via modo suporte auditado. Na Fase 3,
o provedor OIDC escolhido precisa suportar multi-tenancy (realms/organizations por tenant) — critério obrigatório.

# ADR-004 — Autenticação com Clerk (Organizations = tenants) e autorização RBAC própria

**Status:** Aceito · **Data:** 2026-09-21 · Substitui a versão anterior (autenticação própria)

## Contexto
Precisamos de login seguro, MFA, gestão de sessão, convites e, futuramente, SSO corporativo.
Construir isso internamente é caro e arriscado. Usuários podem pertencer a mais de um tenant.
A autorização do ERP é granular (`modulo.recurso.acao`) e configurável por tenant.

## Decisão

### Autenticação: Clerk
- Login, cadastro, MFA, recuperação de senha, sessões e convites ficam **inteiramente no Clerk**.
  O sistema **não armazena senhas** nem implementa telas de login próprias.
- **Cada tenant é uma Organization do Clerk.** A organização ativa da sessão define o tenant.
- Session token **v2** do Clerk (deve estar ativado no Dashboard). Claims usados:
  `sub` (id do usuário no Clerk), `sid`, `o.id` (id da organização ativa), `o.slg`, `azp`.
- Backend (NestJS): guard global que verifica o token com `@clerk/backend` (`verifyToken`),
  preferencialmente de forma *networkless* com `CLERK_JWT_KEY`, validando assinatura, `exp`, `nbf`
  e `azp` contra a lista de origens autorizadas.
- Resolução do tenant: `o.id` → `platform.tenants.clerk_org_id` → `tenant_id` (uuid) no `TenantContext` (ADR-001).
  Token sem organização ativa: só acessa `GET /api/v1/me`; demais rotas retornam 403 `TENANT_NOT_SELECTED`.
- Frontend: `@clerk/react` (`ClerkProvider`, `SignIn`, `OrganizationSwitcher`, `useAuth().getToken()`),
  com localização pt-BR (`@clerk/localizations`). O token vai no header `Authorization: Bearer`.
- Versão mínima `@clerk/backend` 2.4.0 (correção de vulnerabilidade em `verifyWebhook`).

### Sincronização Clerk → banco local
- Tabelas locais `users`, `tenants`, `memberships` guardam apenas IDs do Clerk, nome, e-mail e status,
  para permitir joins, auditoria e RBAC.
- **Webhooks** do Clerk (`user.*`, `organization.*`, `organizationMembership.*`) em
  `POST /api/v1/webhooks/clerk`, verificados com `verifyWebhook` (assinatura Svix, `CLERK_WEBHOOK_SIGNING_SECRET`).
  Processamento idempotente pelo `svix-id` em `platform.processed_events`.
- **Provisionamento sob demanda (JIT):** se chegar um token válido de usuário/organização ainda não
  sincronizado (webhook atrasado), o backend busca os dados na Backend API do Clerk e faz upsert.
  Assim o sistema funciona mesmo sem webhooks (ex.: desenvolvimento local e E2E).
- `organization.created` (ou JIT da organização) cria o tenant, semeia os papéis padrão e dá o papel
  `Administrador` ao criador.

### Autorização: RBAC próprio
- Papéis e permissões ficam **no nosso banco** (`roles`, `role_permissions`, `membership_roles`),
  não no Clerk. Os papéis de organização do Clerk (`org:admin`, `org:member`) só são usados para
  decidir o papel inicial no provisionamento; depois, apenas o RBAC local vale.
- Permissões **não vão no token** (limite de 4 KB do cookie de sessão do Clerk). O guard carrega as
  permissões do membership com cache curto (60 s), invalidado quando papéis mudam.
- Guard global nega por padrão; `@Public()` só em webhook e health.

### Isolamento do fornecedor
- Toda interação com o Clerk passa pela interface `IdentityProvider` em `platform/iam`
  (`verifySessionToken`, `getUser`, `getOrganization`, `verifyWebhook`). Nenhum outro módulo importa `@clerk/*` no backend.
- Testes de unidade e integração usam `FakeIdentityProvider`, que assina tokens RS256 com chave local
  no formato v2 do Clerk e webhooks com segredo de teste. **Nenhum teste do `pnpm check` acessa a rede.**
- Testes E2E usam uma instância de **desenvolvimento** do Clerk com `@clerk/testing` (Playwright).

## Consequências
- (+) Login, MFA, convites e SSO prontos, sem risco de implementarmos segurança de sessão errado.
- (+) Seletor de organização e fluxo de convite prontos no front.
- (−) **LGPD:** dados de identificação (nome, e-mail) ficam no Clerk, fora do Brasil. Exige transferência
  internacional amparada em contrato (DPA do Clerk) e menção na política de privacidade.
- (−) Custo por usuário/organização ativa conforme o plano do Clerk; recursos como SSO corporativo podem exigir plano pago.
- (−) Dependência de disponibilidade de terceiro para login (verificação de token é local e continua funcionando).
- (−) Dois lugares com dados de membros (Clerk e banco local), mantidos coerentes por webhook + JIT.

## Alternativas descartadas
- **Autenticação própria** (versão anterior deste ADR): mais risco e esforço, sem MFA/SSO prontos.
- **RBAC no Clerk (permissões customizadas de organização):** limita o catálogo de permissões ao plano
  do Clerk e aumenta o token; nosso modelo exige permissões granulares por módulo.
- **Keycloak:** controle total, mas mais um serviço para operar.

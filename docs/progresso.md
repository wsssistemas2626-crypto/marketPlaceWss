# Progresso do desenvolvimento

> Arquivo mantido pelo Claude Code. É a "memória" entre sessões: toda sessão começa lendo este arquivo
> e termina atualizando-o. Você (humano) pode editar a seção "Instruções do humano" a qualquer momento.

## Estado atual
- **Fase:** 1 — MVP transacional
- **Marco atual:** 1.1 — Identidade (em andamento)
- **Branch de trabalho:** `fase-1/m11-identidade` (empilhada sobre `fase-1/m10-tenancy-de-produto`: os PRs #1–#6
  ainda não entraram na `main`)
- **Próxima story:** US-011 (login, refresh e logout do comprador) → US-012 → US-014
- **Última atualização:** 2026-09-23

## Checkpoints da Fase 0
| Checkpoint | Stories | Status | Branch / PR |
|---|---|---|---|
| C1 — Monorepo de pé | US-001, US-002, US-003 | ✅ | PR #1 |
| C2 — Tenancy, banco e eventos | US-070, US-004, US-071, US-005, US-072 | ✅ | PR #2 |
| C3 — Plataforma e Clerk | US-006, US-007, US-073, US-009, US-082 | ✅ | PR #3 |
| C4 — Console, isolamento e CI | US-075, US-074, US-008 | ✅ CI verde | PR #4 |
| C5 — Railway (staging + PR) | US-084 | 🚧 código pronto, falta a conta | `fase-0/c5-railway` (PR #5) |

## Fase 1 — marco 1.1 (em andamento)
Ordem: US-013 → US-083 → US-010 → **US-011** → US-012 → US-014. A US-011 não estava na lista do marco no plano,
mas a US-012 (derrubar sessões) e a US-014 (comprador logado) dependem dela — incluída.
- **US-013** — catálogo de papéis/permissões em `@mkt/contracts`; `pnpm clerk:roles` sincroniza com a Clerk pela
  Backend API (idempotente); API descarta papel de outro tipo de organização e exige MFA (`fva`) dos papéis
  sensíveis e do staff; teste que audita **todas** as rotas (RNF-SEG-03), com `@Public(motivo)` explícito.
- **US-083** — marca do tenant (tema publicado) e `OrganizationSwitcher` no cabeçalho do admin e do seller center,
  com aviso por causa quando a organização ativa é recusada. Corrigido: sem template de sessão, `org_kind` ausente
  virava "tenant" e o seller center recusava organização de seller.
- **US-010** — cadastro de comprador por tenant (`UNIQUE(tenant_id, email)`): CPF/CNPJ, senha forte, Argon2id nativo,
  aceite de termos com versão/data/IP, confirmação por link de 24 h (token só como SHA-256 no banco, no fragmento
  da URL), resposta genérica para e-mail existente. Telas `/conta/cadastro` e `/conta/confirmar` no storefront.
  Em desenvolvimento o e-mail "fake" é entregue no Mailpit (http://localhost:8025).

## Fase 1 — marco 1.0 (concluído — PR #6)
- **US-085 (spike)** — Worker do edge + adapter Cloudflare for SaaS. Artefatos prontos e testados; a validação
  real depende do domínio e da conta (checklist §C). Relatório em `docs/spikes/US-085.md`.
- **US-076** — provisionamento idempotente por etapas, orquestrado por evento, com seed confirmado pelos módulos.
- **US-077** — tema do tenant (rascunho × publicado) aplicado no storefront; tela `/tema` no admin com preview.
- **US-080** — suspensão com máquina de estados e modo suporte auditado: ações no console (detalhe do tenant)
  e histórico em `/suporte` no admin do tenant.
- **US-081** — projeção de uso por eventos e saúde de integrações no console.
- **`pnpm link:orgs`** — liga as organizações reais da Clerk aos tenants de desenvolvimento (o seed cria
  vínculos `org_dev_*`, que servem aos testes mas não existem na conta da Clerk). Com `--console <e-mail>`
  também convida o staff para a aplicação Console, cujo cadastro é restrito a convite.

## Fase 0 — concluído
- **US-001** — monorepo pnpm + Turborepo, `packages/config` (tsconfig/eslint/prettier), `packages/platform`
  (primitivas de health), apps `api`/`worker` (NestJS) e `storefront`/`admin`/`seller-center`/`console` (Next.js
  standalone), `docker-compose.yml` com postgres+roles, redis `noeviction`, meilisearch, mailpit e minio.
  Verificado: `pnpm install && docker compose up -d && pnpm dev` sobe os 6 serviços; `GET /health` da api
  responde 200 com status de DB e Redis e 503 quando o Redis cai.

- **US-002** — fronteiras do CLAUDE.md §4 verificadas por `pnpm lint:boundaries`: regras de import por camada
  em `packages/config/eslint/boundaries.js` + lista branca de dependências no package.json de cada módulo
  (`scripts/check-module-dependencies.mjs`). 12 testes sobre fixtures com violações propositais.

- **US-003** — `@mkt/shared-kernel`: `Money` (centavos, half-even, rateio sem perda RN-FIN-03), `Id` (UUID v7),
  `Result`, `DomainError` e filhos, `Clock`/`FixedClock`, `DomainEvent` no formato CloudEvents. 38 testes,
  cobertura 100% travada no vitest. Plano: `docs/planos/US-003.md`.

- **US-070** — TenantContext (AsyncLocalStorage), resolução por host com X-Edge-Secret, ProblemDetailsFilter.
- **US-004** — migrações SQL por módulo com role `migrator`, unit of work, Testcontainers, módulo `_template`.
- **US-071** — RLS forçado, TenantAwareRepository, rls-coverage e contadores por tenant.
- **US-005** — outbox transacional, relay com role `platform`, BullMQ com DLQ, consumidor idempotente.
- **US-072** — @PlatformJob, fairness entre tenants, chaves `t:{id}` / `t/{id}/`, cota por tenant.

- **US-006/US-007** — pino com redação de PII, correlation_id, OTel opcional, Idempotency-Key e rate limit.
- **US-073** — ConfigService hierárquico, @RequiresModule e limites de plano.
- **US-009** — hub de integrações por tenant, credenciais cifradas e fakes de todas as ports.
- **US-082** — Clerk nos painéis: org_links como fonte da verdade do tenant, guards e webhook.

- **US-075** — registro de tenants em banco, rotas /v1/platform e console listando tenants.
- **US-074** — suíte de isolamento que descobre as rotas e prova A↛B, com testes do próprio harness.
- **US-008** — GitHub Actions: qualidade, testes, OpenAPI em dia, 6 imagens Docker, gitleaks e audit.

- **US-084** — railway.json dos 6 serviços, Dockerfiles (na US-008), runbook de deploy. **Não executado na
  Railway**: a seção B do checklist está pendente e não há credencial neste ambiente.

## Bloqueios e pendências
- **Marco 1.1 — rodar `pnpm clerk:roles`** na instância de desenvolvimento da Clerk (a sessão do agente não tem
  permissão para usar a chave). Depois, habilitar MFA (TOTP) na aplicação Plataforma e "exigir MFA" na Console
  (dashboard), e só então `PANEL_MFA_ENFORCED=true` localmente.
- **Rate limit por IP atrás do storefront**: quem chama a API é o servidor Next, então todos os compradores
  compartilham o IP dele. O IP real só chega com `X-Forwarded-For` + segredo do edge (usado hoje só no
  consentimento). Ajustar o `RateLimitGuard` antes do go-live (anotado para a US-086).
- **Senha vazada (k-anonymity/HIBP)**: `PasswordBreachPort` existe com implementação desligada — decidir se liga.
- **Decisão D11** (conta de comprador isolada ou única) segue aberta no checklist; implementado o padrão do ADR-013
  (isolada por tenant).
- **Checklist §B inteira** (conta Railway Pro, projeto, ambientes, CLI, serviços de dados, bootstrap de roles,
  shared variables): sem isso o deploy da US-084 não pode ser executado. Runbook pronto em
  `docs/runbooks/deploy.md`.
- `pnpm gen:sdk` ainda é uma tarefa vazia do Turborepo — o cliente gerado é da Fase 1 (`packages/sdk`).
- Testes que dependam da injeção de dependência do Nest precisarão de um transformador com
  `emitDecoratorMetadata` (SWC) no Vitest — hoje os testes exercitam as classes diretamente.
- A imagem da api tem ~874 MB (copia o `node_modules` do workspace podado). Reduzir fica para a US-086.
- Checklist §A/§G: **CLERK_WEBHOOK_SIGNING_SECRET** e **CONSOLE_CLERK_WEBHOOK_SIGNING_SECRET** continuam pendentes
  (só existem depois de criar o endpoint no dashboard). Sem eles o adapter recusa webhooks — que é o comportamento
  correto. Proteção do branch `main` e branch `production` também seguem pendentes.

## Achados da revisão de arquitetura (corrigidos)
- **Relay do outbox sem backoff**: varrendo a cada 1 s, as 5 tentativas se esgotavam em ~5 s e qualquer queda
  curta do barramento mandaria eventos válidos para a DLQ. Corrigido com `next_attempt_at` e backoff exponencial.
- **Módulo dependendo de adapter**: `integrations` declarava `@mkt/adapters-fakes`. O registro de adapters passou
  para o composition root (apps/api) — quem foi pego foi a própria checagem de fronteiras, no CI.
- **Policy de RLS com `::uuid` direto**: sem contexto, o setting vem vazio e a consulta explodia em vez de não
  ver nada. Corrigido com `NULLIF` no gerador, nas migrações e no `infra/db/module-schema-template.sql`.

## Decisões tomadas durante o desenvolvimento
- **ADR-015 (Proposto)**: fronteiras verificadas com regras nativas do ESLint em vez de `eslint-plugin-boundaries`.
  O plugin 7.2.0 não acusou `@nestjs/common` dentro de `domain/` e a API nova não está documentada offline.
  **Precisa da sua aprovação** (ou da escolha por dependency-cruiser).
- **Antivírus com inspeção de TLS (Norton) quebra o login dos painéis**: o sandbox de *edge runtime* do Next usa a
  lista de CAs embutida, não a do Windows, então o middleware da Clerk falhava ao buscar o JWKS
  (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`), a sessão era lida como deslogada e o login entrava em laço —
  `/` → `/sign-in` → "já está logado" → `/`. `pnpm ca:local` exporta a raiz da máquina para `.certs/`
  (fora do versionamento) e o `with-env.mjs` a passa como `NODE_EXTRA_CA_CERTS`.
- **Next.js não lê o `.env` da raiz**: em monorepo ele só procura dentro da pasta do app, então o storefront
  subia sem `EDGE_SHARED_SECRET`, ignorava o `X-Forwarded-Host` e toda loja virava "Loja não encontrada".
  Os 4 apps Next agora sobem por `scripts/with-env.mjs`, que carrega o `.env` da raiz antes do `next dev`.
- **`turbo run dev --concurrency=20`**: são 16 tarefas persistentes (6 apps + 10 pacotes em watch) e o padrão 10
  abortava o `pnpm dev` com "Invalid task configuration".
- **`pnpm seed:dev`**: o `seed-dev.ts` existia mas não tinha script — agora está na api, no turbo e na raiz, e
  publica um tema por loja de desenvolvimento (rosa na A, verde na B) para o white-label ser visível sem passo manual.
- **pnpm 10.20.0** (não a 12.x): no Windows sem Developer Mode a 12.x falha ao criar symlinks
  (`os error 5`); a 10.x usa junctions e instala normalmente. Pinado em `packageManager`.
- **Dev dos apps Nest com `nest start --watch`** (tsc) em vez de `tsx`: o esbuild não emite
  `emitDecoratorMetadata` e a injeção de dependência do Nest quebra em runtime.
- **MinIO a partir da `quay.io`**: as imagens `minio/minio` e `minio/mc` saíram do Docker Hub.
- **Portas locais**: storefront 3000, admin 3001, seller-center 3002, console 3003, api 3100, worker 3101.
- `consistent-type-imports` desligado só no preset Node do ESLint (quebraria a DI do Nest).

## Decisões do marco 1.1
- **Argon2id nativo do Node** (`crypto.argon2`, ≥ 24.7) em `@mkt/platform`, sem dependência nova; `engines.node`
  subiu para `>=24.7`.
- **Papéis no role set inicial da Clerk**, não um role set por tipo de organização: o SDK não expõe `role_set_key`
  e trocar o role set de organização com membros exige migração. O isolamento tenant × seller é garantido no
  backend. O role set inicial ficou com 10 papéis — o **máximo** da Clerk; papel novo exigirá role sets por tipo.
- **`PlatformModule` da API é global** (`ConfigService` alcançável por qualquer módulo, CLAUDE.md §4.13).
- **Verificação sem turbo nesta máquina**: com o `pnpm dev` rodando (16 watchers + 4 Next), o turbo passa de 10 min;
  e o `pnpm` global é a 11.x, que trava ao delegar para a 10.20. Rodar `npm run <script>` por pacote funciona.

## Instruções do humano
_(escreva aqui ajustes para a próxima sessão, ex.: "priorize X", "não use a lib Y")_

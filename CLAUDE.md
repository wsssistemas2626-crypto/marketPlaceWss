# CLAUDE.md — Guia do Projeto Marketplace

> Este arquivo é lido automaticamente pelo Claude Code. Ele define **como** trabalhar neste repositório.
> O **o quê** está em `docs/`. Em caso de conflito, a ordem de precedência é:
> 1. ADRs aceitos (`docs/adr/`) → 2. Este arquivo → 3. Demais documentos em `docs/`.

## 1. O que é este sistema

Plataforma **SaaS multi-tenant** de marketplace multi-vendedor (modelo Mercado Livre / Amazon / Magalu):
cada **tenant** é um operador que roda o próprio marketplace (domínio, marca, sellers, compradores, integrações).
Construída como **monólito modular**
em TypeScript, com arquitetura **hexagonal (ports & adapters)** para que qualquer integração externa
(pagamento, frete, fiscal, ERP, busca, notificação, hubs) seja um adapter plugável.

Repositório: https://github.com/wsssistemas2626-crypto/marketPlaceWss.git
Identificadores de serviços externos (Clerk, Railway): `docs/07-checklist-pre-desenvolvimento.md` §G

Leitura obrigatória antes de qualquer tarefa não trivial:
- `docs/01-visao-produto.md` — escopo, atores, glossário
- `docs/arquitetura/01-visao-arquitetura.md` — estilo e containers
- `docs/arquitetura/02-modulos.md` — fronteiras, responsabilidades e eventos de cada módulo
- `docs/arquitetura/06-multi-tenancy.md` — **isolamento entre tenants (obrigatório em toda story)**
- `docs/arquitetura/07-infraestrutura-railway.md` — deploy, variáveis, roles do banco e armadilhas (obrigatório em stories de infra/deploy)
- `docs/07-checklist-pre-desenvolvimento.md` — contas/chaves que precisam existir antes de cada story
- `docs/06-plano-execucao.md` — em que fase estamos e o que vem a seguir

## 2. Stack (ver ADR-002)

| Camada | Tecnologia |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Linguagem | TypeScript (strict) em todo o repo |
| Backend | NestJS (API HTTP + Worker na mesma base) |
| ORM / DB | Drizzle ORM + PostgreSQL (um *schema* Postgres por módulo) |
| Multi-tenancy | Pool: `tenant_id` em toda tabela + Row-Level Security + `AsyncLocalStorage` (ADR-012) |
| Autenticação | **Clerk** para painéis (console, admin, seller center) com Organizations = tenants e sellers; identidade própria para compradores do storefront (ADR-013) |
| Filas / jobs | BullMQ + Redis |
| Busca | Meilisearch (atrás de `SearchPort`) |
| Frontends | Next.js (App Router): `storefront`, `seller-center`, `admin`, `console` — todos multi-tenant por host |
| UI | Tailwind + shadcn/ui em `packages/ui` |
| Validação / contratos | Zod em `packages/contracts` (DTOs + eventos) |
| Testes | Vitest (unit/integração), Testcontainers (Postgres/Redis), Playwright (E2E) |
| Observabilidade | OpenTelemetry + logs estruturados (pino) |
| Infraestrutura | **Railway** (ADR-014): Postgres (PITR), Redis, Storage Bucket (S3), Meilisearch e todos os apps; Config as Code em `apps/<app>/railway.json`; domínios de tenants via Cloudflare for SaaS |
| Local | docker-compose (postgres com as mesmas roles via `infra/db/`, redis, meilisearch, mailpit, minio) |

Use sempre as versões estáveis mais recentes compatíveis entre si. Não introduza nova dependência
relevante (framework, banco, broker) sem criar um ADR.

## 3. Estrutura do repositório

```
apps/
  api/                 # host NestJS: carrega os módulos e expõe HTTP
  worker/              # host NestJS: consome filas, outbox relay, jobs agendados
  storefront/          # Next.js — comprador (SSR/SEO), identidade própria, domínio do tenant
  seller-center/       # Next.js — painel do vendedor (Clerk, org kind=seller) — vendedor.<plataforma>
  admin/               # Next.js — backoffice do operador do tenant (Clerk, org kind=tenant) — admin.<plataforma>
  console/             # Next.js — console da plataforma SaaS (Clerk app separada) — console.<plataforma>
packages/
  modules/<modulo>/    # um pacote por bounded context (ver docs/arquitetura/02-modulos.md)
  adapters/<categoria>-<provedor>/   # ex.: payment-pagarme, shipping-melhorenvio
  shared-kernel/       # Money, Id, Result, DomainEvent, Clock, erros base
  contracts/           # Zod: DTOs públicos + catálogo de eventos versionados
  platform/            # outbox, event bus, idempotência, auth guards, observabilidade
  ui/  sdk/  config/   # componentes, cliente gerado da API, eslint/tsconfig
docs/                  # requisitos, arquitetura, ADRs, plano
```

### Estrutura interna de um módulo
```
packages/modules/<modulo>/
  src/
    domain/          # entidades, value objects, regras puras. SEM Nest, SEM Drizzle.
    application/     # casos de uso (commands/queries), ports (interfaces) 
    infrastructure/  # repositórios Drizzle, implementações de ports internos
    http/            # controllers Nest, DTOs (reusa contracts)
    events/          # handlers de eventos de OUTROS módulos
    <modulo>.module.ts
    index.ts         # ÚNICA API pública do módulo (facade + tipos exportados)
  drizzle/           # schema e migrações do schema Postgres do módulo
  test/
```

## 4. Regras invioláveis de arquitetura

1. **Um módulo nunca importa arquivos internos de outro.** Só importa de `@mkt/modules-<outro>` (o `index.ts`).
   Isso é verificado por `eslint-plugin-boundaries` / dependency-cruiser — o CI quebra se violar.
2. **Um módulo nunca lê/escreve tabelas de outro schema.** Nada de JOIN entre schemas. Precisa de dado de
   outro módulo? Chame a facade dele (síncrono) ou mantenha uma projeção local alimentada por eventos.
3. **`domain/` é puro:** sem framework, sem I/O, 100% testável com unit tests.
4. **Toda integração externa passa por um Port** definido no módulo dono do conceito
   (ex.: `PaymentGatewayPort` em `payments`). Adapters vivem em `packages/adapters/*` e são selecionados
   por configuração no Integration Hub. Nenhum SDK de terceiro é importado dentro de `packages/modules/*`.
5. **Efeitos colaterais entre módulos via eventos com Transactional Outbox**: o evento é gravado na mesma
   transação da mudança de estado; o worker publica. Handlers são **idempotentes** (chave = `event.id`).
6. **Dinheiro é sempre inteiro em centavos** (`Money { amount: bigint|number inteiro, currency: 'BRL' }`).
   Nunca `float`. Arredondamento de comissão/split: ver `docs/04-regras-de-negocio.md` (RN-FIN).
7. **Estados de pedido/pagamento/repasse são máquinas de estado explícitas** no domínio; transição inválida = erro.
8. **Nenhum dado de cartão** trafega ou é armazenado aqui (tokenização no gateway — PCI SAQ-A).
9. **Dados pessoais** (CPF, endereço, telefone) são marcados no schema e nunca aparecem em logs.
10. Endpoints que criam recursos ou movimentam dinheiro exigem header `Idempotency-Key`.
11. **Isolamento de tenant (ADR-012):** toda tabela de negócio tem `tenant_id NOT NULL` + RLS forçado; unicidades
    incluem `tenant_id`; o tenant vem **somente** do `TenantContext` (host do storefront / organização ativa da Clerk nos painéis / API key / config de webhook) —
    **nunca** do body, query ou header livre. Toda query roda em transação com `SET LOCAL app.tenant_id`
    (use o `TenantAwareRepository`/`withTenantTx` de `@mkt/platform`, nunca o client cru).
12. Eventos e jobs carregam `tenantId`; chaves de cache, filas, storage e índices de busca são prefixados por tenant.
    Job sem tenant só com o decorator `@PlatformJob` e justificativa.
13. Configurações `[config]` são lidas via `ConfigService.get(key)` que resolve plataforma → plano → tenant.
    Funcionalidades de módulos opcionais exigem `@RequiresModule('<modulo>')` (entitlements do plano).
14. Todo teste de integração de rota inclui um caso **cross-tenant** (dados do Tenant B inacessíveis a partir do A).
15. **Autenticação (ADR-013):** painéis usam Clerk (`@clerk/nextjs` no front, `@clerk/backend` na API). A API **sempre**
    valida o token da Clerk e confere o mapeamento organização → tenant/seller no banco; nunca confie em claims sem essa
    checagem. SDK da Clerk só pode ser importado em `packages/adapters/identity-clerk` e nos apps Next.js — nunca em
    `packages/modules/*`. Compradores usam o módulo `identity` próprio. Nunca misture os dois fluxos na mesma rota.
16. **Banco e infraestrutura (ADR-014):** runtime conecta **somente** com o role `app` (`DATABASE_URL`); worker usa
    também `platform` (`DATABASE_URL_PLATFORM`) apenas no outbox relay e em `@PlatformJob`; migrações usam `migrator`
    (`DATABASE_URL_MIGRATOR`) e rodam só no `preDeployCommand` da api. **Nunca** use o usuário `postgres`
    (superusuário ignora RLS). Siga a tabela de armadilhas do `07-infraestrutura-railway.md` (PORT, escutar em `::`,
    `family: 0` no ioredis, SIGTERM, SET LOCAL, `noeviction`).
17. **Antes de uma story que dependa de conta/chave externa**, confira `docs/07-checklist-pre-desenvolvimento.md`.
    Se o item estiver pendente, implemente com o adapter **fake** e liste a pendência no resumo — não pare o trabalho.
18. **Railway via agente:** nunca executar em `production` sem confirmação explícita; nunca apagar serviço, volume,
    bucket ou ambiente; nunca imprimir valores de variáveis secretas.

## 5. Convenções

- Nomes de código em **inglês**; textos de UI e documentação em **português (pt-BR)**.
- IDs: UUID v7 (ordenáveis). Datas: UTC no banco, `timestamptz`.
- Eventos: `<modulo>.<entidade>.<verbo_no_passado>` — ex.: `orders.order.placed`. Envelope CloudEvents
  (ver `docs/arquitetura/03-integracoes.md`). Todo evento tem `version` e schema Zod em `packages/contracts`.
- HTTP: REST, prefixo `/v1`, recursos no plural, paginação por cursor, erros no formato RFC 9457 (Problem Details).
- Rotas por público: `/v1/store/*` (comprador), `/v1/seller/*` (vendedor), `/v1/admin/*` (operador do tenant),
  `/v1/public/*` (API de integração com API key), `/v1/platform/*` (staff da plataforma, sem tenant).
- Commits: Conventional Commits (`feat(catalog): ...`).
- Branches: no fluxo manual (`/implementar-story`), uma story = uma branch = um PR. No **modo autônomo** (`/continuar`),
  uma branch por checkpoint (`fase-<n>/c<k>-<slug>`), **um commit por story**, um PR por checkpoint.
- **Memória entre sessões:** comece toda sessão lendo `docs/progresso.md` e termine atualizando-o.

## 6. Variáveis de ambiente
Copie `.env.example` para `.env` (nunca faça commit de `.env`). Chaves da Clerk: aplicação **Plataforma**
(admin + seller center) e aplicação **Console** (staff), cada uma com publishable key, secret key, JWT key e segredo de webhook.

## 6.1 Banco local e roles
O container Postgres do docker-compose monta `infra/db/` e executa `local-init.sh`, criando as roles `migrator`, `app`
e `platform` (mesmas da Railway). O helper de migração segue `infra/db/module-schema-template.sql`.

## 6.2 Comandos

```bash
pnpm install
docker compose up -d            # infraestrutura local
pnpm db:migrate                 # roda migrações de todos os módulos
pnpm seed:dev                   # planos, tenants loja-a/loja-b, orgs, integrações fake e temas
pnpm link:orgs                  # liga as organizações reais da Clerk aos tenants (desenvolvimento)
pnpm dev                        # api + worker + frontends
pnpm test                       # unit + integração
pnpm test:e2e                   # Playwright
pnpm lint && pnpm typecheck     # inclui checagem de fronteiras entre módulos
pnpm gen:openapi && pnpm gen:sdk
```
(Se algum comando ainda não existir, criá-lo faz parte da Fase 0.)

## 7. Como trabalhar (fluxo esperado do Claude Code)

Modo autônomo: `/continuar` (ver `.claude/commands/continuar.md` e `docs/08-roteiro-desenvolvimento-autonomo.md`).
Modo manual, story a story com aprovação do plano:

1. Identifique a story em `docs/05-backlog.md` (ID `US-xxx`) e os RF/RN/RNF referenciados.
2. Leia a seção do módulo em `docs/arquitetura/02-modulos.md` e os ADRs relacionados.
3. Planeje antes de codar: liste arquivos a criar/alterar, eventos publicados/consumidos, migrações.
4. Implemente **de dentro para fora**: domínio (+ testes) → aplicação (+ testes) → infraestrutura → HTTP → UI.
5. Cada cenário Gherkin da story vira pelo menos um teste automatizado.
6. Rode `pnpm lint typecheck test` antes de concluir. Não desabilite regra de lint para passar.
7. Atualize a documentação quando mudar contrato (OpenAPI, catálogo de eventos, modelo de dados).
8. Se uma decisão não estiver coberta pelos docs, **pare e registre** uma proposta de ADR em `docs/adr/`
   com status `Proposto` em vez de decidir silenciosamente.

## 8. Definition of Done

- [ ] Critérios de aceite da story cobertos por testes que passam
- [ ] Cobertura ≥ 80% em `domain/` e `application/` do módulo alterado
- [ ] Lint, typecheck e checagem de fronteiras sem erros
- [ ] Migração reversível (ou justificativa no PR)
- [ ] OpenAPI e catálogo de eventos atualizados se houve mudança de contrato
- [ ] Logs sem dados pessoais; ações sensíveis registradas no audit log
- [ ] Tabelas novas com `tenant_id` + RLS; teste cross-tenant passando
- [ ] Checklist da story marcado em `docs/05-backlog.md`

## 9. O que NÃO fazer

- Não criar microsserviços, Kafka, Kubernetes ou GraphQL sem ADR aprovado.
- Não usar `any`, `float` para dinheiro, `Date.now()` direto no domínio (use `Clock`).
- Não chamar APIs externas dentro de transação de banco.
- Não usar o role/cliente privilegiado (bypass de RLS) fora de migrações, outbox relay e `@PlatformJob`.
- Não criar código ou `if` específico para um tenant — diferenças entre tenants são configuração ou plano.
- Não acoplar UI ao schema do banco — frontends consomem somente a API (via `packages/sdk`).

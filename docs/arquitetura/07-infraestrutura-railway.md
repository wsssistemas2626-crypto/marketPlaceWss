# Arquitetura — 07. Infraestrutura na Railway

Decisão: **ADR-014**. Este documento é a **especificação executável** da infraestrutura: o Claude Code implementa
exatamente isto na US-084 (staging + PR), US-085 (domínios de tenant) e US-086 (produção).

## 1. Topologia

```mermaid
flowchart LR
  subgraph Internet
    B[Compradores] 
    O[Operadores / Sellers / Staff]
    CF[Cloudflare for SaaS<br/>domínios próprios dos tenants]
  end
  subgraph Railway["Projeto Railway: marketplace (1 por ambiente)"]
    SF[storefront<br/>*.plataforma]
    AD[admin<br/>admin.plataforma]
    SC[seller-center<br/>vendedor.plataforma]
    CO[console<br/>console.plataforma]
    API[api<br/>api.plataforma]
    WK[worker<br/>sem domínio]
    PG[(postgres<br/>volume + PITR)]
    RD[(redis)]
    MS[(meilisearch<br/>volume, privado)]
    BK[[bucket media]]
  end
  CL[Clerk]
  B -->|loja-x.plataforma| SF
  B -->|loja-x.com.br| CF --> SF
  O --> AD & SC & CO
  AD & SC & CO -.login.-> CL
  SF & AD & SC & CO -->|REST| API
  API --> PG & RD & MS & BK
  WK --> PG & RD & MS & BK
  API -.valida tokens.-> CL
```

Comunicação entre serviços pela **rede privada** (`<servico>.railway.internal`). Apenas os serviços de borda
(storefront, admin, seller-center, console, api) têm domínio público. `worker`, `postgres`, `redis` e `meilisearch`
**não** têm domínio público em staging/produção.

## 2. Serviços

| Serviço | Origem | Config | Start | Domínio (produção) | Réplicas prod |
|---|---|---|---|---|---|
| `api` | repo, `apps/api/Dockerfile` | `apps/api/railway.json` | `node dist/main.js` | `api.<plataforma>` | 2+ |
| `worker` | repo, `apps/worker/Dockerfile` | `apps/worker/railway.json` | `node dist/main.js` | — | 1–2 |
| `storefront` | repo, `apps/storefront/Dockerfile` | `apps/storefront/railway.json` | `node server.js` (Next standalone) | `*.<plataforma>` (wildcard) + `edge-origin.<plataforma>` | 2+ |
| `admin` | repo | `apps/admin/railway.json` | Next standalone | `admin.<plataforma>` | 1 |
| `seller-center` | repo | `apps/seller-center/railway.json` | Next standalone | `vendedor.<plataforma>` | 1 |
| `console` | repo | `apps/console/railway.json` | Next standalone | `console.<plataforma>` | 1 |
| `postgres` | Railway PostgreSQL (imagem oficial, **tag de versão major**, ex. `:17`) | dashboard | — | — (TCP proxy só se necessário, desligado em prod) | HA avaliado na US-086 |
| `redis` | Railway Redis | dashboard | política `noeviction` | — | — |
| `meilisearch` | imagem `getmeili/meilisearch` (versão fixada) + volume | dashboard | — | — | 1 |
| `media` | Railway Storage Bucket | dashboard | — | — (arquivos via URL pré-assinada) | — |

PITR e HA exigem a imagem oficial do Postgres com tag major — não use `:latest` nem start command customizado.

## 3. Config as Code (modelos)

Todos os serviços usam a **raiz do repositório** como contexto de build (monorepo pnpm) e `watchPatterns` para só
reconstruir o que mudou. Esquema: `https://railway.com/railway.schema.json`.

`apps/api/railway.json`
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "apps/api/Dockerfile",
    "watchPatterns": ["apps/api/**", "packages/**", "pnpm-lock.yaml"]
  },
  "deploy": {
    "preDeployCommand": ["node dist/migrate.js"],
    "startCommand": "node dist/main.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 60,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5,
    "overlapSeconds": 20,
    "drainingSeconds": 30
  },
  "environments": {
    "pr": {
      "deploy": { "preDeployCommand": ["node dist/migrate.js && node dist/seed-dev.js"] }
    }
  }
}
```

`apps/worker/railway.json` — igual, **sem** `preDeployCommand`, **sem** `healthcheckPath` HTTP (o worker expõe
`/health` numa porta interna opcional), `drainingSeconds: 60` para terminar jobs em andamento.

`apps/storefront/railway.json` (e os demais Next.js)
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "apps/storefront/Dockerfile",
    "watchPatterns": ["apps/storefront/**", "packages/ui/**", "packages/sdk/**", "packages/contracts/**", "pnpm-lock.yaml"]
  },
  "deploy": {
    "startCommand": "node apps/storefront/server.js",
    "healthcheckPath": "/api/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

No dashboard de cada serviço, aponte o **caminho do arquivo de config** para o `railway.json` do app
(ex.: `apps/api/railway.json`). O agente deve conferir o schema atual da Railway antes de adicionar campos novos.

### Dockerfiles (padrão obrigatório)
- Multi-stage com `turbo prune <app> --docker` → `pnpm install --frozen-lockfile` → `turbo build --filter=<app>`.
- Imagem final `node:<LTS>-slim`, usuário não-root, só `dist/` (ou `.next/standalone` + `static` + `public`).
- Next.js com `output: 'standalone'`.
- Nada de segredo em `ARG`/`ENV` de build; variáveis de runtime vêm da Railway.

## 4. Variáveis por serviço (Railway)

Use **variáveis de referência** (`${{servico.VARIAVEL}}`) e **variáveis compartilhadas** (`${{shared.VAR}}`) —
nunca copie valores à mão entre serviços.

**Compartilhadas (por ambiente):** `DB_MIGRATOR_PASSWORD`, `DB_APP_PASSWORD`, `DB_PLATFORM_PASSWORD`,
`PLATFORM_ROOT_DOMAIN`, `EDGE_SHARED_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY`, `NODE_ENV`, `LOG_LEVEL`.

**api**
```
DATABASE_URL=postgresql://app:${{shared.DB_APP_PASSWORD}}@${{postgres.PGHOST}}:${{postgres.PGPORT}}/${{postgres.PGDATABASE}}
DATABASE_URL_MIGRATOR=postgresql://migrator:${{shared.DB_MIGRATOR_PASSWORD}}@${{postgres.PGHOST}}:${{postgres.PGPORT}}/${{postgres.PGDATABASE}}
REDIS_URL=${{redis.REDIS_URL}}
MEILISEARCH_URL=http://${{meilisearch.RAILWAY_PRIVATE_DOMAIN}}:7700
MEILISEARCH_MASTER_KEY=${{meilisearch.MEILI_MASTER_KEY}}
S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET / S3_REGION / S3_URL_STYLE  → referências das credenciais do bucket media
CLERK_SECRET_KEY, CLERK_JWT_KEY, CLERK_WEBHOOK_SIGNING_SECRET, CLERK_AUTHORIZED_PARTIES
CONSOLE_CLERK_SECRET_KEY, CONSOLE_CLERK_JWT_KEY, CONSOLE_CLERK_WEBHOOK_SIGNING_SECRET
CUSTOMER_JWT_PRIVATE_KEY, CUSTOMER_JWT_PUBLIC_KEY
```
**worker:** igual à api + `DATABASE_URL_PLATFORM=postgresql://platform:${{shared.DB_PLATFORM_PASSWORD}}@...` e
**sem** `DATABASE_URL_MIGRATOR`.
**frontends:** `API_INTERNAL_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` (chamadas server-side),
`NEXT_PUBLIC_API_URL=https://api.<plataforma>`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (admin/seller-center/console),
`CLERK_SECRET_KEY` (server-side do Next), `EDGE_SHARED_SECRET` (storefront).

> Os nomes exatos das variáveis que o Postgres, o Redis e o bucket expõem devem ser conferidos no dashboard
> (aba Variables/Credentials) — o agente ajusta as referências na US-084.

**Nunca** coloque a URL do usuário `postgres` (superusuário) em nenhum serviço de aplicação. O bootstrap de roles é
feito uma vez por ambiente, da sua máquina (ver `GUIA-DE-INICIO.md`).

## 5. Armadilhas conhecidas (checklist para o agente)

| # | Armadilha | O que fazer |
|---|---|---|
| 1 | Superusuário ignora RLS | Runtime sempre com role `app`; teste de CI conecta com `app` e confirma `rolsuper = false` e `rolbypassrls = false` |
| 2 | Porta | Ler `process.env.PORT`; escutar em `::` (IPv4+IPv6) para funcionar na rede privada |
| 3 | ioredis/BullMQ na rede privada | Conexão com `family: 0` (dual stack) — recomendação da própria Railway |
| 4 | BullMQ exige `maxmemory-policy noeviction` | Configurar no Redis; worker checa `CONFIG GET maxmemory-policy` no boot e falha em produção se diferente |
| 5 | Encerramento | Tratar `SIGTERM`: Nest `enableShutdownHooks()`, fechar workers BullMQ e pool do Postgres; respeitar `drainingSeconds` |
| 6 | Pooling (PgBouncer em modo transaction) | Usar **somente** `set_config(..., true)` (SET LOCAL) dentro de transação; nunca `SET` de sessão; configurar driver compatível com prepared statements do PgBouncer ou desativá-los |
| 7 | Migrações | Só no `preDeployCommand` da `api`, role `migrator`, padrão expand/contract (a versão anterior continua funcionando) |
| 8 | Healthcheck | `/health` verifica DB e Redis com timeout curto; não chamar serviços externos (Clerk, gateway) no healthcheck |
| 9 | Domínios | Wildcard conta 1 slot; limite Pro de 20 por serviço — domínios de tenants **não** são cadastrados na Railway (§6) |
| 10 | Ambientes de PR | Banco novo e vazio → `seed-dev` no pre-deploy do ambiente `pr`; chaves da Clerk de **desenvolvimento** |
| 11 | Build de monorepo lento | `watchPatterns` por serviço + `turbo prune` + cache de camadas do Docker |
| 12 | Bucket privado | Upload/download só por URL pré-assinada; configurar CORS do bucket para os domínios dos painéis |

## 6. Domínios dos tenants (Cloudflare for SaaS → Railway)

- **Subdomínios** (`loja-x.<plataforma>`): wildcard `*.<plataforma>` no serviço `storefront`. Zero ação por tenant.
- **Domínio próprio** (`loja-x.com.br`): o tenant cria um CNAME para `customers.<plataforma>`; a plataforma registra o
  hostname no **Cloudflare for SaaS (Custom Hostnames)** via `DomainProvisioningPort` (adapter `domains-cloudflare`),
  que emite o certificado. O Cloudflare encaminha para a origem `edge-origin.<plataforma>` (cadastrada na Railway),
  através de um **Cloudflare Worker** que:
  1. define `X-Forwarded-Host: loja-x.com.br` e `X-Edge-Secret: <EDGE_SHARED_SECRET>`;
  2. reescreve o `Host` para `edge-origin.<plataforma>` (a Railway só roteia hosts cadastrados).
- O `TenantResolver` do storefront **só** aceita `X-Forwarded-Host` quando `X-Edge-Secret` confere; caso contrário usa o `Host`.
- ⚠️ Esse encadeamento precisa ser **validado cedo** (story spike **US-085**, marco 1.0), incluindo cookies de sessão do
  comprador, redirects absolutos, sitemap/canonical com o domínio do tenant e cache.

## 7. Ambientes e pipeline

| Ambiente | Origem | Banco | Clerk | Quando atualiza |
|---|---|---|---|---|
| local | sua máquina | docker-compose (mesmas roles) | instância dev | sempre |
| `pr` (efêmero) | cada Pull Request | novo e vazio + seed | instância dev | a cada push no PR |
| `staging` | branch `main` | persistente, dados fictícios | instância dev (ou "staging") | merge no `main`, após CI verde |
| `production` | branch `production` | persistente, PITR | instância **production** | PR `main → production` aprovado (release) |

- Ative **"Wait for CI"** nos serviços da Railway: o deploy só acontece com o GitHub Actions verde.
- GitHub Actions (US-008) roda lint, typecheck, fronteiras, testes (Testcontainers), build das imagens e a suíte de isolamento.
- Rollback: redeploy da versão anterior pelo dashboard ou `railway redeploy`; migrações expand/contract tornam isso seguro.

## 8. Backups e recuperação (produção)

- Habilitar **PITR** no Postgres e agendar backups de volume **diários e semanais**. Antes de migrações arriscadas,
  criar backup manual (`railway postgres pitr backup create --name pre-migration-<data>`).
- Restauração por PITR cria um **serviço Postgres novo**; runbook: restaurar → validar dados → apontar variáveis
  `DATABASE_URL*` para o novo serviço → redeploy → rodar o bootstrap de roles se necessário.
- Teste de restauração **trimestral** registrado em `docs/runbooks/restore.md` (RNF-DISP-02).
- Meilisearch é reconstruível a partir do banco (job de reindexação total) — backup de volume semanal basta.
- Bucket: habilitar versionamento/replicação se disponível; exports de tenants têm cópia fora da Railway (Fase 2).

## 9. Observabilidade
- Logs estruturados (pino, JSON) com `tenant.id` e `correlation_id` → aba de logs da Railway.
- Métricas de CPU/memória/rede da Railway + métricas de negócio expostas pela api.
- Traces via OpenTelemetry (a Railway oferece tracing com instrumentação para Node.js; alternativa: Grafana Cloud).
- Alertas (RNF-OBS-02): webhooks da Railway para falhas de deploy e crash; alertas de aplicação para outbox atrasada, DLQ e erros 5xx.

## 10. Claude Code + Railway
- Instale o plugin oficial: `/plugin install railway@claude-plugins-official` (skill `use-railway` + MCP hospedado).
- Instale e autentique a CLI (`railway login`) para o agente usar contexto local (`railway link`, `railway logs`, `railway variables`).
- **Regras para o agente:** nunca executar em `production` sem pedir confirmação explícita; nunca apagar serviço,
  volume, bucket ou ambiente; nunca imprimir valores de variáveis secretas no chat; mudanças de infraestrutura
  passam por PR como qualquer código.

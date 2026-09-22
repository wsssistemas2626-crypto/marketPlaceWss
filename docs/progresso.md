# Progresso do desenvolvimento

> Arquivo mantido pelo Claude Code. É a "memória" entre sessões: toda sessão começa lendo este arquivo
> e termina atualizando-o. Você (humano) pode editar a seção "Instruções do humano" a qualquer momento.

## Estado atual
- **Fase:** 0 — Fundação
- **Checkpoint atual:** C1
- **Branch de trabalho:** `fase-0/c1-monorepo`
- **Próxima story:** US-003 (shared kernel)
- **Última atualização:** 2026-09-22

## Checkpoints da Fase 0
| Checkpoint | Stories | Status | Branch / PR |
|---|---|---|---|
| C1 — Monorepo de pé | US-001, US-002, US-003 | 🚧 US-001 e US-002 feitas | `fase-0/c1-monorepo` |
| C2 — Tenancy, banco e eventos | US-070, US-004, US-071, US-005, US-072 | ⏳ | |
| C3 — Plataforma e Clerk | US-006, US-007, US-073, US-009, US-082 | ⏳ | |
| C4 — Console, isolamento e CI | US-075, US-074, US-008 | ⏳ | |
| C5 — Railway (staging + PR) | US-084 | ⏳ | |

## Concluído
- **US-001** — monorepo pnpm + Turborepo, `packages/config` (tsconfig/eslint/prettier), `packages/platform`
  (primitivas de health), apps `api`/`worker` (NestJS) e `storefront`/`admin`/`seller-center`/`console` (Next.js
  standalone), `docker-compose.yml` com postgres+roles, redis `noeviction`, meilisearch, mailpit e minio.
  Verificado: `pnpm install && docker compose up -d && pnpm dev` sobe os 6 serviços; `GET /health` da api
  responde 200 com status de DB e Redis e 503 quando o Redis cai.

- **US-002** — fronteiras do CLAUDE.md §4 verificadas por `pnpm lint:boundaries`: regras de import por camada
  em `packages/config/eslint/boundaries.js` + lista branca de dependências no package.json de cada módulo
  (`scripts/check-module-dependencies.mjs`). 12 testes sobre fixtures com violações propositais.

## Bloqueios e pendências
- `pnpm db:migrate`, `pnpm gen:openapi` e `pnpm gen:sdk` existem como tarefas do Turborepo mas ainda não têm
  implementação em nenhum pacote (chegam em US-004 e na Fase 1) — hoje passam sem executar nada.
- Dockerfiles e `apps/<app>/railway.json` ficaram fora da US-001 de propósito: são da US-084.
- Testes que dependam da injeção de dependência do Nest precisarão de um transformador com
  `emitDecoratorMetadata` (SWC) no Vitest — hoje os testes exercitam as classes diretamente.
- Checklist §A: proteção do branch `main`, branch `production` e webhooks da Clerk continuam pendentes com você.

## Decisões tomadas durante o desenvolvimento
- **ADR-015 (Proposto)**: fronteiras verificadas com regras nativas do ESLint em vez de `eslint-plugin-boundaries`.
  O plugin 7.2.0 não acusou `@nestjs/common` dentro de `domain/` e a API nova não está documentada offline.
  **Precisa da sua aprovação** (ou da escolha por dependency-cruiser).
- **pnpm 10.20.0** (não a 12.x): no Windows sem Developer Mode a 12.x falha ao criar symlinks
  (`os error 5`); a 10.x usa junctions e instala normalmente. Pinado em `packageManager`.
- **Dev dos apps Nest com `nest start --watch`** (tsc) em vez de `tsx`: o esbuild não emite
  `emitDecoratorMetadata` e a injeção de dependência do Nest quebra em runtime.
- **MinIO a partir da `quay.io`**: as imagens `minio/minio` e `minio/mc` saíram do Docker Hub.
- **Portas locais**: storefront 3000, admin 3001, seller-center 3002, console 3003, api 3100, worker 3101.
- `consistent-type-imports` desligado só no preset Node do ESLint (quebraria a DI do Nest).

## Instruções do humano
_(escreva aqui ajustes para a próxima sessão, ex.: "priorize X", "não use a lib Y")_

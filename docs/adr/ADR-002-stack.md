# ADR-002: Stack TypeScript — NestJS, Next.js, Drizzle, PostgreSQL, Redis/BullMQ

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
Precisamos de uma stack com ecossistema amplo de SDKs de provedores brasileiros, boa ergonomia para modularização,
tipagem forte ponta a ponta e alta produtividade com agentes de código.

## Decisão
- **TypeScript em todo o monorepo** (pnpm + Turborepo), permitindo contratos Zod compartilhados entre backend,
  frontends e SDK.
- **NestJS** no backend: módulos e DI nativos mapeiam diretamente para bounded contexts e troca de adapters.
- **Next.js** (App Router) para os três frontends; SSR/ISR no storefront para SEO.
- **PostgreSQL** como banco transacional único; **Drizzle ORM** (SQL explícito, suporte natural a múltiplos schemas,
  migrações por pacote).
- **Redis + BullMQ** para filas, jobs agendados, cache, idempotência e rate limit.

## Alternativas consideradas
| Critério | NestJS/TS | Java/Spring Modulith | .NET | Go |
|---|---|---|---|---|
| Modularização nativa | Boa (módulos + DI) | Excelente | Boa | Manual |
| Contratos compartilhados com front | Excelente (mesma linguagem) | Geração | Geração | Geração |
| SDKs de provedores BR | Excelente (Node é 1º cidadão) | Boa | Média | Média |
| Produtividade com agentes | Alta | Alta | Alta | Média |
| Performance bruta | Suficiente | Alta | Alta | Muito alta |

- **Prisma** em vez de Drizzle — descartado: suporte a múltiplos schemas e SQL fino (reserva atômica, ledger) menos direto.
- **MongoDB** — descartado: dados fortemente relacionais e financeiros exigem transações/constraints.

## Consequências
**Positivas:** uma linguagem; tipos do contrato até a UI; ecossistema amplo.
**Negativas:** Node tem menos performance em CPU pesado (imagens → jobs no worker/serviço externo); disciplina de
tipagem necessária (`strict`, sem `any`).

## Quando revisitar
Módulo com carga de CPU intensa (ex.: recomendação) → serviço separado em outra linguagem, integrado por eventos.

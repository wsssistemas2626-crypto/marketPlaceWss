# ADR-002 — Stack: monolito modular em TypeScript com NestJS e Nx

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
Muitos módulos interdependentes, desenvolvidos majoritariamente por agente autônomo (Claude Code)
em rodadas sem memória compartilhada. O maior risco arquitetural é a erosão silenciosa das
fronteiras entre módulos. Time pequeno, sem necessidade de escalar módulos de forma independente.

## Decisão
- **Estilo:** monolito modular (um deploy da API, um do worker, um do front).
- **Monorepo:** Nx + pnpm. Cada módulo é uma lib Nx com tags:
  - `type:app`, `type:module`, `type:module-api`, `type:platform`, `type:shared`, `type:web`
  - `scope:<nome-do-modulo>`
- **Regras de dependência** (`@nx/enforce-module-boundaries`):
  - `type:module` → `type:module-api`, `type:platform`, `type:shared` (e a própria `-api` do seu escopo)
  - `type:module-api` → `type:shared`
  - `type:platform` → `type:platform`, `type:shared`
  - `type:web` → `type:web` (mesmo escopo ou `scope:shared`), `type:shared`
  - `type:app` → qualquer um
- **Backend:** NestJS, TypeScript strict. **Frontend:** React + Vite.
- **Contratos:** schemas zod em `libs/shared/contracts`, compartilhados entre back e front.
- **Persistência:** PostgreSQL, Drizzle ORM, um schema Postgres por módulo, sem FK entre módulos.
- **Critério de pronto executável:** `pnpm check` = `nx run-many -t lint typecheck test`.

## Consequências
- (+) Uma linguagem de ponta a ponta; mudanças de contrato quebram o front na compilação.
- (+) Fronteiras verificadas no lint, dentro do `pnpm check` do autoloop.
- (+) Build e testes rápidos, rodadas do agente mais baratas.
- (−) Proteções que frameworks como Spring Modulith dão prontas precisam ser construídas na Fase 0
  (ver ADR-003 e ADR-005).
- (−) Um schema por módulo sem FK entre módulos exige consistência eventual em algumas referências.

## Alternativas descartadas
- **Java + Spring Modulith:** proteções prontas; descartado por preferência de linguagem única e familiaridade.
- **C#/.NET:** fronteiras por assembly; mesmo motivo.
- **Microsserviços:** complexidade operacional desproporcional ao time e ao estágio.

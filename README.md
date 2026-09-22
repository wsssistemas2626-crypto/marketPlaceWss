# Kit de Insumos — Marketplace Modular SaaS (multi-tenant)

Repositório: https://github.com/wsssistemas2626-crypto/marketPlaceWss

> **Comece por `GUIA-DE-INICIO.md`** — passo a passo completo de instalação, organização e uso com o Claude Code.

Este pacote contém tudo que o Claude Code precisa para desenvolver o marketplace de forma autônoma,
fase a fase. Copie o conteúdo para a raiz de um repositório vazio.

## Conteúdo

| Arquivo | Para quê |
|---|---|
| `docs/08-roteiro-desenvolvimento-autonomo.md` | **Roteiro para iniciar e conduzir o desenvolvimento autônomo** |
| `docs/progresso.md` | Memória entre sessões do Claude Code (estado, bloqueios, instruções) |
| `GUIA-DE-INICIO.md` | Passo a passo: instalar, organizar, configurar Clerk, enviar ao GitHub e desenvolver |
| `CLAUDE.md` | Regras do projeto lidas automaticamente pelo Claude Code |
| `.env.example` | Variáveis de ambiente (copiar para `.env`) |
| `.claude/settings.json` | Permissões pré-aprovadas e bloqueios do Claude Code |
| `docs/07-checklist-pre-desenvolvimento.md` | Contas, chaves e decisões necessárias antes de cada fase |
| `infra/db/` | Script de roles do Postgres (local e Railway) e modelo de schema/RLS |
| `docs/01-visao-produto.md` | Visão, benchmarks, atores, escopo por fase, glossário, suposições |
| `docs/02-requisitos-funcionais.md` | RFs numerados por módulo |
| `docs/03-requisitos-nao-funcionais.md` | RNFs mensuráveis |
| `docs/04-regras-de-negocio.md` | RNs (comissão, split, repasse, cancelamento, CDC...) |
| `docs/05-backlog.md` | Épicos e user stories com critérios de aceite Gherkin |
| `docs/06-plano-execucao.md` | Fases de construção com prompts prontos para o Claude Code |
| `docs/arquitetura/*` | C4, módulos, integrações, modelo de dados, fluxos, **multi-tenancy** |
| `docs/adr/*` | Decisões arquiteturais e seus trade-offs |
| `.claude/commands/*` | Comandos customizados (`/continuar`, `/implementar-story`, `/novo-modulo`, `/novo-adapter`, `/revisar-arquitetura`) |

## Como usar

1. `git init` e copie este kit para a raiz.
2. Revise `docs/01-visao-produto.md` → seção **Suposições** e **Decisões em aberto**. Ajuste o que não
   corresponder ao seu negócio *antes* de começar (principalmente D7–D10: cobrança SaaS, gateway por tenant,
   provisionamento e domínios).
3. Abra o Claude Code na raiz e rode a Fase 0 usando o prompt de `docs/06-plano-execucao.md`.
4. A partir da Fase 1, use `/implementar-story US-xxx` para cada story, na ordem do plano.
5. Ao final de cada fase, rode `/revisar-arquitetura` antes de avançar.

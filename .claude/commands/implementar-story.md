---
description: Implementa uma user story do backlog seguindo as regras do projeto
argument-hint: US-xxx
---
Implemente a story $ARGUMENTS.

1. Leia `CLAUDE.md` (se ainda não estiver no contexto) e localize $ARGUMENTS em `docs/05-backlog.md`.
2. Leia `docs/arquitetura/06-multi-tenancy.md` e todos os RF, RN e RNF referenciados (`docs/02..04`), a seção do(s) módulo(s) em
   `docs/arquitetura/02-modulos.md`, e os ADRs relevantes. Se a story tocar integrações, leia
   `docs/arquitetura/03-integracoes.md`; se tocar dados, `docs/arquitetura/04-modelo-de-dados.md`; se tocar deploy/infra, `docs/arquitetura/07-infraestrutura-railway.md`.
   Confira em `docs/07-checklist-pre-desenvolvimento.md` se as contas/chaves necessárias existem; se não, use o adapter fake e registre a pendência.
3. Se a story estiver marcada (G), proponha a quebra em stories menores e pare.
4. Apresente o PLANO e aguarde aprovação:
   - arquivos a criar/alterar por camada (domain, application, infrastructure, http, events, UI)
   - migrações Drizzle
   - eventos publicados/consumidos (e atualização do catálogo em `packages/contracts`)
   - endpoints e escopos/papéis exigidos
   - lista de testes: um por cenário Gherkin + invariantes de domínio + caso cross-tenant
   - tabelas novas com `tenant_id` + RLS (`enableTenantRls`) e chaves/índices prefixados por tenant
   - ⚠️ suposições e dúvidas
5. Após aprovação, crie a branch `feat/$ARGUMENTS-<slug>` e implemente de dentro para fora (domínio → aplicação →
   infraestrutura → HTTP → UI), escrevendo os testes junto.
6. Rode `pnpm lint && pnpm typecheck && pnpm test` (e `pnpm test:e2e` se houve mudança de fluxo de UI). Corrija até ficar verde
   sem desabilitar regras.
7. Atualize OpenAPI/contratos/docs se o contrato mudou, marque o checkbox da story no backlog e faça commit
   em Conventional Commits.
8. Resuma: o que foi feito, decisões tomadas, pendências e riscos.

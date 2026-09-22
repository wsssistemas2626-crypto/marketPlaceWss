---
description: Cria um novo módulo (bounded context) a partir do _template
argument-hint: nome-do-modulo
---
Crie o módulo `$ARGUMENTS`:
1. Confirme que ele está descrito em `docs/arquitetura/02-modulos.md`. Se não estiver, pare e proponha a seção
   (responsabilidade, agregados, facade, eventos, ports) + um ADR `Proposto` justificando o novo contexto.
2. Copie a estrutura de `packages/modules/_template` para `packages/modules/$ARGUMENTS`, renomeando pacote
   `@mkt/modules-$ARGUMENTS`, schema Postgres `$ARGUMENTS`, módulo Nest e testes.
3. Registre o módulo nos hosts `apps/api` e `apps/worker`, nas regras de fronteira do lint e no script de migração.
4. Garanta que o módulo consome `tenancy.tenant.created` (seeds, publica `$ARGUMENTS.tenant_seeded`) e
   `tenancy.tenant.deleted` (purge, publica `$ARGUMENTS.tenant_purged`), e que suas rotas entram na suíte de isolamento.
5. Remova o agregado fictício, deixe o `index.ts` exportando apenas a facade vazia e rode lint/typecheck/test.

# PROGRESS

## Status
EM_ANDAMENTO

## Instruções fixas
- Leia o `CLAUDE.md` antes de qualquer coisa.
- Execute apenas o PRIMEIRO item não marcado. Um item por rodada.
- Leia a story referenciada e os documentos que ela citar antes de codar.
- Só marque `[x]` depois que `pnpm verify` passar (até o F0-14 ele equivale a `pnpm check`; depois inclui E2E).
- Itens `GATE-*`: não escreva código; escreva `TAREFA_BLOQUEADA` no Status com o resumo da fase.
- Se o item precisar de variável de ambiente ausente (ex.: chaves do Clerk), escreva `TAREFA_BLOQUEADA` dizendo qual.
- Itens "(API)" entregam domínio + persistência + endpoints + testes. Itens "(UI)" entregam telas + testes de componente e E2E do fluxo principal, consumindo a API já pronta.

## Backlog

### Fase 0 — Fundação (`docs/backlog/fase-0-fundacao.md`)
- [ ] F0-01 — Scaffold do monorepo → fase-0#F0-01
- [ ] F0-02 — Estrutura de libs e fronteiras → fase-0#F0-02 · ADR-002
- [ ] F0-03 — Banco, roles e migrations → fase-0#F0-03 · ADR-001
- [ ] F0-04 — Shared kernel (Money, ids, erros, CPF/CNPJ) → fase-0#F0-04 · ADR-005
- [ ] F0-05 — Tenancy e isolamento RLS → fase-0#F0-05 · ADR-001
- [ ] F0-06 — Convenções da API e observabilidade → fase-0#F0-06
- [ ] F0-07 — Verificação de token do Clerk e resolução de tenant → fase-0#F0-07 · ADR-004 · dominio/platform.md
- [ ] F0-08 — Autorização RBAC → fase-0#F0-08 · ADR-004
- [ ] F0-09 — Auditoria → fase-0#F0-09 · dominio/platform.md
- [ ] F0-10 — Outbox e worker → fase-0#F0-10 · ADR-003
- [ ] F0-11 — Sincronização Clerk: webhooks e JIT → fase-0#F0-11 · ADR-004
- [ ] F0-12 — Front: autenticação e troca de organização (Clerk) → fase-0#F0-12
- [ ] F0-13 — Front: layout, menu por permissão, i18n, formatação → fase-0#F0-13
- [ ] F0-14 — Infraestrutura E2E e `pnpm verify` completo → fase-0#F0-14
- [ ] F0-15 — CI no GitHub Actions → fase-0#F0-15
- [ ] GATE-F0 — Revisão humana da Fase 0

### Fase 1 — Cadastros e núcleo de Projetos (`docs/backlog/fase-1-cadastros-projetos.md`)
- [ ] F1-01 — US-ORG-001 Empresas e filiais (API) · dominio/cadastros.md
- [ ] F1-02 — US-ORG-002 Centros de custo (API)
- [ ] F1-03 — US-ORG-001/002 Empresas e centros de custo (UI)
- [ ] F1-04 — US-PAR-001 Parceiros (API) · dominio/cadastros.md
- [ ] F1-05 — US-PAR-002 Colaboradores, custo/hora e PartnersQueryFacade (API)
- [ ] F1-06 — US-PAR-001/002 Parceiros e colaboradores (UI)
- [ ] F1-07 — US-PRJ-001 Criar projeto + workflow e quadro padrão (API) · dominio/projects.md · ADR-007
- [ ] F1-08 — US-PRJ-002 Ciclo de vida do projeto (API)
- [ ] F1-09 — US-PRJ-003 TAP (API)
- [ ] F1-10 — US-PRJ-004 Equipe e visibilidade (API)
- [ ] F1-11 — US-PRJ-001 a 004 Lista, criação, detalhe, TAP e equipe (UI)
- [ ] F1-12 — US-PRJ-005 Hierarquia de work items / EAP (API) · ADR-007
- [ ] F1-13 — US-PRJ-006 Backlog: rank, estimativa, DoR (API)
- [ ] F1-14 — US-PRJ-005/006 Árvore EAP e backlog (UI)
- [ ] F1-15 — US-PRJ-007 Planejar e iniciar sprint (API)
- [ ] F1-16 — US-PRJ-008 Encerrar sprint (API)
- [ ] F1-17 — US-PRJ-009 Quadro kanban e WIP (API)
- [ ] F1-18 — US-PRJ-007 a 009 Sprints e quadro (UI)
- [ ] F1-19 — US-PRJ-010 Apontar horas (API)
- [ ] F1-20 — US-PRJ-011 Enviar e aprovar folha + evento (API) · ADR-003
- [ ] F1-21 — US-PRJ-010/011 Timesheet e aprovação (UI)
- [ ] F1-22 — US-PRJ-012 Métricas (API)
- [ ] F1-23 — US-PRJ-012 Gráficos de burndown, velocidade e % concluído (UI)
- [ ] F1-24 — E2E do fluxo completo: criar projeto → TAP → equipe → backlog → sprint → quadro → horas → aprovação
- [ ] GATE-F1 — Revisão humana da Fase 1 (e detalhamento da Fase 2)

## Log de decisões
(uma entrada por rodada: data, item, o que foi feito, decisões menores, pendências)

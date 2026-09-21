# ADR-007 — Módulo de Projetos híbrido sobre modelo unificado de work items

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
O módulo deve contemplar PMI (preditivo), Scrum e Kanban. Implementar três modelos separados geraria
dados desconectados e impediria projetos híbridos, que são o caso mais comum na prática.

## Decisão
- Cada projeto tem `delivery_approach`: `PREDICTIVE`, `AGILE` ou `HYBRID`. A abordagem habilita
  recursos na UI; o modelo de dados é o mesmo.
- **Uma única hierarquia de `work_items`** com tipo discriminador:
  `PHASE`, `DELIVERABLE`, `WORK_PACKAGE`, `MILESTONE` (lado preditivo/EAP) e
  `EPIC`, `STORY`, `TASK`, `BUG` (lado ágil).
- Regras de parentesco:

  | Pai | Filhos permitidos |
  |---|---|
  | (raiz) | PHASE, DELIVERABLE, EPIC, MILESTONE |
  | PHASE | DELIVERABLE, WORK_PACKAGE, MILESTONE, EPIC |
  | DELIVERABLE | DELIVERABLE, WORK_PACKAGE, EPIC, MILESTONE |
  | WORK_PACKAGE | EPIC, STORY, TASK, BUG |
  | EPIC | STORY, BUG |
  | STORY | TASK |
  | BUG | TASK |
  | TASK, MILESTONE | — |

  Isso permite o caso híbrido: um pacote de trabalho da EAP é executado em sprints via histórias.
- Campos preditivos (datas planejadas, duração, dependências, % concluído, custo planejado) e
  ágeis (story points, rank, sprint, status no quadro) coexistem no work item; a UI mostra o que
  a abordagem pede.
- Status: cada projeto tem workflow de status configurável, e cada status pertence a uma
  categoria fixa (`TODO`, `IN_PROGRESS`, `DONE`). Métricas usam a categoria, nunca o nome do status.
- EVM unificado (Fase 2):
  - PV: baseline de cronograma + custo planejado distribuído no tempo.
  - EV: preditivo = % concluído × custo planejado do pacote; ágil = pontos concluídos / pontos totais do escopo baseline × BAC.
  - AC: horas aprovadas × custo/hora vigente do colaborador + despesas lançadas.

## Consequências
- (+) Um único backlog/EAP; relatórios de portfólio comparáveis entre projetos de abordagens diferentes.
- (+) Projetos podem migrar de abordagem sem perder dados.
- (−) A tabela `work_items` tem campos que nem todo tipo usa; validações por tipo ficam no domínio.

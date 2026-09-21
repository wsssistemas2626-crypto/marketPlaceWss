# 00 — Visão do Produto

## Problema

Empresas brasileiras que entregam projetos usam hoje um ERP para a parte administrativa
(financeiro, vendas, compras) e uma ferramenta separada para gestão de projetos (Jira, MS Project,
planilhas). O resultado é retrabalho, custo de projeto calculado manualmente, faturamento
desconectado das entregas e nenhuma visão real de margem por projeto.

## Proposta

Um ERP modular, SaaS multi-tenant, em que o **módulo de Projetos é nativo e integrado**
aos módulos administrativos. Cada projeto pode ser conduzido de forma **preditiva (PMI)**,
**ágil (Scrum/Kanban)** ou **híbrida**, sobre uma mesma base de dados, e alimenta automaticamente
custos, faturamento e financeiro.

## Público-alvo

Multi-segmento, com foco inicial de valor em empresas que vendem projetos e serviços
(TI, consultoria, engenharia, agências). Os módulos tradicionais atendem qualquer segmento
de forma genérica e configurável.

## Atores

| Ator | Descrição |
|---|---|
| Administrador do tenant | Configura empresa, usuários, perfis, módulos ativos |
| Gestor de portfólio | Acompanha vários projetos, prioriza, vê indicadores consolidados |
| Gerente de projetos (GP) | Planeja e controla projetos preditivos/híbridos, aprova horas |
| Product Owner (PO) | Mantém e prioriza o backlog |
| Scrum Master / Agile coach | Conduz cerimônias, acompanha métricas do time |
| Membro de equipe | Executa itens, move cards, aponta horas |
| Analista financeiro | Contas a pagar/receber, fluxo de caixa |
| Comercial | Orçamentos, contratos, faturamento |
| Comprador / Almoxarife | Compras e estoque |
| Leitor / Stakeholder | Consulta painéis e relatórios |
| Operador da plataforma (nós) | Cria tenants, suporte, monitoramento. Não acessa dados de negócio sem autorização registrada |

## Escopo por fase

| Fase | Conteúdo | Resultado de negócio |
|---|---|---|
| 0 — Fundação | Monorepo, fronteiras, multi-tenancy/RLS, autenticação, RBAC, auditoria, outbox, shell do front | Base segura para todos os módulos |
| 1 — Cadastros + núcleo de Projetos | Empresas, centros de custo, parceiros, colaboradores; projeto com TAP, equipe, EAP/backlog unificado, sprints, kanban, timesheet, métricas básicas | Time já gerencia projetos no sistema |
| 2 — Financeiro básico + Projetos avançado | Contas a pagar/receber, fluxo de caixa; cronograma com dependências, baseline, riscos, issues, mudanças, EVM, portfólio, stakeholders, retrospectivas, lições aprendidas | Custo e margem real por projeto |
| 3 — Vendas + Fiscal | Orçamentos, contratos, faturamento por marco/medição/T&M, NFS-e (e NF-e) via emissor terceiro | Ciclo contrato → projeto → faturamento → nota |
| 4 — Compras + Estoque | Requisição, cotação, pedido, recebimento, movimentações, inventário | Ciclo de suprimentos |

## Fora de escopo (MVP)

- **Folha de pagamento / eSocial**: integrar com sistema especializado (futuro ADR).
- **Contabilidade completa / SPED contábil**: futuro; o financeiro exporta lançamentos.
- **Emissão fiscal própria**: sempre via emissor terceiro (ADR-006).
- Aplicativo mobile nativo (a web é responsiva).
- Funcionamento offline.
- Customização por código específica de cliente (customização é por configuração).

## Riscos do produto

| Risco | Mitigação |
|---|---|
| Escopo multi-segmento vira "faz tudo mal" | Núcleo genérico + configuração (parâmetros, campos customizados, ativação de módulos); especializações só como módulos opcionais |
| Complexidade fiscal/reforma tributária | Fiscal isolado atrás de adapter e provedor terceiro |
| Erosão da arquitetura no desenvolvimento autônomo | Regras inegociáveis no CLAUDE.md verificadas por lint/testes no `pnpm check`; gate humano a cada fase |
| Vazamento de dados entre tenants | RLS no banco + testes de isolamento obrigatórios |

## Métricas de sucesso do MVP (sugeridas)

- Um projeto pode ser planejado, executado (sprints/kanban) e ter horas aprovadas sem ferramenta externa.
- Custo realizado do projeto calculado automaticamente a partir das horas aprovadas (Fase 2).
- Zero incidentes de vazamento entre tenants nos testes de isolamento.

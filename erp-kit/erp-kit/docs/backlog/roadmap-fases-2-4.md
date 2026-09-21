# Roadmap — Fases 2 a 4 (nível de épico)

Estes épicos serão detalhados em user stories com Gherkin somente ao final da fase anterior
(planejamento em ondas sucessivas, *rolling wave planning*). Detalhar agora geraria retrabalho,
porque as fases 0 e 1 vão revelar ajustes no modelo.

**Instrução ao agente:** não implemente nada deste arquivo. Ele existe para você entender o
destino do sistema e não tomar decisões que o inviabilizem.

## Fase 2 — Financeiro básico e Projetos avançado

| Épico | Conteúdo |
|---|---|
| EP-FIN-01 Contas e caixa | Contas bancárias/caixa, saldos, transferências |
| EP-FIN-02 Contas a pagar | Títulos, parcelas, baixas, juros/multa/desconto |
| EP-FIN-03 Contas a receber | Idem, com vínculo a cliente e projeto |
| EP-FIN-04 Fluxo de caixa | Realizado e projetado, por empresa e centro de custo |
| EP-FIN-05 Conciliação | Importação OFX e conciliação manual |
| EP-PRJ-10 Cronograma | Dependências FS/SS/FF/SF, caminho crítico, visualização Gantt |
| EP-PRJ-11 Baseline e mudanças | Baselines versionadas; controle integrado de mudanças (change requests) |
| EP-PRJ-12 Riscos e issues | Registro de riscos (probabilidade × impacto, matriz), respostas, issues/impedimentos |
| EP-PRJ-13 Custos e EVM | Custo reconhecido de horas aprovadas (consome `projects.timesheet-entry.approved.v1`), despesas, PV/EV/AC, CPI/SPI, EAC/ETC/VAC; evento para o financeiro |
| EP-PRJ-14 Portfólio | Painel de portfólio, priorização, saúde dos projetos |
| EP-PRJ-15 Stakeholders e comunicação | Registro de partes interessadas, matriz poder × interesse, plano de comunicação |
| EP-PRJ-16 Melhoria contínua | Retrospectivas, lições aprendidas pesquisáveis, encerramento formal |
| EP-PRJ-17 Métricas de fluxo | CFD, cycle/lead time, throughput, burnup de release |
| EP-PLT-01 Campos customizados | Campos adicionais configuráveis por tenant e entidade |
| EP-PLT-02 MFA e LGPD | Exigir segundo fator (Clerk) para administradores; exportação e anonimização de dados pessoais |

## Fase 3 — Vendas, contratos e fiscal

| Épico | Conteúdo |
|---|---|
| EP-CAT-01 Catálogo | Produtos e serviços, códigos de serviço (LC 116) e NCM |
| EP-SAL-01 Orçamentos | Propostas com versões e aprovação |
| EP-SAL-02 Contratos | Contrato com modelo de faturamento: preço fixo por marco, T&M (horas aprovadas × taxa), recorrente; `sales.contract.signed` cria projeto |
| EP-SAL-03 Faturamento | Geração de faturas por marco aceito, medição ou horas; `sales.invoice.issued` |
| EP-FIS-01 Adapter fiscal | ADR-006: provedor definido em novo ADR; NFS-e primeiro, NF-e depois |
| EP-PLT-03 SSO corporativo | SAML/OIDC por tenant via Clerk (verificar plano) |
| EP-FIS-02 Tributação | Parametrização de impostos por regime; preparação para IBS/CBS |

## Fase 4 — Compras e estoque

| Épico | Conteúdo |
|---|---|
| EP-PUR-01 Requisições | Requisição de compra, inclusive vinculada a projeto |
| EP-PUR-02 Cotações e pedidos | Cotação com fornecedores, pedido, aprovação por alçada |
| EP-PUR-03 Recebimento | Conferência, entrada, título a pagar |
| EP-INV-01 Estoque | Locais, saldos, movimentações, custo médio |
| EP-INV-02 Inventário | Contagem, ajustes, auditoria |

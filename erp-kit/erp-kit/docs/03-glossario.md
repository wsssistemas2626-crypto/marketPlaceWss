# 03 — Glossário (linguagem ubíqua) PT → EN

Use EXATAMENTE os termos em inglês desta tabela no código. Se precisar de um termo novo,
adicione-o aqui na mesma rodada e registre no log.

| Português (UI/docs) | Inglês (código) | Definição |
|---|---|---|
| Tenant / Cliente do SaaS | tenant | Organização assinante; unidade de isolamento de dados. Corresponde a uma *Organization* do Clerk |
| Provedor de identidade | identity provider | Serviço externo de autenticação (Clerk), acessado só via interface `IdentityProvider` |
| Usuário | user | Pessoa com login; pode pertencer a vários tenants |
| Vínculo | membership | Relação usuário ↔ tenant, com papéis. Corresponde a uma *OrganizationMembership* do Clerk |
| Papel / Perfil | role | Conjunto de permissões dentro de um tenant |
| Permissão | permission | Ação autorizável (`modulo.recurso.acao`) |
| Empresa | company | Pessoa jurídica do tenant (CNPJ) |
| Filial | branch | Estabelecimento da empresa |
| Centro de custo | cost center | Unidade de apropriação de custos |
| Parceiro | partner | Pessoa física/jurídica com a qual o tenant se relaciona |
| Colaborador | employee | Papel de parceiro que trabalha para o tenant |
| Custo/hora | cost rate | Custo por hora de um colaborador com vigência |
| Portfólio | portfolio | Agrupamento de projetos/programas para gestão |
| Programa | program | Grupo de projetos relacionados |
| Projeto | project | Esforço temporário com objetivo definido |
| Abordagem | delivery approach | PREDICTIVE, AGILE ou HYBRID |
| Termo de Abertura (TAP) | project charter | Documento que autoriza formalmente o projeto |
| Gerente de projetos | project manager | Responsável pelo projeto |
| Equipe do projeto | project team / team member | Pessoas alocadas ao projeto |
| Alocação | allocation | Percentual de dedicação de um membro |
| Item de trabalho | work item | Nó da hierarquia unificada EAP/backlog |
| EAP | WBS (work breakdown structure) | Decomposição hierárquica do escopo |
| Fase | phase | Tipo de work item de agrupamento temporal |
| Entrega | deliverable | Tipo de work item: produto/resultado verificável |
| Pacote de trabalho | work package | Menor nível da EAP preditiva |
| Épico | epic | Item ágil grande, decomposto em histórias |
| História | story | Item de backlog com valor para o usuário |
| Tarefa | task | Unidade de trabalho técnico |
| Defeito | bug | Item de correção |
| Marco | milestone | Evento de duração zero no cronograma |
| Backlog do produto | product backlog | Lista ordenada de itens ágeis do projeto |
| Ordem / prioridade no backlog | rank | Posição ordinal no backlog |
| Pontos de história | story points | Estimativa relativa |
| Definição de Pronto | definition of done (DoD) | Critérios para item concluído |
| Definição de Preparado | definition of ready (DoR) | Critérios para item entrar em sprint |
| Sprint | sprint | Iteração de duração fixa |
| Meta da sprint | sprint goal | Objetivo da sprint |
| Capacidade | capacity | Horas/pontos disponíveis na sprint |
| Quadro | board | Quadro kanban do projeto |
| Coluna | board column | Coluna do quadro, mapeada para uma categoria de status |
| Categoria de status | status category | TODO, IN_PROGRESS, DONE |
| Limite WIP | WIP limit | Máximo de itens simultâneos numa coluna |
| Velocidade | velocity | Pontos concluídos por sprint |
| Burndown / Burnup | burndown / burnup | Gráficos de trabalho restante / concluído |
| Apontamento de horas | timesheet entry | Registro de horas trabalhadas |
| Folha de horas | timesheet | Conjunto semanal de apontamentos de um colaborador |
| Linha de base | baseline | Versão aprovada de escopo/prazo/custo |
| Risco | risk | Evento incerto que afeta objetivos |
| Questão / Impedimento | issue | Problema ocorrendo agora |
| Solicitação de mudança | change request | Pedido formal de alteração de baseline |
| Parte interessada | stakeholder | Pessoa/grupo afetado pelo projeto |
| Lição aprendida | lesson learned | Conhecimento registrado para projetos futuros |
| Retrospectiva | retrospective | Cerimônia de melhoria do time |
| Orçamento no término | BAC (budget at completion) | Orçamento total aprovado |
| Valor planejado / agregado / custo real | PV / EV / AC | Grandezas de EVM |
| Título a receber / pagar | receivable / payable | Obrigações financeiras |
| Contrato | contract | Acordo comercial com cliente |
| Nota fiscal | fiscal document | NF-e, NFS-e etc. |

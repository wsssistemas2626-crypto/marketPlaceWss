# Fase 1 — Cadastros e núcleo de Projetos

Objetivo: um time consegue criar um projeto, planejar escopo (EAP e/ou backlog), executar em sprints
com quadro kanban e apontar horas aprovadas, sem ferramenta externa.

Modelos de dados: `docs/dominio/cadastros.md` e `docs/dominio/projects.md`.
Todas as stories herdam os RNFs de segurança (RNF010–RNF013), auditoria (RNF030) e usabilidade (RNF060–RNF062).
Cada story com tabelas novas inclui teste de isolamento entre tenants (não repetido nos cenários abaixo).

---

# Cadastros

## US-ORG-001 — Cadastrar empresas e filiais

**Como** administrador do tenant **eu quero** cadastrar as empresas e filiais do grupo **para que** projetos e
lançamentos sejam associados à pessoa jurídica correta.

```gherkin
Cenário: cadastro de empresa válida
  Dado que sou administrador
  Quando cadastro a empresa com razão social, CNPJ "11.222.333/0001-81" e regime "Simples Nacional"
  Então a empresa é criada com o CNPJ normalizado para "11222333000181"

Cenário: CNPJ inválido
  Quando cadastro uma empresa com CNPJ "11.222.333/0001-80"
  Então recebo erro "ORG_INVALID_CNPJ"

Cenário: CNPJ duplicado no tenant
  Dado uma empresa com CNPJ "11222333000181"
  Quando cadastro outra com o mesmo CNPJ
  Então recebo erro "ORG_DUPLICATE_CNPJ"

Cenário: filial com raiz de CNPJ diferente
  Dado a empresa com CNPJ "11222333000181"
  Quando cadastro uma filial com CNPJ de outra raiz
  Então recebo erro "ORG_BRANCH_ROOT_MISMATCH"

Cenário: arquivar empresa
  Quando arquivo uma empresa
  Então ela não aparece nas listagens padrão, mas continua consultável com filtro "incluir arquivadas"
```

**Permissões:** `organization.company.read|create|update|archive`.
**Fora de escopo:** consulta automática de CNPJ na Receita; busca de CEP (Fase 2).

## US-ORG-002 — Cadastrar centros de custo

**Como** administrador **eu quero** manter uma hierarquia de centros de custo **para que** custos sejam apropriados corretamente.

```gherkin
Cenário: criar centro de custo filho
  Dado o centro "01 - Operações"
  Quando crio "01.02 - Projetos" com pai "01 - Operações"
  Então ele aparece como filho na árvore

Cenário: código duplicado
  Quando crio um centro com código já existente no tenant
  Então recebo erro "ORG_DUPLICATE_COST_CENTER_CODE"

Cenário: arquivar centro com filhos ativos
  Dado um centro com filho ativo
  Quando tento arquivá-lo
  Então recebo erro "ORG_COST_CENTER_HAS_ACTIVE_CHILDREN"
```

**Permissões:** `organization.cost-center.read|create|update|archive`.

## US-PAR-001 — Cadastrar parceiros

**Como** usuário administrativo **eu quero** cadastrar pessoas físicas e jurídicas com um ou mais papéis
(cliente, fornecedor, colaborador) **para que** o mesmo parceiro não seja duplicado entre módulos.

```gherkin
Cenário: parceiro PJ cliente e fornecedor
  Quando cadastro uma PJ com CNPJ válido e papéis "Cliente" e "Fornecedor"
  Então o parceiro é criado com os dois papéis

Cenário: documento incompatível com o tipo
  Quando cadastro uma PF informando um CNPJ
  Então recebo erro "PARTNER_DOCUMENT_KIND_MISMATCH"

Cenário: parceiro sem papel
  Quando cadastro um parceiro sem nenhum papel
  Então recebo erro "PARTNER_ROLE_REQUIRED"

Cenário: busca
  Dado parceiros cadastrados
  Quando busco por parte do nome ou do documento
  Então recebo a lista paginada filtrada, com documento de PF mascarado para quem não tem "partners.partner.read-pii"
```

**Permissões:** `partners.partner.read|read-pii|create|update|archive`.
**Fora de escopo:** contatos múltiplos, dados bancários (Fase 2).

## US-PAR-002 — Colaboradores e custo/hora

**Como** administrador **eu quero** registrar colaboradores com custo/hora por vigência **para que** o custo das
horas de projeto seja calculado corretamente.

```gherkin
Cenário: tornar parceiro PF um colaborador
  Dado um parceiro PF
  Quando adiciono o papel "Colaborador" com cargo, centro de custo e data de admissão
  Então o registro de colaborador é criado

Cenário: colaborador PJ
  Quando tento adicionar o papel "Colaborador" a uma PJ
  Então recebo erro "PARTNER_EMPLOYEE_MUST_BE_INDIVIDUAL"

Cenário: vincular usuário
  Dado um colaborador e um usuário ativo no tenant
  Quando vinculo o usuário ao colaborador
  Então o usuário passa a apontar horas como esse colaborador
  E um usuário não pode estar vinculado a dois colaboradores

Cenário: custo vigente por data
  Dado custo R$ 80,00 a partir de 01/01/2026 e R$ 95,00 a partir de 01/07/2026
  Quando consulto o custo vigente em 15/07/2026
  Então recebo "95.0000"
  E em 30/06/2026 recebo "80.0000"

Cenário: vigência duplicada
  Quando cadastro outro custo com a mesma data de início
  Então recebo erro "PARTNER_COST_RATE_OVERLAP"

Cenário: custo é dado sensível
  Dado um usuário sem "partners.cost-rate.read"
  Quando consulta o colaborador
  Então os custos/hora não são retornados
```

**Contrato público:** `PartnersQueryFacade.getEmployeeCostRate`, `getEmployeeByUserId`, `isCustomer(partnerId)` em `partners-api`.

---

# Projetos

## US-PRJ-001 — Criar projeto

**Como** gerente de projetos **eu quero** criar um projeto escolhendo a abordagem de entrega **para que** ele seja
conduzido de forma preditiva, ágil ou híbrida.

```gherkin
Cenário: criar projeto ágil
  Quando crio o projeto "Portal do Cliente" com abordagem "Ágil", sprint de 14 dias, empresa executora e datas planejadas
  Então o projeto é criado com status "Proposto" e código gerado "PRJ-0001"
  E eu sou incluído na equipe como gerente de projetos
  E o workflow padrão de status e o quadro padrão são criados

Cenário: projeto ágil sem duração de sprint
  Quando crio um projeto com abordagem "Ágil" sem duração de sprint
  Então recebo erro "PROJECT_SPRINT_LENGTH_REQUIRED"

Cenário: datas inválidas
  Quando informo término planejado anterior ao início
  Então recebo erro "PROJECT_INVALID_DATE_RANGE"

Cenário: cliente que não é cliente
  Quando informo um parceiro sem o papel "Cliente"
  Então recebo erro "PROJECT_PARTNER_NOT_CUSTOMER"
```

**Permissões:** `projects.project.create`. **Evento:** `projects.project.created.v1`.

## US-PRJ-002 — Ciclo de vida do projeto

**Como** gerente de projetos **eu quero** transicionar o projeto entre fases do ciclo de vida **para que** o status
reflita a realidade e as regras de cada fase sejam aplicadas.

```gherkin
Cenário: iniciar execução
  Dado um projeto em "Em planejamento"
  Quando inicio a execução
  Então o status vira "Em execução" e actual_start recebe a data de hoje

Cenário: projeto ágil sem PO
  Dado um projeto ágil em planejamento sem Product Owner na equipe
  Quando tento iniciar a execução
  Então recebo erro "PROJECT_PRODUCT_OWNER_REQUIRED"

Cenário: suspender exige motivo
  Quando suspendo um projeto em execução sem informar motivo
  Então recebo erro "PROJECT_HOLD_REASON_REQUIRED"

Cenário: transição inválida
  Dado um projeto "Proposto"
  Quando tento encerrá-lo
  Então recebo erro "PROJECT_INVALID_TRANSITION"

Cenário: encerrar com sprint ativa
  Dado um projeto com sprint ativa
  Quando tento encerrá-lo
  Então recebo erro "PROJECT_HAS_ACTIVE_SPRINT"

Cenário: projeto encerrado é somente leitura
  Dado um projeto encerrado
  Quando tento alterar qualquer dado ou work item
  Então recebo erro "PROJECT_READ_ONLY"
```

**Permissões:** `projects.project.transition`. **Eventos:** `projects.project.status-changed.v1`.

## US-PRJ-003 — Termo de Abertura do Projeto (TAP)

**Como** gerente de projetos **eu quero** registrar e aprovar o TAP **para que** o projeto seja formalmente autorizado (PMI).

```gherkin
Cenário: aprovar TAP completo
  Dado um projeto "Proposto" com TAP contendo objetivo, justificativa, escopo macro e critérios de sucesso
  Quando aprovo o TAP
  Então o TAP registra quem aprovou e quando, fica somente leitura
  E o projeto passa para "Em planejamento"

Cenário: TAP incompleto
  Dado um TAP sem critérios de sucesso
  Quando tento aprová-lo
  Então recebo erro "CHARTER_INCOMPLETE" listando os campos faltantes

Cenário: editar TAP aprovado
  Dado um TAP aprovado
  Quando tento editá-lo
  Então recebo erro "CHARTER_LOCKED"
```

**Permissões:** `projects.charter.update`, `projects.charter.approve`.

## US-PRJ-004 — Equipe do projeto

**Como** gerente de projetos **eu quero** montar a equipe com papéis e alocação **para que** as pessoas certas
acessem o projeto e possam ser responsáveis por itens e apontar horas.

```gherkin
Cenário: adicionar membro
  Quando adiciono um usuário ativo com papel "Membro da equipe" e alocação de 50%
  Então ele passa a ver o projeto e pode ser responsável por work items

Cenário: alocação inválida
  Quando informo alocação 0% ou acima de 100%
  Então recebo erro "TEAM_INVALID_ALLOCATION"

Cenário: visibilidade restrita
  Dado um usuário que não é membro do projeto e não tem "projects.project.read-all"
  Quando lista os projetos
  Então o projeto não aparece
  E acessar o projeto diretamente retorna 404

Cenário: remover membro com itens atribuídos
  Dado um membro responsável por itens abertos
  Quando o removo da equipe
  Então os itens abertos ficam sem responsável e a remoção é registrada em auditoria
```

**Permissões:** `projects.team.manage`.

## US-PRJ-005 — EAP e hierarquia de work items

**Como** gerente de projetos / PO **eu quero** decompor o escopo em uma hierarquia única de itens
**para que** eu use EAP (preditivo), épicos e histórias (ágil) ou ambos no mesmo projeto.

```gherkin
Cenário: decomposição híbrida
  Dado um projeto híbrido
  Quando crio a entrega "Módulo de login", o pacote de trabalho "Autenticação" sob ela e a história "Login com e-mail" sob o pacote
  Então a árvore exibe a hierarquia com códigos EAP "1" e "1.1" para entrega e pacote
  E cada item recebe chave sequencial, ex.: "PRJ-0001-3"

Cenário: parentesco inválido
  Quando tento criar uma "Fase" abaixo de uma "História"
  Então recebo erro "WORK_ITEM_INVALID_PARENT"

Cenário: mover subárvore
  Quando movo a entrega "1.1" para baixo da entrega "2"
  Então ela e seus descendentes são movidos e os códigos EAP são recalculados

Cenário: ciclo
  Quando tento mover um item para baixo de um de seus descendentes
  Então recebo erro "WORK_ITEM_CYCLE"

Cenário: excluir item com horas
  Dado um item com apontamentos de horas
  Quando tento excluí-lo
  Então recebo erro "WORK_ITEM_HAS_TIME_ENTRIES" e sou orientado a arquivá-lo

Cenário: story points só em tipos ágeis
  Quando informo story points num pacote de trabalho
  Então recebo erro "WORK_ITEM_POINTS_NOT_ALLOWED"
```

**Permissões:** `projects.work-item.create|update|move|archive|delete`.

## US-PRJ-006 — Backlog do produto

**Como** Product Owner **eu quero** ordenar, estimar e preparar itens do backlog **para que** o time planeje sprints
com os itens mais valiosos e prontos.

```gherkin
Cenário: reordenar backlog
  Dado o backlog com itens A, B, C nessa ordem
  Quando arrasto C para o topo
  Então a ordem passa a ser C, A, B e é persistida sem reescrever o rank de todos os itens

Cenário: estimativa fora da escala
  Quando estimo uma história com 4 pontos
  Então recebo erro "WORK_ITEM_INVALID_POINTS"

Cenário: Definição de Preparado
  Dado a DoR do projeto com 3 critérios
  Quando marco os 3 critérios numa história
  Então ela é exibida como "Pronta para sprint"

Cenário: filtros
  Quando filtro o backlog por tipo, responsável, épico ou texto
  Então vejo apenas os itens correspondentes, mantendo a ordem do backlog
```

**Permissões:** `projects.backlog.manage`.

## US-PRJ-007 — Planejar e iniciar sprint

**Como** Scrum Master / PO **eu quero** planejar a sprint com meta e capacidade **para que** o time se comprometa
com um escopo realista.

```gherkin
Cenário: planejar sprint
  Dado um projeto ágil em execução
  Quando crio a próxima sprint
  Então ela recebe o nome "Sprint N" e datas conforme a duração padrão do projeto

Cenário: acompanhamento de capacidade
  Dado uma sprint com capacidade de 20 pontos
  Quando adiciono itens totalizando 23 pontos
  Então vejo o alerta de que o compromisso excede a capacidade em 3 pontos, sem bloqueio

Cenário: iniciar sem meta
  Quando inicio uma sprint sem meta
  Então recebo erro "SPRINT_GOAL_REQUIRED"

Cenário: duas sprints ativas
  Dado uma sprint ativa no projeto
  Quando tento iniciar outra
  Então recebo erro "SPRINT_ALREADY_ACTIVE"

Cenário: snapshot do compromisso
  Quando inicio a sprint com 18 pontos
  Então committed_points é 18
  E itens adicionados ou removidos depois ficam registrados como mudança de escopo

Cenário: item não preparado
  Quando adiciono à sprint uma história que não atende à DoR
  Então vejo um alerta, e a inclusão é permitida
```

**Permissões:** `projects.sprint.manage`. **Eventos:** `projects.sprint.started.v1`.

## US-PRJ-008 — Encerrar sprint

```gherkin
Cenário: encerrar com itens pendentes
  Dado uma sprint ativa com 2 itens não concluídos
  Quando encerro a sprint escolhendo "mover para a próxima sprint"
  Então os 2 itens vão para a próxima sprint planejada (criada se não existir)
  E completed_points registra os pontos concluídos
  E a sprint fica somente leitura

Cenário: encerrar devolvendo ao backlog
  Quando encerro escolhendo "devolver ao backlog"
  Então os itens pendentes ficam sem sprint, no topo do backlog, na ordem que estavam

Cenário: tarefas de história concluída
  Dado uma história concluída com uma tarefa ainda aberta
  Quando encerro a sprint
  Então vejo um alerta listando a inconsistência antes de confirmar
```

**Eventos:** `projects.sprint.closed.v1`.

## US-PRJ-009 — Quadro kanban

**Como** membro da equipe **eu quero** mover itens no quadro **para que** o fluxo de trabalho fique visível e limitado por WIP.

```gherkin
Cenário: mover card
  Dado o quadro da sprint ativa
  Quando movo um item de "A fazer" para "Em andamento"
  Então o status muda, o histórico de status é registrado e a tela atualiza imediatamente

Cenário: WIP com política de aviso
  Dado a coluna "Em andamento" com limite 3 e política "avisar", já com 3 itens
  Quando movo um 4º item para ela
  Então a movimentação ocorre e a coluna é destacada como acima do limite

Cenário: WIP com política de bloqueio
  Dado a coluna com limite 3 e política "bloquear", já com 3 itens
  Quando movo um 4º item para ela
  Então recebo erro "BOARD_WIP_LIMIT_REACHED" e o card volta à origem

Cenário: concluir define data de conclusão
  Quando movo um item para uma coluna de categoria "Concluído"
  Então completed_at é preenchido
  E ao reabri-lo completed_at é limpo

Cenário: quadro kanban contínuo
  Dado um projeto que não usa sprints
  Quando abro o quadro
  Então vejo todos os itens executáveis não arquivados, sem filtro de sprint

Cenário: configurar colunas
  Quando o GP cria, renomeia, reordena colunas e mapeia status para elas
  Então todo status do workflow está mapeado para exatamente uma coluna
```

**Permissões:** `projects.board.move` (membros), `projects.board.configure` (GP/SM).

## US-PRJ-010 — Apontar horas

**Como** colaborador **eu quero** registrar minhas horas por projeto e item **para que** o custo e o esforço reais
sejam conhecidos.

```gherkin
Cenário: apontamento válido
  Dado que sou membro de um projeto em execução e estou vinculado a um colaborador
  Quando aponto 2,5 horas em 10/09/2026 no item "PRJ-0001-7"
  Então o apontamento é criado como rascunho na minha folha da semana de 07/09/2026

Cenário: limite diário
  Dado 22 horas apontadas em 10/09/2026
  Quando aponto mais 3 horas no mesmo dia
  Então recebo erro "TIMESHEET_DAILY_LIMIT_EXCEEDED"

Cenário: data futura
  Quando aponto horas para amanhã
  Então recebo erro "TIMESHEET_FUTURE_DATE"

Cenário: fração inválida
  Quando aponto 1,1 hora
  Então recebo erro "TIMESHEET_INVALID_FRACTION" (múltiplos de 0,25)

Cenário: projeto fora de execução
  Dado um projeto suspenso
  Quando tento apontar horas nele
  Então recebo erro "TIMESHEET_PROJECT_NOT_EXECUTING"

Cenário: usuário sem colaborador
  Dado um usuário não vinculado a colaborador
  Quando tenta apontar horas
  Então recebo erro "TIMESHEET_USER_NOT_EMPLOYEE"
```

**Permissões:** `projects.timesheet.own`.

## US-PRJ-011 — Enviar e aprovar folha de horas

**Como** gerente de projetos **eu quero** aprovar ou rejeitar as horas apontadas no meu projeto **para que** apenas
horas validadas gerem custo.

```gherkin
Cenário: enviar folha
  Dado minha folha da semana com apontamentos em rascunho
  Quando a envio
  Então ela e os apontamentos ficam "Enviados" e não podem mais ser editados por mim

Cenário: aprovação por projeto
  Dado uma folha enviada com horas nos projetos X e Y
  Quando o GP de X aprova as horas de X
  Então só as entradas de X ficam aprovadas
  E a folha fica "Aprovada" apenas quando as de Y também forem aprovadas

Cenário: evento de horas aprovadas
  Quando uma entrada é aprovada
  Então o evento "projects.timesheet-entry.approved.v1" é gravado na outbox na mesma transação

Cenário: rejeição com motivo
  Quando o GP rejeita entradas sem motivo
  Então recebo erro "TIMESHEET_REJECTION_REASON_REQUIRED"
  E com motivo, as entradas voltam a ser editáveis pelo colaborador e ele é notificado

Cenário: aprovar horas de outro projeto
  Quando um GP tenta aprovar entradas de projeto que não gerencia
  Então recebo 403 com code "AUTH_FORBIDDEN"

Cenário: autoaprovação
  Quando um GP tenta aprovar as próprias horas
  Então recebo erro "TIMESHEET_SELF_APPROVAL" (salvo permissão "projects.timesheet.self-approve")
```

**Permissões:** `projects.timesheet.approve`.

## US-PRJ-012 — Métricas básicas do projeto

**Como** GP / Scrum Master **eu quero** ver burndown, velocidade e % concluído **para que** eu acompanhe o progresso
com dados. Definições canônicas: seção "Métricas" de `docs/dominio/projects.md`.

```gherkin
Cenário: burndown com mudança de escopo
  Dado uma sprint de 10 dias iniciada com 30 pontos
  E no dia 3 foram concluídos 5 pontos e adicionada uma história de 3 pontos
  Quando consulto o burndown
  Então o dia 3 mostra 28 pontos restantes e a linha ideal parte de 30 até 0

Cenário: velocidade
  Dado sprints encerradas com 20, 25 e 30 pontos concluídos
  Quando consulto a velocidade
  Então vejo as três barras e a média móvel de 25

Cenário: % concluído preditivo
  Dado dois pacotes com custo planejado R$ 1.000 (100% concluído) e R$ 3.000 (50% concluído)
  Quando consulto o % concluído do projeto
  Então vejo 62,5%

Cenário: projeto sem dados
  Dado um projeto sem sprints encerradas
  Quando consulto a velocidade
  Então vejo um estado vazio explicativo, sem erro
```

**RNF:** RNF002.

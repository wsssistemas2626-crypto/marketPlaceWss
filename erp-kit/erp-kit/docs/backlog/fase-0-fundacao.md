# Fase 0 — Fundação

Objetivo: base técnica segura para todos os módulos. Nada de regra de negócio de ERP aqui.
Cada item é executado numa rodada. IDs são usados no PROGRESS.md.

---

## F0-01 — Scaffold do monorepo

**Como** desenvolvedor, **quero** o monorepo Nx configurado **para que** todos os módulos sigam a mesma base.

**Critérios de aceite:**
- Workspace Nx com pnpm; apps `api` (NestJS), `worker` (Node/NestJS standalone) e `web` (React + Vite).
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true` em todo o workspace.
- ESLint + Prettier configurados; Vitest como runner de testes em todos os projetos.
- Scripts no `package.json` raiz: `check` (`nx run-many -t lint typecheck test`), `verify` (igual a `check` até o F0-14), `dev`, `e2e`.
- `.env.example` copiado para o uso local; carregamento de variáveis validado com zod no boot (falha clara se faltar variável).
- Target `typecheck` existe em todos os projetos.
- `pnpm verify` passa com um teste trivial por app.
- `.nvmrc` com Node LTS; `README.md` com instruções de setup.

**Fora de escopo:** banco, autenticação.

---

## F0-02 — Estrutura de libs e fronteiras entre módulos

**Critérios de aceite:**
- Libs criadas: `shared/kernel`, `shared/contracts`, `platform/db`, `platform/tenancy`, `platform/iam`,
  `platform/audit`, `platform/outbox`, `platform/config`, `modules/projects`, `modules/projects-api`,
  `modules/partners`, `modules/partners-api`, `modules/organization`, `modules/organization-api`,
  `web/shell`, `web/projects`.
- Tags conforme ADR-002 aplicadas em todos os `project.json`.
- Regra `@nx/enforce-module-boundaries` com as restrições do ADR-002, nível `error`.
- Teste de arquitetura (script em `tools/`, rodado no `pnpm check`) que:

```gherkin
Cenário: importação proibida entre módulos
  Dado um arquivo temporário em modules/projects que importa de modules/partners (implementação)
  Quando o lint é executado sobre ele
  Então o lint falha com violação de module boundaries

Cenário: importação permitida via contrato
  Dado um arquivo temporário em modules/projects que importa de modules/partners-api
  Quando o lint é executado sobre ele
  Então o lint passa
```

- Regra de lint que proíbe `eslint-disable` para `@nx/enforce-module-boundaries`.

---

## F0-03 — Banco de dados, roles e migrations

**Critérios de aceite:**
- `docker-compose.yml` com PostgreSQL 16; script `pnpm db:up`.
- Roles criadas por migration inicial: `app_owner` (dona), `app_user` (sem BYPASSRLS), `app_platform`.
- Drizzle configurado em `platform/db`; migrations por módulo em `libs/<...>/src/infra/migrations`,
  aplicadas em ordem por `pnpm db:migrate` (plataforma primeiro).
- Schemas Postgres: `platform`, `organization`, `partners`, `projects`.
- Helper de teste com Testcontainers que sobe Postgres, aplica migrations e fornece conexões como `app_user` e `app_owner`.
- Os testes de integração rodam dentro do `pnpm check`.

```gherkin
Cenário: role da aplicação não ignora RLS
  Dado o banco migrado
  Quando consulto pg_roles para app_user
  Então rolbypassrls é falso e app_user não é dona de nenhuma tabela
```

---

## F0-04 — Shared kernel

**Critérios de aceite:** `libs/shared/kernel` com `Money`, `Quantity`, `Percentage` (ADR-005),
`newId()` (uuid v7), `Result<T,E>`, `DomainError` (com `code` estável), `Clock` (injetável, com `FixedClock` para testes),
validadores de CPF e CNPJ.

```gherkin
Cenário: soma sem erro de ponto flutuante
  Dado Money de "0.10" BRL e Money de "0.20" BRL
  Quando somo os dois
  Então o resultado é igual a Money de "0.30" BRL

Cenário: arredondamento meia-par
  Dado Money de "2.345" BRL
  Quando arredondo para 2 casas
  Então o resultado é "2.34"
  E Money de "2.355" arredondado para 2 casas resulta em "2.36"

Cenário: rateio fecha a soma
  Dado Money de "100.00" BRL
  Quando rateio em 3 partes iguais
  Então as partes são "33.34", "33.33" e "33.33" e somam "100.00"

Cenário: moedas diferentes
  Dado Money em BRL e Money em USD
  Quando tento somá-los
  Então recebo DomainError com code "MONEY_CURRENCY_MISMATCH"

Cenário: validação de CNPJ
  Dado o CNPJ "11.222.333/0001-81"
  Então ele é válido e normalizado para "11222333000181"
  E o CNPJ "11.222.333/0001-80" é inválido
```

---

## F0-05 — Tenancy e isolamento

**Critérios de aceite:** tabela `platform.tenants`; `TenantContext` com AsyncLocalStorage;
`TenantDb.withTenantTx(fn)` que abre transação e aplica `set_config('app.tenant_id', id, true)`;
helper de migration `enableTenantRls(table)` que cria a política do ADR-001; tabela de exemplo
`platform.tenant_settings` já com RLS; utilitário de teste `assertTenantIsolation(repo)` reutilizável pelos módulos.

```gherkin
Cenário: tenant não enxerga dados de outro tenant
  Dado os tenants A e B, e um registro em tenant_settings do tenant A
  Quando consulto tenant_settings no contexto do tenant B
  Então nenhum registro é retornado

Cenário: gravação cruzada bloqueada
  Dado o contexto do tenant B
  Quando tento inserir um registro com tenant_id do tenant A
  Então o banco rejeita a operação

Cenário: sem contexto de tenant
  Dado nenhum tenant no contexto
  Quando tento consultar uma tabela de negócio
  Então a operação falha com erro, e nenhum dado é retornado
```

---

## F0-06 — Convenções da API e observabilidade

**Critérios de aceite:** prefixo `/api/v1`; pipe de validação com zod; filtro global de erros em
problem+json (RFC 9457) mapeando `DomainError.code`; paginação padrão; concorrência otimista com `version` (409);
OpenAPI em `/api/docs`; middleware de `correlationId` (lê `X-Correlation-Id` ou gera);
logger pino com redaction (RNF022); `/health` e `/ready`.

```gherkin
Cenário: erro de validação
  Quando envio um corpo inválido
  Então recebo 400 em application/problem+json com code "VALIDATION_ERROR" e a lista de campos inválidos

Cenário: conflito de versão
  Dado um recurso na versão 3
  Quando envio atualização com version 2
  Então recebo 409 com code "CONCURRENCY_CONFLICT"

Cenário: dados sensíveis não vão para o log
  Quando uma requisição autenticada é logada
  Então o log não contém o header Authorization nem o token
```

---

## F0-07 — Verificação de token do Clerk e resolução de tenant

Leia o ADR-004 inteiro antes de começar.

**Critérios de aceite:** interface `IdentityProvider` em `platform/iam`; implementação `ClerkIdentityProvider`
(`@clerk/backend` ≥ 2.4, `verifyToken` networkless com `CLERK_JWT_KEY` e `authorizedParties`);
`FakeIdentityProvider` para testes, que gera tokens RS256 no formato v2 do Clerk (`sub`, `sid`, `o.id`, `o.slg`, `azp`, `exp`, `nbf`, `v: 2`)
com chave local; coluna `clerk_org_id` em `tenants` (criada no F0-05) e tabelas `users` e `memberships` (ver `docs/dominio/platform.md`); guard global
de autenticação que popula `AuthContext` (usuário) e `TenantContext` (tenant); endpoint `GET /api/v1/me`.
Nesta story, usuários, tenants e memberships de teste são criados por fixtures; a sincronização com o Clerk é o F0-11.

```gherkin
Cenário: token válido com organização ativa
  Dado um tenant com clerk_org_id "org_A", um usuário "user_1" e membership ativo entre eles
  Quando chamo GET /api/v1/me com token de "user_1" e o.id "org_A"
  Então recebo 200 com o usuário e o tenant ativo
  E o TenantContext da requisição contém o tenant_id local do "org_A"

Cenário: token sem organização ativa
  Quando chamo uma rota de negócio com token sem claim "o"
  Então recebo 403 com code "TENANT_NOT_SELECTED"
  E GET /api/v1/me continua respondendo 200, com tenant nulo

Cenário: token inválido
  Quando chamo a API com token expirado, com assinatura inválida ou com azp não autorizado
  Então recebo 401 com code "AUTH_INVALID_TOKEN"

Cenário: membership revogado
  Dado o membership do usuário no tenant com status REVOKED
  Quando ele chama uma rota de negócio com o.id desse tenant
  Então recebo 403 com code "TENANT_ACCESS_REVOKED"

Cenário: tenant suspenso
  Dado o tenant com status SUSPENDED
  Quando qualquer membro chama uma rota de negócio
  Então recebo 403 com code "TENANT_INACTIVE"

Cenário: nenhum teste acessa a rede
  Quando rodo pnpm check sem acesso à internet
  Então todos os testes de autenticação passam
```

**RNF:** RNF012, RNF022.

---

## F0-08 — Autorização (RBAC)

**Critérios de aceite:** tabelas `roles`, `role_permissions`, `membership_roles`; decorator `@RequirePermission`;
permissões carregadas do banco por membership com cache de 60 s, invalidado ao alterar papéis (nunca do token do Clerk);
guard global que nega por padrão; decorator `@Public()`; registro de catálogo de permissões por módulo
(`registerPermissions('projects', [...])`); serviço de semeadura dos papéis padrão (usado pelo F0-11); endpoints de CRUD de papéis
(`platform.role.*`) e atribuição a membros.

```gherkin
Cenário: endpoint sem permissão
  Dado um usuário com o papel Leitor
  Quando chama um endpoint que exige "platform.role.create"
  Então recebe 403 com code "AUTH_FORBIDDEN"

Cenário: nega por padrão
  Dado um controller de escrita sem @RequirePermission nem @Public
  Quando o teste de arquitetura roda
  Então ele falha apontando o método
```

**RNF:** RNF013.

---

## F0-09 — Auditoria

**Critérios de aceite:** tabela `audit_log` (ver `docs/dominio/platform.md`); `AuditService.record(...)` chamado
dentro da mesma transação do caso de uso; mascaramento automático de campos marcados PII;
`GET /audit?entity=&entityId=` com permissão `platform.audit.read`; role `app_user` sem UPDATE/DELETE na tabela.

```gherkin
Cenário: alteração registrada com antes e depois
  Dado um papel "Financeiro" existente
  Quando o admin renomeia o papel para "Financeiro Sênior"
  Então existe um registro de auditoria UPDATE com before.name "Financeiro" e after.name "Financeiro Sênior", usuário e horário

Cenário: auditoria imutável
  Dado um registro de auditoria
  Quando a role app_user tenta alterá-lo ou excluí-lo
  Então o banco nega a operação
```

---

## F0-10 — Outbox e worker

**Critérios de aceite:** implementação do ADR-003 completa: `OutboxWriter`, publicador no `apps/worker`,
`IdempotentConsumer`, dead-letter após 10 tentativas, contexto de tenant aplicado no consumidor.

```gherkin
Cenário: evento só existe se a transação confirmar
  Dado um caso de uso que grava dado e evento na mesma transação
  Quando a transação sofre rollback
  Então nenhum evento fica na outbox

Cenário: entrega após queda
  Dado um evento gravado na outbox e o worker parado
  Quando o worker é iniciado
  Então o evento é publicado e o consumidor o processa

Cenário: idempotência
  Dado um evento já processado pelo consumidor X
  Quando o mesmo evento é entregue novamente
  Então o efeito não é aplicado de novo

Cenário: consumidor roda no tenant do evento
  Dado um evento do tenant A
  Quando o consumidor grava dados
  Então os dados ficam com tenant_id do tenant A
```

**RNF:** RNF042.

---

## F0-11 — Sincronização Clerk: webhooks e provisionamento sob demanda

**Critérios de aceite:** endpoint `POST /api/v1/webhooks/clerk` (`@Public`, corpo bruto preservado para a verificação)
usando `IdentityProvider.verifyWebhook`; tratamento de `user.created|updated|deleted`,
`organization.created|updated|deleted`, `organizationMembership.created|updated|deleted`; idempotência por `svix-id`;
provisionamento JIT no guard quando usuário, organização ou membership do token não existirem localmente
(consulta à Backend API via `IdentityProvider`, com fake nos testes); criação de tenant semeia os papéis padrão (F0-08)
e dá `Administrador` a quem tem `org:admin` no Clerk, `Membro de Equipe` aos demais;
comando `pnpm cli dev:seed` que provisiona localmente a organização e o usuário de teste do Clerk de desenvolvimento.

```gherkin
Cenário: organização criada no Clerk
  Quando recebo webhook válido "organization.created" para "org_B"
  Então um tenant é criado com clerk_org_id "org_B", status ACTIVE e papéis padrão semeados

Cenário: assinatura inválida
  Quando recebo um webhook com assinatura inválida
  Então respondo 400 e nada é gravado

Cenário: webhook repetido
  Dado um webhook "user.created" já processado
  Quando o mesmo svix-id chega de novo
  Então respondo 200 sem duplicar o usuário

Cenário: membro removido
  Quando recebo "organizationMembership.deleted"
  Então o membership local fica REVOKED e a mudança é auditada

Cenário: usuário excluído no Clerk
  Quando recebo "user.deleted"
  Então o usuário local fica DELETED, seus memberships REVOKED, e os registros de autoria continuam referenciando-o

Cenário: provisionamento sob demanda
  Dado que o webhook da organização "org_C" ainda não chegou
  Quando um usuário com token válido de "org_C" chama GET /api/v1/me
  Então tenant, usuário e membership são criados a partir da Backend API do Clerk e a requisição responde 200
```

**RNF:** RNF012b.

---

## F0-12 — Frontend: autenticação e troca de tenant com Clerk

**Critérios de aceite:** `ClerkProvider` com `VITE_CLERK_PUBLISHABLE_KEY` e localização pt-BR;
rotas públicas (`/entrar` com `<SignIn/>`) e protegidas; `<OrganizationSwitcher/>` no cabeçalho
(tela "Selecione uma organização" quando não houver organização ativa); cliente HTTP tipado a partir de
`shared/contracts` que envia `Authorization: Bearer` com `getToken()` a cada chamada;
TanStack Query configurado, com cache limpo ao trocar de organização; página 401/403/404.
Testes de componente com o Clerk simulado (sem rede).

```gherkin
Cenário: usuário sem sessão
  Quando acesso uma rota protegida sem sessão
  Então sou redirecionado para /entrar

Cenário: troca de organização
  Dado um usuário membro das organizações A e B, com A ativa
  Quando troco para B no seletor
  Então o cache de dados é descartado e as telas passam a mostrar dados de B
```

---

## F0-13 — Frontend: layout, menu por permissão, i18n e formatação

**Critérios de aceite:** layout com menu lateral montado a partir de `GET /api/v1/me` (módulos habilitados
e permissões do usuário); i18n pt-BR (react-i18next); `formatMoney`, `formatDate`, `formatHours` em pt-BR e
fuso `America/Sao_Paulo`; Tailwind + shadcn/ui configurados; componentes base (tabela paginada, formulário, diálogo de confirmação, estado vazio).

```gherkin
Cenário: menu respeita permissões
  Dado um usuário sem nenhuma permissão do módulo projects
  Quando acessa o sistema
  Então o item "Projetos" não aparece no menu

Cenário: formatação brasileira
  Quando formato Money "1234.5" BRL e a data 2026-09-21T02:00:00Z
  Então vejo "R$ 1.234,50" e "20/09/2026"
```

---

## F0-14 — Infraestrutura E2E e `pnpm verify` completo

**Critérios de aceite:** Playwright configurado em `apps/web-e2e`, subindo API, worker, web e Postgres;
`@clerk/testing` configurado (setup global com `clerkSetup`, testing token em cada teste);
login do usuário de teste por `E2E_CLERK_USER_EMAIL`/`E2E_CLERK_USER_PASSWORD`, seguido de `pnpm cli dev:seed` automático;
verificação de acessibilidade com axe-core; script `verify` passa a ser `pnpm check && pnpm e2e`.
Se as variáveis do Clerk de desenvolvimento não existirem no ambiente: `TAREFA_BLOQUEADA`.

```gherkin
Cenário: fluxo de entrada
  Dado o usuário de teste do Clerk, membro da organização de teste
  Quando ele entra no sistema
  Então vê o layout principal com o nome da organização no cabeçalho
  E a página não tem violações de acessibilidade graves

Cenário: verify inclui E2E
  Quando rodo pnpm verify
  Então lint, typecheck, testes de unidade/integração e E2E são executados
```

---

## F0-15 — CI

**Critérios de aceite:** workflow GitHub Actions no repositório `wsssistemas2626-crypto/erpWss` que roda
`pnpm install --frozen-lockfile`, `pnpm check`, `pnpm e2e` (com Postgres de serviço) e `pnpm audit --audit-level=high`
em todo push e PR. As variáveis do Clerk de desenvolvimento vêm de *GitHub Secrets* com os mesmos nomes do `.env.example`;
o workflow falha com mensagem clara se algum secret não estiver configurado. O agente não cria secrets:
lista os necessários no log de decisões para o humano configurar.

---

## GATE-F0 — Revisão humana da Fase 0

O agente NÃO executa código neste item. Ele escreve `TAREFA_BLOQUEADA` no Status do PROGRESS.md,
com um resumo da fase: o que foi entregue, decisões menores tomadas, dívidas técnicas conhecidas e
pontos que merecem revisão humana. O humano revisa, marca o gate como concluído e volta o Status para `EM_ANDAMENTO`.

# CLAUDE.md — ERP Modular Multi-tenant

Este arquivo é a memória permanente do projeto. Leia-o INTEIRO no início de toda sessão.
Em caso de conflito entre este arquivo e qualquer outro documento, este arquivo vence,
exceto os ADRs com status "Aceito", que vencem sobre este arquivo.

## 1. O que é o projeto

ERP modular, SaaS multi-tenant, multi-segmento, para o mercado brasileiro.
O módulo de **Projetos** (ágil + Scrum + PMI, híbrido por projeto) é o diferencial e o núcleo do MVP.
Visão completa: `docs/00-visao.md`. Mapa de módulos: `docs/01-mapa-modulos.md`.

## 2. Como trabalhar neste repositório

1. Leia `PROGRESS.md` e execute **um único item** por sessão: o primeiro não marcado.
2. Antes de codar, leia os documentos que o item referencia (story em `docs/backlog/`,
   modelo em `docs/dominio/`, ADRs em `docs/adr/`).
3. Escreva os testes a partir dos critérios de aceite (Gherkin) da story. Cada cenário
   deve virar pelo menos um teste automatizado.
4. Rode `pnpm verify`. Só marque o item como concluído no PROGRESS.md se `pnpm verify` passar.
5. Registre no "Log de decisões" do PROGRESS.md: o que fez, decisões menores tomadas, pendências.

### Quando PARAR (escrever TAREFA_BLOQUEADA no Status do PROGRESS.md)

- A tarefa exige uma decisão arquitetural não coberta por ADR aceito
  (nova dependência relevante, novo padrão de comunicação, mudança de schema de outro módulo,
  mudança na estratégia de tenancy/auth). **Não improvise arquitetura.**
- Uma regra de negócio está ambígua ou contraditória entre documentos.
- Falta credencial, serviço externo ou informação que só o humano tem.
- O item exige violar alguma regra da seção 4.

Decisões pequenas (nome de variável, organização interna de um arquivo, mensagem de erro)
você toma sozinho e registra no log.

## 3. Stack (ver ADR-002)

| Camada | Tecnologia |
|---|---|
| Monorepo | Nx + pnpm |
| Backend | NestJS (Node LTS), TypeScript `strict` |
| Frontend | React + Vite + TypeScript, TanStack Query, TanStack Table, React Router, react-hook-form, Tailwind + shadcn/ui, react-i18next |
| Validação/contratos | zod (schemas em `libs/shared/contracts`, usados no back e no front) |
| Banco | PostgreSQL 16+, um schema Postgres por módulo |
| ORM/migrations | Drizzle ORM + drizzle-kit |
| Eventos | Outbox + pg-boss (ver ADR-003) |
| Decimal | decimal.js via `Money`/`Quantity` (ver ADR-005) |
| Autenticação | Clerk (ADR-004): `@clerk/backend` ≥ 2.4 no back, `@clerk/react` + `@clerk/localizations` no front, `@clerk/testing` no E2E |
| Logs | pino (JSON estruturado) |
| Testes | Vitest (unidade), Testcontainers + Postgres real (integração), Playwright (E2E) |

Não adicione dependências fora desta lista sem necessidade real. Bibliotecas utilitárias
pequenas e consolidadas são aceitáveis (registre no log). Frameworks, ORMs, filas,
bibliotecas de estado global ou de UI alternativas: TAREFA_BLOQUEADA.

## 4. Regras INEGOCIÁVEIS

### 4.1 Multi-tenancy (ADR-001)
- Toda tabela de negócio tem `tenant_id uuid NOT NULL` e política RLS ativa.
- `tenant_id` NUNCA vem do corpo, query ou path da requisição. Vem sempre do token (TenantContext).
- Toda operação de banco em contexto de requisição roda dentro da transação que aplica
  `set_config('app.tenant_id', ..., true)`. Use sempre o helper `withTenantTx`/`TenantDb`, nunca o client cru.
- A aplicação conecta com role sem `BYPASSRLS`. Migrations rodam com role dona do schema.
- Todo módulo novo com tabelas tem teste de integração de isolamento entre tenants.

### 4.2 Fronteiras entre módulos (ADR-002)
- Cada módulo de negócio tem duas libs: `libs/modules/<mod>` (implementação, privada)
  e `libs/modules/<mod>-api` (contrato público: eventos, DTOs, interfaces de fachada).
- Um módulo só pode importar: `-api` de outros módulos, `libs/platform/*`, `libs/shared/*`.
- Proibido importar a implementação de outro módulo. O lint (`@nx/enforce-module-boundaries`) falha.
  **Nunca** desative essa regra, nem com `eslint-disable`.
- Cada módulo é dono do seu schema Postgres. Proibido FK entre schemas de módulos diferentes:
  referência entre módulos é por ID (uuid), sem FK. FK para `platform.tenants` é permitida.
- Integração entre módulos: preferir eventos assíncronos via outbox. Consultas síncronas
  somente via interface de fachada declarada na lib `-api`.

### 4.3 Dinheiro e quantidades (ADR-005)
- Proibido `number` para valores monetários, percentuais financeiros ou quantidades fracionárias.
  Use `Money`, `Quantity`, `Percentage` de `libs/shared/kernel`.
- No banco: `numeric(19,4)` para dinheiro, `numeric(19,6)` para quantidade.
- Na API: valores decimais trafegam como string (`"1234.5600"`).

### 4.4 Autenticação (ADR-004)
- Login, senha, MFA e sessão são do Clerk. **Nunca** implemente tela de login, armazenamento de senha
  ou emissão de token próprios.
- No backend, só `libs/platform/iam` importa `@clerk/*`, atrás da interface `IdentityProvider`.
- O tenant vem de `o.id` do token → `tenants.clerk_org_id`. Nunca confie em ID de tenant enviado pelo cliente.
- Permissões vêm do RBAC local, nunca de claims do Clerk.
- Testes do `pnpm check` usam `FakeIdentityProvider` e **não acessam a rede**. Só o E2E usa o Clerk de desenvolvimento.

### 4.5 Auditoria e segurança
- Toda criação/alteração/exclusão de entidade de negócio gera registro de auditoria
  (quem, quando, tenant, entidade, antes/depois). Use o serviço de auditoria da plataforma.
- Todo endpoint exige autenticação, exceto os explicitamente públicos (webhook do Clerk, health).
- Todo endpoint de escrita exige permissão explícita via `@RequirePermission('<mod>.<recurso>.<acao>')`.
- Nunca logar senha, token, CPF completo ou dados pessoais sensíveis.
- Exclusão de dados mestres é lógica (`archived_at`). Exclusão física só onde a story disser.

## 5. Convenções

### Idioma
- **Código em inglês** (nomes de arquivos, classes, tabelas, colunas, eventos, rotas).
- **Interface e mensagens ao usuário em pt-BR**, via i18n (nunca string solta no componente).
- Documentação em pt-BR. O glossário PT→EN obrigatório está em `docs/03-glossario.md`:
  use SEMPRE os termos em inglês dele, sem inventar sinônimos.

### Estrutura de pastas
```
apps/
  api/            # NestJS: bootstrap, composição dos módulos, nada de regra de negócio
  worker/         # processos pg-boss (publicação do outbox, consumidores)
  web/            # React: shell, rotas, layout
libs/
  shared/kernel/      # Money, Quantity, ids (uuid v7), Result, DomainError, Clock
  shared/contracts/   # schemas zod e tipos de API compartilhados front/back
  platform/<nome>/    # tenancy, iam, audit, outbox, config, notifications, db
  modules/<mod>/      # implementação do módulo
  modules/<mod>-api/  # contrato público do módulo
  web/<mod>/          # telas e componentes do módulo no front
```
Dentro de `libs/modules/<mod>/src/`:
```
domain/        # entidades, value objects, regras puras. Sem Nest, sem Drizzle.
application/   # casos de uso (um arquivo por caso de uso), orquestração, transações
infra/         # schema Drizzle, repositórios, consumidores de eventos
http/          # controllers, mapeamento DTO <-> domínio
```

### Nomes
- Tabelas e colunas: `snake_case`, tabelas no plural (`projects.work_items`).
- Eventos: `<modulo>.<entidade>.<fato-no-passado>.v<N>`, ex.: `projects.timesheet-entry.approved.v1`.
- Permissões: `<modulo>.<recurso>.<acao>`, ex.: `projects.sprint.close`.
- IDs: uuid v7 gerado na aplicação. Datas: `timestamptz` em UTC; datas sem hora: `date`.

### API REST
- Prefixo `/api/v1`. Recursos no plural. OpenAPI gerado automaticamente.
- Erros no formato RFC 9457 (`application/problem+json`) com `code` estável em inglês.
- Paginação: `?page=1&pageSize=20` (máx. 100); resposta `{ items, page, pageSize, total }`.
- Validação de entrada sempre com o schema zod de `shared/contracts`.
- Controle de concorrência otimista: entidades editáveis têm `version`; PUT/PATCH exige `version`
  e retorna 409 se divergir.

### Testes
- Domínio: testes unitários sem banco. Casos de uso e repositórios: integração com Testcontainers.
- Nome do teste descreve o comportamento em pt-BR: `it('rejeita apontamento com mais de 24h no dia')`.
- Cada cenário Gherkin da story vira teste; cite o ID da story no `describe` (`describe('US-PRJ-009 ...')`).
- Cobertura mínima de 80% em `domain/` e `application/`.

## 6. Comandos

| Comando | Uso |
|---|---|
| `pnpm install` | instalar dependências |
| `pnpm check` | lint + typecheck + testes de unidade e integração (sem rede) |
| `pnpm verify` | `pnpm check` + E2E (a partir do F0-14). **É o critério de pronto e o CHECK_CMD do autoloop.** |
| `pnpm dev` | sobe api, worker e web |
| `pnpm db:up` | sobe Postgres local (docker compose) |
| `pnpm db:migrate` | aplica migrations |
| `pnpm e2e` | testes Playwright |

(Os comandos são criados nos itens F0-01 a F0-03. Até o F0-14, `pnpm verify` é apenas um alias de `pnpm check`.)

## 6.1 Variáveis de ambiente

Arquivo `.env` na raiz (nunca commitado; modelo em `.env.example`). Use só a instância de
**desenvolvimento** do Clerk neste ambiente.

| Variável | Uso |
|---|---|
| `DATABASE_URL_APP` / `DATABASE_URL_OWNER` | conexões como `app_user` e `app_owner` |
| `CLERK_SECRET_KEY` | Backend API do Clerk (JIT, E2E) |
| `CLERK_JWT_KEY` | verificação networkless do token |
| `CLERK_WEBHOOK_SIGNING_SECRET` | verificação de webhooks |
| `CLERK_AUTHORIZED_PARTIES` | origens aceitas no `azp`, separadas por vírgula |
| `VITE_CLERK_PUBLISHABLE_KEY` | front |
| `E2E_CLERK_USER_EMAIL` / `E2E_CLERK_USER_PASSWORD` | usuário de teste do E2E, membro de uma organização de teste |

Se uma variável necessária para o item atual não existir, escreva `TAREFA_BLOQUEADA` explicando qual falta.
Nunca invente valores nem commite segredos.

## 7. Definição de Pronto (DoD) de qualquer item

- [ ] Todos os cenários de aceite da story têm teste automatizado e passam
- [ ] `pnpm verify` passa sem warnings novos
- [ ] Nenhuma violação das regras da seção 4
- [ ] Migrations criadas para mudanças de schema, com RLS nas tabelas novas
- [ ] Endpoints novos com permissão, validação e documentação OpenAPI
- [ ] Textos de UI em i18n pt-BR
- [ ] PROGRESS.md atualizado com o log da rodada

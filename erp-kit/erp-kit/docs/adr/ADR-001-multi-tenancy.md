# ADR-001 — Multi-tenancy com isolamento lógico e RLS

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
ERP SaaS multi-segmento com expectativa de muitos clientes pequenos e médios. Manter uma instalação
por cliente inviabiliza operação e atualização. Vazamento de dados entre clientes é o pior incidente
possível para o produto.

## Decisão
- Um único deploy e um único banco PostgreSQL atendem todos os tenants.
- Toda tabela de negócio tem `tenant_id uuid NOT NULL` com FK para `platform.tenants`.
- Row-Level Security habilitada e **forçada** (`ENABLE` + `FORCE ROW LEVEL SECURITY`) em toda tabela de negócio, com política:
  `USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (mesma condição)`.
- A aplicação conecta com a role `app_user` (sem `BYPASSRLS`, sem ser dona das tabelas).
  Migrations rodam com a role `app_owner`.
- O tenant é resolvido do access token e mantido num `TenantContext` (AsyncLocalStorage).
  Cada requisição executa em transação que roda `select set_config('app.tenant_id', $1, true)`.
- Sem tenant no contexto, `current_setting` falha e nenhuma linha é acessível (falha segura).
- Processos do worker definem o tenant a partir do evento antes de qualquer acesso.
- Rotinas de plataforma que precisam atravessar tenants (ex.: publicação do outbox) usam uma role
  separada `app_platform`, restrita às tabelas de plataforma.
- Índices de tabelas de negócio começam por `tenant_id`.

## Consequências
- (+) Operação única, custo baixo, atualização simultânea para todos.
- (+) Isolamento garantido pelo banco, não só pela disciplina do código.
- (+) Um tenant pode migrar para banco dedicado (mesmo schema) apenas trocando a conexão para aquele tenant.
- (−) Toda requisição roda em transação e paga o custo da política RLS.
- (−) Testes de isolamento são obrigatórios em todo módulo.

## Alternativas descartadas
- **Schema por tenant:** migrations N vezes; catálogo do Postgres cresce com o número de tenants.
- **Banco por tenant:** custo e operação lineares; reservado como exceção futura.
- **Filtro apenas na aplicação:** um `where` esquecido vaza dados.

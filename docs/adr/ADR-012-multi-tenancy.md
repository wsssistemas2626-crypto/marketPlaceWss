# ADR-012: Multi-tenancy em modelo "pool" (banco compartilhado + `tenant_id` + RLS), com saída para "silo"

**Status:** Aceito · **Data:** 2026-09-21 · **Resolve:** decisão em aberto D1

## Contexto
A plataforma será vendida como **SaaS** para vários operadores de marketplace (tenants). Cada tenant tem os
próprios sellers, compradores, catálogo, pedidos, configurações, integrações, domínio e identidade visual.
Vazamento de dados entre tenants é o risco nº 1 do produto (comercial, jurídico — LGPD — e de reputação).
Ao mesmo tempo, o time é pequeno e o custo por tenant precisa ser baixo para vender a operadores pequenos.
Já temos um schema Postgres por módulo (ADR-003).

## Decisão
**Modelo pool:** um único conjunto de bancos e processos para todos os tenants, com isolamento lógico em
**três camadas independentes** (defesa em profundidade):

1. **Contexto de tenant na borda:** o `TenantContext` é resolvido **uma vez** por requisição/job
   (hostname, claim do JWT, API key ou endpoint de webhook) e propagado via `AsyncLocalStorage`.
   `tenant_id` **nunca** é aceito do corpo, da query ou de header livre do cliente.
2. **Repositórios tenant-aware:** toda tabela de negócio tem `tenant_id uuid NOT NULL`; a camada base de
   repositório do `platform` injeta o filtro e preenche `tenant_id` nos inserts automaticamente.
3. **Row-Level Security no PostgreSQL:** cada transação executa `SET LOCAL app.tenant_id = '<uuid>'`;
   policies `USING/WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid)` em toda tabela com tenant.
   O role da aplicação **não** tem `BYPASSRLS`. Um role separado, auditado, é usado apenas por migrações,
   pelo relay de outbox e por jobs de plataforma explicitamente marcados.

Complementos: índice de busca **por tenant**; prefixo `t/{tenantId}/` em chaves de cache, filas e object
storage; eventos com `tenantid` obrigatório no envelope; rate limit e cotas por tenant.

**Saída para silo ("cells"):** o código não assume instância única. Um tenant enterprise pode ser movido para
uma **célula dedicada** (mesmo código, banco e processos próprios), roteada pelo registro de tenants. Não
será implementado até existir demanda (Fase 3+), mas nada pode impedir isso.

## Alternativas consideradas
| Critério | Pool + RLS (escolhido) | Schema por tenant | Banco por tenant (silo) |
|---|---|---|---|
| Isolamento | Lógico (3 camadas) | Lógico forte | Físico |
| Custo por tenant | Muito baixo | Médio | Alto |
| Migrações | 1 vez | N × módulos schemas (explode com schema por módulo) | N bancos |
| Onboarding de tenant | Segundos (inserts) | Criar ~20 schemas | Provisionar banco |
| Restaurar um tenant isolado | Difícil (export lógico) | Médio | Fácil |
| Vizinho barulhento | Precisa de cotas | Precisa de cotas | Não há |
| Operação por time pequeno | Simples | Complexa | Muito complexa |

- **Schema por tenant** — descartada: combinado com schema por módulo geraria milhares de schemas; migrações e pooling de conexões inviáveis.
- **Banco por tenant** — descartada como padrão (custo e operação), mantida como opção "célula" para enterprise.
- **Somente filtro na aplicação, sem RLS** — descartada: um único `WHERE` esquecido vaza dados; RLS é a rede de segurança.

## Consequências
**Positivas:** custo marginal por tenant quase zero; provisionamento instantâneo (bom para trial/self-service);
uma só versão de código e schema; RLS protege contra bugs e contra consultas escritas pelo agente de código.
**Negativas / trade-offs aceitos:**
- Restauração de backup de **um** tenant exige export/import lógico (ferramenta de export por tenant é obrigatória).
- Vizinho barulhento: um tenant grande pode degradar outros → cotas, rate limit e concorrência de jobs por tenant.
- `SET LOCAL` exige transação em toda query (inclusive leituras) e cuidado com pool de conexões (nada de `SET` fora de transação).
- Todos os índices e constraints únicos passam a começar por `tenant_id`.

## Quando revisitar
Tenant que exija isolamento físico por contrato/regulação, tenant que sozinho represente > 30% da carga,
ou > 1.000 tenants ativos → introduzir células.

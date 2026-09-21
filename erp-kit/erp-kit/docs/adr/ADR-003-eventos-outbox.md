# ADR-003 — Comunicação entre módulos via outbox transacional

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
Fluxos como "horas aprovadas geram custo no projeto e lançamento no financeiro" não podem perder
eventos. O EventEmitter/CQRS do NestJS é em memória: se o processo cair, o evento se perde.

## Decisão
- Tabela `platform.outbox_events`: `id (uuid v7)`, `tenant_id`, `type`, `payload jsonb`,
  `occurred_at`, `published_at null`, `attempts`, `last_error`.
- O caso de uso grava o evento **na mesma transação** da alteração de negócio, via `OutboxWriter`.
- O `apps/worker` lê eventos não publicados (`FOR UPDATE SKIP LOCKED`), publica no pg-boss
  (uma fila por tipo de evento) e marca `published_at`.
- Consumidores estendem `IdempotentConsumer`, que registra `(consumer_name, event_id)` em
  `platform.processed_events` na mesma transação do efeito. Evento repetido é ignorado.
- Retentativas com backoff exponencial; após 10 falhas, vai para dead-letter e gera alerta.
- Eventos são versionados (`.v1`); o schema zod do payload fica na lib `-api` do módulo emissor.
- Payload leva IDs e dados mínimos necessários, nunca entidades inteiras.

## Consequências
- (+) Entrega pelo menos uma vez, sem perda, sem infraestrutura extra (só Postgres).
- (−) Consistência eventual entre módulos (segundos). A UI deve lidar com isso.
- (−) Consumidores precisam ser idempotentes (garantido pela classe base).

## Alternativas descartadas
- **Kafka/RabbitMQ:** operação adicional desnecessária para o volume previsto.
- **Chamada síncrona direta:** acoplamento temporal e falhas em cascata.

# ADR-004: Eventos de domínio com Transactional Outbox; BullMQ como transporte inicial

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
Muitos efeitos colaterais entre módulos (pagamento confirmado → pedido, estoque, ledger, notificação, webhooks).
Publicar diretamente numa fila após o commit perde eventos em falhas; publicar antes do commit gera eventos fantasmas.

## Decisão
- Mudança de estado + evento na mesma transação (tabela `outbox` do schema do módulo).
- Relay no worker lê a outbox (polling com `FOR UPDATE SKIP LOCKED`, ou LISTEN/NOTIFY para latência) e publica em
  filas BullMQ, uma por consumidor (fan-out).
- Consumidores idempotentes via `processed_events`; 5 tentativas com backoff, depois DLQ com alerta.
- Interface `EventBus` em `platform` isola o transporte.

## Alternativas consideradas
- **Kafka / RabbitMQ desde o início** — descartada: mais uma infraestrutura crítica para operar; volume atual não exige.
- **Event bus em memória** — descartada: perde eventos em crash; não distribui entre instâncias.
- **CDC (Debezium)** — descartada agora: complexidade operacional.

## Consequências
**Positivas:** entrega at-least-once confiável; histórico de eventos na outbox (30 dias) permite replay.
**Negativas:** consistência eventual (segundos); consumidores precisam ser idempotentes; sem ordenação global.

## Quando revisitar
Consumidores externos em tempo real, necessidade de replay longo, ou > 1 M eventos/dia → trocar transporte para
Kafka/RabbitMQ/SNS+SQS mantendo `EventBus`.

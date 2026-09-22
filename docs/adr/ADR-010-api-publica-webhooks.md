# ADR-010: API pública REST versionada, webhooks assinados e eventos CloudEvents

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
Sellers usam ERPs/hubs; parceiros precisam integrar sem nossa intervenção. O padrão de mercado (Shopify, Stripe,
Mercado Livre) é REST + webhooks.

## Decisão
REST `/v1` com OpenAPI gerado do código, SDK TS gerado, API keys com escopos, `Idempotency-Key`, paginação por cursor,
`updatedSince` para sync incremental, erros RFC 9457. Webhooks de saída com HMAC-SHA256, at-least-once e retry até 24 h.
Payloads no envelope CloudEvents. Os próprios frontends usam a mesma API (dogfooding).

## Alternativas consideradas
- **GraphQL** — descartada para API pública: cache, rate limit por custo e segurança mais complexos; ERPs brasileiros
  consomem REST. Pode ser adicionado como BFF interno se os frontends precisarem.
- **gRPC** — descartada: pouco suporte em ERPs/hubs.

## Consequências
Previsível e amplamente suportado; exige disciplina de versionamento (RNF-COMP-02).

## Quando revisitar
Demanda de parceiros por streaming de eventos (então oferecer fila/SSE dedicada).

## Atualização — multi-tenancy (ADR-012)
API keys identificam tenant + seller; cotas por plano do tenant; eventos e webhooks carregam `tenantid` e nunca
cruzam tenants. Webhooks de entrada usam URL por configuração de provedor do tenant.

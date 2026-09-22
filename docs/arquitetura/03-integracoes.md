# Arquitetura — 03. Integrações

Este é o documento que torna o marketplace "pronto para qualquer integração". Há **quatro superfícies**:

| Superfície | Direção | Para quê | Mecanismo |
|---|---|---|---|
| **Ports & adapters** | nós → provedor | Usar serviços de terceiros (pagamento, frete, fiscal...) | Interface no módulo + pacote adapter |
| **Webhooks de entrada** | provedor → nós | Receber notificações de provedores | `POST /v1/hooks/{category}/{provider}` → adapter traduz para comando interno |
| **API pública** | parceiro → nós | ERPs, hubs e sellers automatizando catálogo/estoque/pedidos | REST `/v1/public/*` + API key (Fase 3: OAuth) |
| **Webhooks de saída** | nós → parceiro | Avisar sistemas externos sobre eventos | Eventos públicos assinados HMAC |

---

## 1. Ports & adapters

### Regras
1. O **port** (interface TypeScript + tipos) vive em `packages/modules/<dono>/src/application/ports/`.
   Ele fala a **linguagem do nosso domínio**, nunca a do provedor.
2. O **adapter** vive em `packages/adapters/<categoria>-<provedor>/`, depende do port (importado pela facade
   pública do módulo) e do SDK/HTTP do provedor. Traduz erros para os erros do port.
3. Toda categoria tem um **adapter fake** (`<categoria>-fake`) usado em dev, testes e E2E.
4. Toda categoria tem uma **suíte de testes de contrato** exportada pelo módulo dono
   (`runPaymentGatewayContract(makeAdapter)`), executada contra o fake e contra o sandbox do provedor real.
5. O adapter ativo é escolhido pelo **Integration Hub** (tabela `integrations.provider_configs`, **por tenant**) e
   obtido por um *provider resolver* a cada uso: `resolver.for(tenantContext)` → instância com as credenciais
   daquele tenant (cache por tenant, invalidado quando a configuração muda). Nunca um singleton com credencial global. Pode haver mais de um ativo por categoria com regra de roteamento (ex.: por método).
6. Chamadas passam pelo `ResilientHttpClient` de `platform` (timeout, retry idempotente, circuit breaker, tracing).

### Catálogo de ports

| Port | Dono | Operações principais | Provedores candidatos |
|---|---|---|---|
| `PaymentGatewayPort` | payments | createRecipient, createCharge(split), getCharge, refund, parseWebhook, listPayouts | Pagar.me, Mercado Pago, Asaas, Iugu, Stripe Connect |
| `FraudAnalysisPort` | payments | analyze(order, payer) → approve/review/deny | ClearSale, Konduto, no-op |
| `ShippingQuotePort` | shipping | quote(origin, destination, packages) | Melhor Envio, Frenet, Correios, Kangu |
| `ShippingLabelPort` | shipping | createLabel, cancelLabel | Melhor Envio, Correios |
| `TrackingPort` | shipping | getTracking, parseWebhook | idem |
| `FiscalIssuerPort` | fiscal | issueNFe, cancel, getStatus, issueNFSe | Focus NFe, eNotas, NFE.io, PlugNotas |
| `EmailPort` / `SmsPort` / `WhatsAppPort` / `PushPort` | notifications | send(template, to, data) | SES, Resend, SendGrid / Zenvia, Twilio / Meta Cloud API / FCM |
| `SearchIndexPort` | search | upsert, delete, query, suggest, configureSynonyms | Meilisearch, OpenSearch, Typesense, Algolia |
| `ObjectStoragePort` | catalog/platform | presignUpload, presignDownload, delete | **Railway Storage Bucket** (S3-compatível, escolhido); MinIO local; S3/R2 |
| `ImageProcessorPort` | catalog | resize/convert | sharp local, imgproxy, Cloudinary |
| `WorkforceIdentityPort` | identity | verifyToken, createOrganization, updateOrganizationMetadata, inviteMember, removeMember, listMemberships, parseWebhook | **Clerk** (ADR-013) |
| `CompanyRegistryPort` | sellers | lookupCnpj | BrasilAPI, ReceitaWS, Serpro |
| `PostalCodePort` | identity | lookup(cep) | ViaCEP, BrasilAPI |
| `ContentModerationPort` | messaging/catalog | check(text) | regex local, LLM |
| `ContentAssistPort` | catalog | suggestCategory, improveListing | Claude API |
| `DomainProvisioningPort` | tenancy | addDomain, verify, getCertificateStatus, remove | **Cloudflare for SaaS** (escolhido, ADR-014); alternativas: Vercel Domains, Caddy on-demand TLS |
| `SubscriptionBillingPort` | saas-billing | createCustomer, subscribe, changePlan, invoiceUsage, parseWebhook | Stripe Billing, Asaas, Iugu, Vindi |
| `ErpConnectorPort` (Fase 3) | integrations | syncProducts, syncStock, pushOrders | Bling, Tiny/Olist, Omie, Anymarket |

### Exemplo de port (referência para o Claude Code)

```ts
// packages/modules/payments/src/application/ports/payment-gateway.port.ts
export interface PaymentGatewayPort {
  readonly provider: string;
  createRecipient(input: CreateRecipientInput): Promise<Result<{ externalId: string; status: RecipientStatus }, GatewayError>>;
  createCharge(input: CreateChargeInput): Promise<Result<ChargeCreated, GatewayError>>;
  getCharge(externalId: string): Promise<Result<ChargeSnapshot, GatewayError>>;
  refund(input: RefundInput): Promise<Result<RefundCreated, GatewayError>>;
  /** Valida assinatura e traduz o payload do provedor para eventos do nosso domínio. */
  parseWebhook(req: RawWebhookRequest): Promise<Result<GatewayWebhookEvent[], WebhookValidationError>>;
}

export interface CreateChargeInput {
  idempotencyKey: string;               // = paymentId
  orderId: string;
  amount: Money;                        // total cobrado
  method: { type: 'pix'; expiresInSeconds: number }
        | { type: 'credit_card'; cardToken: string; installments: number };
  payer: { name: string; document: string; email: string };
  split: Array<{ recipientExternalId: string; amount: Money; chargeProcessingFee: boolean; liable: boolean }>;
  metadata: Record<string, string>;
}
// Invariante verificada pelo port (antes de chamar o adapter): soma(split.amount) === amount.
```

### Como adicionar um provedor (checklist — comando `/novo-adapter`)
1. `packages/adapters/<categoria>-<provedor>` com `package.json`, `src/index.ts` exportando a factory.
2. Implementar o port; mapear erros; nunca vazar tipos do SDK.
3. Rodar a suíte de contrato contra fake HTTP (msw/nock) e, se houver credenciais de sandbox, contra o sandbox.
4. Registrar no resolver da categoria e declarar o schema Zod das credenciais (o admin renderiza o formulário a partir dele).
5. Se o provedor envia webhooks, implementar `parseWebhook` e documentar a URL em `docs/integracoes/<provedor>.md`.

---

## 2. Eventos de domínio (contrato interno e base dos webhooks)

### Envelope (CloudEvents 1.0)
```json
{
  "specversion": "1.0",
  "id": "0191f6b2-...-uuidv7",
  "source": "mkt/orders",
  "type": "orders.seller_order.shipped",
  "dataschemaversion": 1,
  "time": "2026-09-21T14:03:11.120Z",
  "subject": "seller_order/0191f6b1-...",
  "correlationid": "req-...",
  "tenantid": "0191...",
  "sellerid": "0191...",
  "data": { "...": "payload tipado por Zod" }
}
```
- `type` + `dataschemaversion` identificam o schema em `packages/contracts/events/`.
- Evolução: adicionar campo opcional = mesma versão; remover/renomear = nova versão, publicando as duas
  em paralelo durante a migração.
- Eventos marcados `public: true` no catálogo podem ser assinados por webhooks externos; os demais são internos.
- `tenantid` é **obrigatório** em todo evento; consumidores restauram o `TenantContext` a partir dele.
- `sellerid` presente em eventos com escopo de loja: o webhook do seller só recebe eventos da própria loja.

### Catálogo inicial de eventos
| Evento | Público | Consumidores internos |
|---|---|---|
| `sellers.seller.approved/suspended/reactivated` | não | offers, search, notifications, identity |
| `catalog.product.published/updated/unpublished` | sim | search, notifications |
| `offers.offer.changed/out_of_stock` | sim | search |
| `orders.order.placed` | sim | cart, notifications, audit |
| `orders.seller_order.paid` | **sim (principal para ERPs)** | notifications, integrations |
| `orders.seller_order.shipped/delivered/completed/cancelled` | sim | ledger, notifications, offers, shipping |
| `payments.payment.paid/failed/expired/refunded` | não | orders, offers, ledger |
| `payments.payout.paid` | sim | ledger, notifications |
| `shipping.shipment.delivered` | sim | orders |
| `fiscal.invoice.issued` | sim | orders, notifications |

---

## 3. Webhooks de saída

- Webhooks são sempre de um tenant: o admin do tenant assina eventos de todo o marketplace; o seller, só os da sua loja.
- Cadastro: `POST /v1/seller/webhooks` (ou `/v1/admin/webhooks`) com `url` (HTTPS obrigatório), `events[]`, recebe `secret`.
- Requisição: `POST {url}` com corpo = envelope do evento e headers:
  - `X-Mkt-Event-Id`, `X-Mkt-Event-Type`, `X-Mkt-Timestamp`
  - `X-Mkt-Signature: t=<timestamp>,v1=<hex(HMAC_SHA256(secret, timestamp + "." + body))>`
- Sucesso = HTTP 2xx em até 10 s. Falha → retry com backoff exponencial (1 min, 5 min, 30 min, 2 h, 6 h, 12 h) até 24 h.
- Após 24 h de falhas contínuas, endpoint é **desativado** e o dono é notificado.
- Painel de entregas: status, código, latência, corpo da resposta (truncado), botão reenviar.
- Garantia: **at-least-once**, sem ordenação garantida → consumidores devem deduplicar por `X-Mkt-Event-Id`
  e usar `time`/versão do recurso para ordenar. (Documentar isso no portal do desenvolvedor.)

```gherkin
Cenário: entrega com retry
  Dado um endpoint inscrito em "orders.seller_order.paid" que responde 500
  Quando o evento é publicado
  Então são feitas tentativas conforme a política de backoff
  E cada tentativa fica registrada em WebhookDelivery
  E quando o endpoint volta a responder 200 a entrega é marcada como "delivered"
```

---

## 4. API pública

- Base: `/v1/public/*` no host do tenant ou em `api.<dominio-plataforma>`; autenticação `Authorization: Bearer <api_key>`
  (a chave identifica tenant + seller — Fase 3 também OAuth 2.0 + PKCE). Cota de requisições do plano do tenant.
- Escopos: `catalog:read|write`, `offers:read|write`, `orders:read|write`, `shipping:write`, `webhooks:manage`, `finance:read`.
- Padrões: JSON, `camelCase`, datas ISO-8601 UTC, dinheiro `{ "amount": 1990, "currency": "BRL" }` em centavos,
  paginação `?cursor=&limit=` (máx. 100), filtro `updatedSince` para sincronização incremental,
  `Idempotency-Key` em POST, erros RFC 9457, rate limit com headers `RateLimit-*` (padrão 10 req/s por chave).
- Endpoints mínimos da v1 (US-061):
  - `GET/POST/PATCH /products`, `GET/POST/PATCH /offers`, `POST /offers/bulk` (preço/estoque, até 500)
  - `GET /orders?status=&updatedSince=`, `GET /orders/{id}`, `POST /orders/{id}/invoice`, `POST /orders/{id}/ship`, `POST /orders/{id}/cancel`
  - `GET/POST/DELETE /webhooks`
- OpenAPI gerado do código (decorators Nest + Zod) publicado em `/v1/public/openapi.json` e portal `/developers`.
- SDK TypeScript gerado em `packages/sdk` (também usado pelos frontends próprios — "dogfooding").

---

## 5. Webhooks de entrada

- **Clerk (identidade):** `POST /v1/hooks/identity/clerk` (aplicação Plataforma) e `/v1/hooks/identity/clerk-console`.
  Assinatura verificada com o segredo do webhook (Svix). Eventos mínimos assinados: `user.created|updated|deleted`,
  `organization.created|updated|deleted`, `organizationMembership.created|updated|deleted`. A Clerk não garante ordem;
  aplique por `updated_at` e idempotência por id do evento. Job diário reconcilia com a Backend API da Clerk.

- Rota por configuração de provedor: `POST /v1/hooks/{category}/{provider}/{providerConfigId}` — o `providerConfigId`
  identifica o tenant e a credencial usada para validar a assinatura (cada tenant cadastra essa URL no seu gateway).
- Pipeline: (1) persistir corpo bruto em `integrations.inbound_webhooks` (auditoria/replay) → (2) `adapter.parseWebhook`
  valida assinatura e timestamp → (3) traduz em comandos idempotentes do módulo dono → (4) responde 200 rápido;
  processamento pesado vai para fila.
- Nunca confiar só no webhook para dinheiro: ao receber `paid`, o adapter confirma via `getCharge` antes de transicionar
  (defesa contra falsificação e webhooks fora de ordem).

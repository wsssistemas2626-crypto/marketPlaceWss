# Arquitetura — 02. Módulos (Bounded Contexts)

Para cada módulo: responsabilidade, agregados principais, facade pública (`index.ts`), eventos publicados
e consumidos, ports externos. Nomes de código em inglês. Pacote: `@mkt/modules-<nome>`.
Schema Postgres = nome do módulo. **Toda tabela de todos os módulos abaixo tem `tenant_id` + RLS**, exceto o
schema `tenancy` (ver `06-multi-tenancy.md`). "Operador" = equipe do tenant.

> Regra de ouro: se você precisa de um dado de outro módulo **para decidir algo agora**, chame a facade.
> Se precisa **reagir** a algo que aconteceu, consuma o evento. Se precisa **exibir/filtrar** dados de
> outro módulo em volume, mantenha uma projeção local alimentada por eventos.

---

## tenancy (sem tenant_id — é o registro dos tenants)
- **Responsabilidade:** tenants, domínios, planos e entitlements, tema, staff da plataforma, modo suporte,
  provisionamento/offboarding, células.
- **Agregados:** `Tenant` (slug, name, status, planId, cellId, theme, legalTexts, trialEndsAt, clerkOrgId), `Domain` (host,
  type: subdomain|custom, verification, tlsStatus), `Plan` (modules[], limits), `SupportSession` (staff = usuário da app Clerk Console).
- **Facade:** `resolveByHost(host)`, `getTenant(id)`, `getEntitlements(tenantId)`, `assertWithinLimit(tenantId, resource, n)`.
- **Publica:** `tenancy.tenant.created|provisioned|activated|suspended|reactivated|offboarding_started|deleted`,
  `tenancy.plan.changed`, `tenancy.support_session.started`.
- **Consome:** `<modulo>.tenant_seeded` de cada módulo (acompanha provisionamento), eventos de uso para limites.
- **Ports:** `DomainProvisioningPort`.
- **Regra:** todo módulo de negócio consome `tenancy.tenant.created` (seeds) e `tenancy.tenant.deleted` (purge),
  respondendo com `<modulo>.tenant_seeded` / `<modulo>.tenant_purged`.

## saas-billing (Fase 2, sem tenant_id — dado da plataforma sobre os tenants)
- **Responsabilidade:** assinaturas, apuração de GMV, faturas da plataforma aos tenants, inadimplência.
- **Consome:** `payments.payment.paid|refunded` (projeção de GMV por tenant), `tenancy.plan.changed`.
- **Ports:** `SubscriptionBillingPort`.

## identity
- **Responsabilidade:** duas identidades, atrás de ports (ADR-013):
  - **Compradores (próprio):** credenciais, sessões, endereços, consentimentos LGPD — **por tenant**
    (`UNIQUE(tenant_id, email)`; JWT próprio com claim `tid`). Port `CustomerAuthPort` (implementação interna).
  - **Força de trabalho (Clerk):** staff, operadores e sellers. Port `WorkforceIdentityPort` (adapter `identity-clerk`):
    verificar token, criar organização, definir metadata, convidar membro, listar membros. Projeção local
    `workforce_users`, `org_links` (clerk_org_id → kind, tenant_id, seller_id) alimentada por webhooks da Clerk.
- **Agregados:** `User` (email, passwordHash, document, status, mfa), `Session/RefreshTokenFamily`,
  `RoleAssignment` (userId, role, scope: platform | seller:{id}), `Address`, `Consent`.
- **Facade:** `getCustomer(id)`, `getAddress(customerId, addressId)`, `resolvePanelPrincipal(token)` → {userId, orgKind,
  tenantId, sellerId?, permissions}, `createTenantOrganization(tenantId, adminEmail)`, `createSellerOrganization(sellerId, ownerUserId)`.
- **Publica:** `identity.customer.registered|verified|anonymized`, `identity.workforce_user.synced`, `identity.membership.changed`.
- **Consome:** `tenancy.tenant.created` (cria organização do tenant e convida admin), `sellers.seller.applied` (cria organização do seller),
  `sellers.seller.suspended` (opcional: bloqueia a organização na Clerk).
- **Ports:** `WorkforceIdentityPort` (Clerk), `PostalCodePort`, `PasswordBreachPort` (opcional).

## sellers
- **Responsabilidade:** ciclo de vida da loja, KYC, colaboradores, perfil público, políticas.
- **Agregados:** `Seller` (cnpj, legalName, tradeName, slug, status, paymentAccount{provider, recipientId, status},
  bankAccount, handlingDaysDefault, flags{autoPublish}), `SellerMember`.
- **Máquina de estados:** `pending → under_review → approved | rejected`; `approved ⇄ suspended`.
- **Facade:** `getSeller(id)`, `assertCanSell(sellerId)` (approved + paymentAccount ativo), `getShippingOrigin(sellerId)`.
- **Publica:** `sellers.seller.applied|approved|rejected|suspended|reactivated|updated`.
- **Ports:** `CompanyRegistryPort` (CNPJ), usa `PaymentGatewayPort` **via facade de payments**
  (`payments.createRecipient`) — sellers não conhece o gateway.

## catalog
- **Responsabilidade:** categorias, atributos, produtos, variações, imagens, moderação.
- **Agregados:** `Category` (árvore, atributos), `Product` (title, slug, brandId, categoryId, gtin?, attributes,
  dimensions, weight, images[], status, createdBySellerId), `Variant` (attributes de variação), `Brand`.
- **Facade:** `getProduct(id)`, `getVariant(id)` (inclui peso/dimensões para frete), `getCategoryPath(id)`.
- **Publica:** `catalog.product.submitted|published|rejected|updated|unpublished`, `catalog.category.changed`.
- **Consome:** `sellers.seller.suspended` (não altera produto — só ofertas saem; produto pode ter outras ofertas).
- **Ports:** `ObjectStoragePort`, `ImageProcessorPort`, `ContentAssistPort` (Fase 4).

## offers
- **Responsabilidade:** oferta do seller por variação: SKU, preço, estoque, reservas, condição, prazo de manuseio.
- **Agregados:** `Offer` (sellerId, variantId, sellerSku, price, listPrice?, stock, condition, handlingDays, status),
  `StockReservation` (offerId, orderId, qty, expiresAt, status), `PriceHistory`.
- **Facade:** `getOffers(ids)`, `getOffersForVariant(variantId)`, `reserve(orderId, items[])` (atômico, tudo ou nada),
  `releaseReservation(orderId)`, `commitReservation(orderId)`.
- **Publica:** `offers.offer.created|changed|out_of_stock|deactivated`.
- **Consome:** `sellers.seller.suspended|reactivated`, `payments.payment.paid` (commit),
  `payments.payment.failed|expired` e `orders.seller_order.cancelled` (release/estorno de estoque).

## search
- **Responsabilidade:** índice desnormalizado de produtos com melhor oferta, facetas, sinônimos, autocomplete.
- **Modelo:** documento `ProductSearchDoc` (productId, title, category path, brand, attributes facetáveis,
  minPrice, sellersCount, freeShipping, rating, soldCount, available).
- **Facade:** `search(query, filters, sort, cursor)`, `suggest(prefix)`.
- **Consome:** eventos de catalog, offers, sellers, reviews (Fase 2).
- **Ports:** `SearchIndexPort` (Meilisearch; fallback Postgres).

## cart
- **Responsabilidade:** carrinho anônimo/logado, agrupamento por seller, revalidação.
- **Agregados:** `Cart` (ownerType: anonymous|user, items: offerId, qty).
- **Facade:** `getCartForCheckout(cartId)` (itens revalidados via offers), `clear(cartId)`.
- **Consome:** `orders.order.placed` (limpa carrinho).

## checkout (orquestrador)
- **Responsabilidade:** conduzir a compra: validar carrinho, cotar/fixar frete, calcular totais, criar pedido,
  reservar estoque, iniciar pagamento. **Não tem estado de longo prazo** — só `CheckoutSession` efêmera.
- **Fluxo (síncrono, com compensação):** ver `05-fluxos.md` §1. Em falha após reservar, chama
  `offers.releaseReservation` e marca o pedido `payment_failed`.
- **Depende de:** cart, offers, shipping, orders, payments, identity (endereço).

## orders
- **Responsabilidade:** `Order` e `SellerOrder`, itens com snapshot, máquina de estados, histórico, cancelamento.
- **Agregados:** `Order` (buyerId, totals, paymentId, status agregado), `SellerOrder` (sellerId, items[], shipping
  {serviceId, price, eta}, status, invoice{key, xmlUrl}, tracking, timestamps), `OrderItem` (offerId, snapshot, qty,
  unitPrice, commissionRate, commissionAmount).
- **Facade:** `placeOrder(cmd)`, `getOrder(id)`, `transitionSellerOrder(id, action, actor)`.
- **Publica:** `orders.order.placed`, `orders.seller_order.paid|in_preparation|shipped|delivered|completed|cancelled`.
- **Consome:** `payments.payment.paid|failed|expired|refunded`, `shipping.shipment.delivered`.
- **Depende de:** ledger (`quoteCommission(items)` para congelar comissão).

## payments
- **Responsabilidade:** recebedores (subcontas), cobranças com split, webhooks de entrada, reembolsos.
- **Agregados:** `Recipient` (sellerId, provider, externalId, status), `Payment` (orderId, method, amount,
  installments, splitRules[], status, externalId, attempts[]), `Refund`.
- **Facade:** `createRecipient(sellerData)`, `createCharge(orderId, method, splitRules)`, `refund(paymentId, amount, splitAdjust)`.
- **Publica:** `payments.payment.authorized|paid|failed|expired|refunded|chargeback_opened`, `payments.payout.paid`.
- **Ports:** `PaymentGatewayPort` (ver `03-integracoes.md`).

## ledger (financeiro)
- **Responsabilidade:** contas, lançamentos de partidas dobradas, regras de comissão, saldos, extrato, repasses.
- **Agregados:** `Account` (tipo: seller_pending, seller_available, seller_paid_out, platform_commission,
  platform_fees, gateway_receivable, refunds...), `JournalEntry` (id, occurredAt, reference, lines[] com
  soma zero), `CommissionRule` (scope: category|seller, rate, validFrom), `Payout`.
- **Facade:** `quoteCommission(items)`, `getBalance(sellerId)`, `getStatement(sellerId, period)`.
- **Consome:** `payments.payment.paid|refunded|chargeback_opened`, `orders.seller_order.completed|cancelled`,
  `payments.payout.paid`.
- **Invariantes:** entradas imutáveis; soma de linhas = 0; saldo disponível nunca é pago se < 0.

## shipping
- **Responsabilidade:** cotação por pacote, tabelas do seller, etiquetas, rastreio.
- **Agregados:** `ShippingQuote` (com validade), `SellerShippingTable`, `Shipment` (sellerOrderId, carrier, service,
  trackingCode, labelUrl, events[], status).
- **Facade:** `quote(origin, destination, packages)`, `createShipment(sellerOrderId)`.
- **Publica:** `shipping.shipment.created|in_transit|delivered|exception`.
- **Consome:** `orders.seller_order.cancelled` (cancela etiqueta se possível).
- **Ports:** `ShippingQuotePort`, `ShippingLabelPort`, `TrackingPort`.

## fiscal (Fase 1 mínimo / Fase 2 completo)
- **Responsabilidade:** vínculo de NF-e ao SellerOrder; emissão via integrador; NFS-e da comissão.
- **Ports:** `FiscalIssuerPort`. **Publica:** `fiscal.invoice.issued|failed`.

## promotions (Fase 2)
- Cupons, campanhas, cálculo de desconto com rateio por item e registro de quem custeia (plataforma/seller)
  → informa o ledger. **Facade:** `applyCoupon(cartSnapshot, code)`.

## reviews / messaging / disputes (Fase 2)
- **reviews:** avaliações de produto e seller, Q&A. Publica `reviews.review.published`.
- **messaging:** conversas por SellerOrder com filtro anti-desintermediação (`ContentModerationPort`).
- **disputes:** devolução/troca/mediação; publica `disputes.dispute.opened|resolved` (ledger congela/descongela saldo).

## notifications
- **Responsabilidade:** traduzir eventos em mensagens por canal, templates versionados, preferências.
- **Consome:** praticamente todos os eventos de negócio relevantes ao usuário.
- **Ports:** `EmailPort`, `SmsPort`, `WhatsAppPort`, `PushPort` (Fase 2).

## integrations
- **Responsabilidade:** (1) **Hub de provedores**: registro, credenciais criptografadas **por tenant**, seleção do
  adapter ativo por categoria e tenant (provedores disponíveis limitados pelo plano); (2) **API keys** e (Fase 3) **Apps OAuth**; (3) **webhooks de saída**: assinaturas, entregas,
  retries, logs; (4) **conectores** ERP/hub (Fase 3).
- **Agregados:** `ProviderConfig`, `ApiKey` (hash, scopes, sellerId), `WebhookEndpoint`, `WebhookDelivery`, `App` (Fase 3).
- **Consome:** todos os eventos marcados como `public: true` no catálogo de eventos (`packages/contracts`).

## audit
- Grava `AuditRecord` append-only a partir de interceptor HTTP (ações admin/financeiras) e de eventos sensíveis.

## cms / reporting
- **cms:** banners, coleções, páginas. **reporting:** projeções analíticas alimentadas por eventos (Fase 2).

## platform (pacote técnico, não é bounded context)
- `TenantContext` (AsyncLocalStorage), `TenantResolver`, `TenantAwareRepository`, `withTenantTx` (SET LOCAL),
  `@PlatformJob`, `@RequiresModule`, `ConfigService` hierárquico.
- Outbox, event bus, `processed_events`, idempotência HTTP, guards de auth, rate limit por tenant,
  cliente HTTP resiliente (timeout, retry, circuit breaker) para adapters, telemetria.

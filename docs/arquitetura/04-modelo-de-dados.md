# Arquitetura — 04. Modelo de Dados (núcleo da Fase 1)

Cada bloco abaixo é um **schema Postgres diferente**. Referências entre schemas são apenas **IDs lógicos**
(sem foreign key física entre schemas — ADR-003). Dentro do mesmo schema, FKs normais.

**Multi-tenant (ADR-012):** toda tabela abaixo tem `tenant_id uuid NOT NULL` (omitido nos diagramas por legibilidade),
RLS habilitado e forçado, e todos os índices/unicidades começam por `tenant_id`. Exceção: schema `tenancy`.

Convenções de colunas: `id uuid pk (v7)`, `created_at`, `updated_at timestamptz`, `version int` (lock otimista
em agregados editáveis), dinheiro em `bigint` (centavos) + moeda implícita BRL, PII marcada com comentário
`-- pii` para as regras de redação/anonimização.

## tenancy (sem tenant_id)
```mermaid
erDiagram
  PLAN ||--o{ TENANT : assina
  TENANT ||--|{ DOMAIN : responde
  TENANT ||--o{ SUPPORT_SESSION : acessado
  PLAN {
    uuid id
    text code
    jsonb modules
    jsonb limits
  }
  TENANT {
    uuid id
    text slug
    text name
    text status
    uuid plan_id
    text cell_id
    jsonb theme
    timestamptz trial_ends_at
  }
  DOMAIN {
    text host
    uuid tenant_id
    text type
    text verification_status
    text tls_status
  }
  SUPPORT_SESSION {
    uuid id
    uuid tenant_id
    text staff_clerk_user_id
    text reason
    text access
    timestamptz expires_at
  }
```
Policy RLS padrão (gerada por `enableTenantRls`):
```sql
ALTER TABLE offers.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.offers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON offers.offers
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

## identity / sellers
Tabelas do lado Clerk (identity): `workforce_users(clerk_user_id pk, email, name, updated_at)` — **sem tenant_id**, são
globais como na Clerk, mas só acessadas via `org_links`; `org_links(clerk_org_id pk, kind, tenant_id, seller_id, created_at)`
com RLS por `tenant_id`; `org_memberships(clerk_org_id, clerk_user_id, role, tenant_id)` com RLS.
O diagrama abaixo (USER, ROLE_ASSIGNMENT...) refere-se aos **compradores** (identidade própria).
**Implementado (US-010):** `identity.customers` (`UNIQUE(tenant_id, email)`, documento como `document_type` +
`document_number` só dígitos, `password_hash` Argon2id em formato PHC), `identity.customer_consents` (histórico:
aceitar versão nova é linha nova; `ip inet`) e `identity.customer_email_verifications` (só o SHA-256 do token,
validade de 24 h). Todas com RLS forçado; eventos no `identity.outbox`. Papéis de comprador não têm tabela: o
storefront tem papel único (RF-IAM-07).
```mermaid
erDiagram
  USER ||--o{ ROLE_ASSIGNMENT : tem
  USER ||--o{ ADDRESS : possui
  USER ||--o{ CONSENT : registra
  USER {
    uuid id
    text email_pii
    text password_hash
    text document_pii
    text status
    bool mfa_enabled
  }
  ROLE_ASSIGNMENT {
    uuid user_id
    text role
    text scope_type
    uuid scope_id
  }
  ADDRESS {
    uuid id
    uuid user_id
    text zip
    text street_pii
    text number
    text city
    text state
  }
  CONSENT {
    uuid user_id
    text kind
    text version
    timestamptz accepted_at
    inet ip
  }

  SELLER ||--o{ SELLER_MEMBER : tem
  SELLER {
    uuid id
    text cnpj
    text legal_name
    text trade_name
    text slug
    text status
    text payment_account_status
    text clerk_org_id
    text recipient_external_id
    int handling_days_default
    jsonb bank_account_enc
  }
  SELLER_MEMBER {
    uuid seller_id
    uuid user_id
    text role
  }
```

## catalog / offers
```mermaid
erDiagram
  CATEGORY ||--o{ CATEGORY : pai
  CATEGORY ||--o{ CATEGORY_ATTRIBUTE : define
  CATEGORY ||--o{ PRODUCT : classifica
  PRODUCT ||--|{ VARIANT : tem
  PRODUCT ||--o{ PRODUCT_IMAGE : tem
  CATEGORY {
    uuid id
    uuid parent_id
    text name
    text slug
    int depth
    bool is_leaf
  }
  CATEGORY_ATTRIBUTE {
    uuid id
    uuid category_id
    text key
    text type
    bool required
    bool is_variation
    jsonb allowed_values
  }
  PRODUCT {
    uuid id
    uuid category_id
    text title
    text slug
    text gtin
    uuid brand_id
    jsonb attributes
    int weight_g
    int length_mm
    int width_mm
    int height_mm
    text status
    uuid created_by_seller_id
  }
  VARIANT {
    uuid id
    uuid product_id
    jsonb variation_attributes
    text gtin
  }
  PRODUCT_IMAGE {
    uuid id
    uuid product_id
    text storage_key
    int position
  }

  OFFER ||--o{ STOCK_RESERVATION : reserva
  OFFER {
    uuid id
    uuid seller_id
    uuid variant_id
    text seller_sku
    bigint price
    bigint list_price
    int stock
    int reserved
    text condition
    int handling_days
    text status
    int version
  }
  STOCK_RESERVATION {
    uuid id
    uuid offer_id
    uuid order_id
    int qty
    timestamptz expires_at
    text status
  }
```
Restrições: `UNIQUE(tenant_id, seller_id, seller_sku)`, `UNIQUE(tenant_id, seller_id, variant_id, condition)`, `UNIQUE(tenant_id, slug)` em produto/categoria/seller,
`CHECK (stock >= 0 AND reserved >= 0 AND reserved <= stock)`. Reserva atômica:
`UPDATE offers SET reserved = reserved + $q WHERE id = $id AND stock - reserved >= $q`.

## orders / payments
```mermaid
erDiagram
  ORDER ||--|{ SELLER_ORDER : divide
  SELLER_ORDER ||--|{ ORDER_ITEM : contem
  SELLER_ORDER ||--o{ SELLER_ORDER_TRANSITION : historico
  ORDER {
    uuid id
    uuid buyer_id
    text number
    bigint items_total
    bigint shipping_total
    bigint discount_total
    bigint grand_total
    jsonb shipping_address_pii
    text status
    uuid payment_id
  }
  SELLER_ORDER {
    uuid id
    uuid order_id
    uuid seller_id
    text number
    text status
    bigint items_total
    bigint shipping_price
    text shipping_service
    int eta_days
    text invoice_key
    text tracking_code
    timestamptz delivered_at
  }
  ORDER_ITEM {
    uuid id
    uuid seller_order_id
    uuid offer_id
    uuid variant_id
    jsonb snapshot
    int qty
    bigint unit_price
    numeric commission_rate
    bigint commission_amount
  }
  SELLER_ORDER_TRANSITION {
    uuid seller_order_id
    text from_status
    text to_status
    text actor_type
    uuid actor_id
    text reason
    timestamptz at
  }

  PAYMENT ||--o{ PAYMENT_SPLIT : divide
  PAYMENT ||--o{ REFUND : tem
  PAYMENT {
    uuid id
    uuid order_id
    text provider
    text external_id
    text method
    int installments
    bigint amount
    text status
    timestamptz expires_at
  }
  PAYMENT_SPLIT {
    uuid payment_id
    uuid seller_id
    text recipient_external_id
    bigint amount
  }
  REFUND {
    uuid id
    uuid payment_id
    uuid seller_order_id
    bigint amount
    text status
    text external_id
  }
```

## ledger
```mermaid
erDiagram
  ACCOUNT ||--o{ JOURNAL_LINE : movimenta
  JOURNAL_ENTRY ||--|{ JOURNAL_LINE : compoe
  ACCOUNT {
    uuid id
    text type
    uuid owner_id
    text currency
  }
  JOURNAL_ENTRY {
    uuid id
    text kind
    text reference_type
    uuid reference_id
    text idempotency_key
    timestamptz occurred_at
  }
  JOURNAL_LINE {
    uuid id
    uuid entry_id
    uuid account_id
    bigint amount
  }
  COMMISSION_RULE {
    uuid id
    text scope_type
    uuid scope_id
    numeric rate
    bigint fixed_fee
    date valid_from
    date valid_to
  }
```
Invariantes: `SUM(amount) = 0` por `entry_id` (trigger `DEFERRABLE` ou verificação na aplicação + job de auditoria);
`UNIQUE(idempotency_key)`; tabela sem `UPDATE`/`DELETE` (revogar permissões do role da aplicação).
Saldo = `SUM(amount)` por conta, com tabela de snapshot diário para performance.

## platform (em todo schema que publica eventos)
```
outbox(id uuid pk, tenant_id uuid not null, type text, payload jsonb, occurred_at timestamptz, published_at timestamptz null, attempts int)
processed_events(tenant_id uuid, consumer text, event_id uuid, processed_at timestamptz, pk(consumer, event_id))
```

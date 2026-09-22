# Arquitetura — 05. Fluxos Críticos

## 1. Checkout multi-seller com Pix

```mermaid
sequenceDiagram
  autonumber
  participant B as Comprador (storefront)
  participant CHK as checkout
  participant CRT as cart
  participant OFR as offers
  participant SHP as shipping
  participant ORD as orders
  participant LED as ledger
  participant PAY as payments
  participant GW as Gateway (adapter)
  B->>CHK: POST /v1/store/checkout (Idempotency-Key)
  CHK->>CRT: getCartForCheckout()
  CRT->>OFR: revalidar preço/estoque
  CHK->>SHP: validar cotações escolhidas (não expiradas)
  CHK->>ORD: placeOrder()
  ORD->>LED: quoteCommission(items) (congela comissão)
  ORD->>ORD: [tx: Order + SellerOrders + outbox orders.order.placed]
  CHK->>OFR: reserve(orderId, items) (atômico)
  alt sem estoque
    CHK->>ORD: cancel(reason=out_of_stock)
    CHK-->>B: 409 com itens afetados
  end
  CHK->>PAY: createCharge(orderId, pix, splitRules)
  PAY->>GW: createCharge (timeout 5s, idempotente)
  alt falha no gateway
    CHK->>OFR: releaseReservation(orderId)
    CHK->>ORD: markPaymentFailed()
    CHK-->>B: 502 tentar novamente
  end
  GW-->>PAY: QR Code + expiração
  CHK-->>B: 201 {orderId, pix: {qrCode, copyPaste, expiresAt}}
```
Observação: `placeOrder` e `reserve` estão em schemas diferentes → não há transação única. A consistência é
garantida por **compensação** (release/cancel) e por um job de varredura que libera reservas órfãs expiradas.

## 2. Confirmação de pagamento e propagação

```mermaid
sequenceDiagram
  autonumber
  participant GW as Gateway
  participant HK as Endpoint de webhook
  participant PAY as payments
  participant BUS as Outbox/Fila
  participant ORD as orders
  participant OFR as offers
  participant LED as ledger
  participant NOT as notifications
  participant INT as integrations (webhooks saída)
  GW->>HK: webhook "paid"
  HK->>PAY: parseWebhook (assinatura) + getCharge (confirmação)
  PAY->>PAY: Payment → paid [tx + outbox payments.payment.paid]
  HK-->>GW: 200
  BUS->>ORD: payments.payment.paid → SellerOrders → paid (+ outbox orders.seller_order.paid ×N)
  BUS->>OFR: commitReservation
  BUS->>LED: lançamentos de venda/comissão (seller_pending)
  BUS->>NOT: e-mails comprador + sellers
  BUS->>INT: webhooks para ERPs dos sellers
```

## 3. Ciclo de vida do SellerOrder

```mermaid
stateDiagram-v2
  [*] --> awaiting_payment
  awaiting_payment --> paid: payment.paid
  awaiting_payment --> cancelled: payment.expired / failed
  paid --> in_preparation: seller confirma
  paid --> cancelled: comprador/seller/operador cancela
  in_preparation --> shipped: seller despacha (NF-e + rastreio)
  in_preparation --> cancelled: cancelamento antes do envio
  shipped --> delivered: shipment.delivered / confirmação
  delivered --> completed: fim da janela de arrependimento sem disputa
  delivered --> in_dispute: disputa aberta (Fase 2)
  in_dispute --> completed: resolvida a favor do seller
  in_dispute --> refunded: resolvida com reembolso
  cancelled --> [*]
  completed --> [*]
  refunded --> [*]
```
Todo `→ cancelled` após `paid` dispara reembolso (payments) e estorno de estoque (offers).

## 4. Fluxo financeiro de um SellerOrder

```mermaid
flowchart LR
  A[payment.paid] -->|débito gateway_receivable<br/>crédito seller_pending<br/>crédito platform_commission| B((seller_pending))
  B -->|seller_order.completed| C((seller_available))
  C -->|payout.paid| D((seller_paid_out))
  B -->|cancelamento/reembolso| E[estorno proporcional]
  C -->|reembolso pós-liberação| F[débito seller_available<br/>pode ficar negativo]
```

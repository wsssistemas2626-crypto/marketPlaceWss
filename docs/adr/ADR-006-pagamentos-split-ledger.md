# ADR-006: Split no gateway (subcontas) + ledger interno de partidas dobradas

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
A plataforma intermedia pagamentos de terceiros. Receber todo o dinheiro na conta da plataforma e repassar
depois pode caracterizar atividade de subcredenciadora/instituição de pagamento (regulação do Banco Central)
e aumenta risco fiscal e operacional.

## Decisão
- Usar gateway com **split nativo e subcontas (recebedores)**: cada seller é um recebedor; o valor é dividido na
  cobrança; o saque do seller ocorre na subconta (MVP).
- Manter **ledger próprio de partidas dobradas** como fonte de verdade interna (comissões, saldos pendente/disponível,
  estornos, chargebacks), conciliado diariamente com o gateway.
- Nenhum dado de cartão em nossos servidores (tokenização no navegador, PCI SAQ-A).
- Gateway escolhido é decisão em aberto D2 — o port permite trocar.

## Alternativas consideradas
- **Conta única da plataforma + repasse via Pix** — descartada: risco regulatório e fiscal, capital de giro, operação manual.
- **Sem ledger (confiar no gateway)** — descartada: não teríamos visão de comissão, saldo, disputas e conciliação;
  troca de gateway perderia histórico.

## Consequências
**Positivas:** menor risco regulatório; dinheiro do seller não transita pela plataforma; auditoria completa.
**Negativas:** dependência de recursos do gateway (retenção de saldo, antecipação); onboarding financeiro do seller
depende do KYC do gateway; conciliação obrigatória.

## Quando revisitar
Volume que justifique tornar-se instituição de pagamento própria, ou necessidade de múltiplos gateways (Fase 3).
⚠️ Validar o modelo com assessoria jurídica/contábil antes do go-live.

## Atualização — multi-tenancy (ADR-012)
- **Cada tenant é o marketplace perante o gateway**: tem conta própria (credenciais no hub de integrações, escopo do
  tenant), seus sellers são recebedores dessa conta e a comissão vai para o recebedor do tenant. Padrão da decisão D8.
- A plataforma SaaS **não** toca o dinheiro dos sellers; cobra o tenant por assinatura + % de GMV (módulo `saas-billing`,
  decisão D7). Split adicional para a plataforma em cada venda é opcional e depende do gateway.
- Tenants diferentes podem usar gateways diferentes simultaneamente → o port e as suítes de contrato são obrigatórios.
- ⚠️ Com a plataforma apenas licenciando software, o risco regulatório de pagamento fica com cada tenant; se a
  plataforma passar a oferecer conta "de fábrica" (D8 alternativa), revisar com assessoria jurídica.

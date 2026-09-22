# 01 — Visão do Produto

## 1. Declaração de visão

Uma plataforma **SaaS multi-tenant** que permite a qualquer empresa (**tenant**) lançar e operar o próprio
marketplace multi-vendedor, com marca e domínio próprios. Em cada marketplace, um **operador** reúne muitos **vendedores (sellers)**
que vendem para **compradores** em uma vitrine única, com checkout unificado, pagamento com **split**
automático, gestão de frete e repasse financeiro. O núcleo é enxuto e **modular**; tudo que depende de
terceiros (pagamento, frete, nota fiscal, ERP, hubs, busca, notificações, antifraude) é **plugável**.

## 2. Benchmarks — o que copiamos de quem deu certo

| Referência | O que adotamos | Onde aparece |
|---|---|---|
| **Amazon / Mercado Livre (catálogo)** | Separação **Produto** (ficha única do catálogo) × **Oferta** (preço/estoque/condição de cada seller). Evita anúncios duplicados e habilita "buy box" no futuro. | ADR-007, módulos `catalog` + `offers` |
| **Mercado Livre / Shopee** | Reputação do vendedor por métricas (atraso, cancelamento, reclamação) e mediação de disputas pela plataforma. | Épicos E12, E13 (Fase 2) |
| **Magalu / Americanas (marketplace BR)** | Pedido do comprador dividido em **pedidos por seller** (entregas separadas), comissão por categoria, repasse após entrega + prazo de arrependimento. | RN-PED, RN-FIN |
| **Stripe Connect / Pagar.me / Mercado Pago** | Seller é uma **subconta** (recebedor) no gateway; split feito no ato da cobrança; plataforma mantém **ledger** próprio. | ADR-006 |
| **Shopify** | Plataforma "API-first" com **webhooks assinados**, API pública versionada e **Apps** de terceiros com escopos. | ADR-010, módulo `integrations` |
| **Shopify / VTEX / Mirakl (SaaS)** | Modelo SaaS: planos com módulos e limites, tenant com domínio próprio e tema, provisionamento self-service, app store. | ADR-012, módulo `tenancy`, `saas-billing` |
| **Mirakl / VTEX Marketplace** | Onboarding de seller com KYC e aprovação, importação de catálogo em massa, integração com ERPs e hubs (Bling, Tiny, Anymarket...). | Épicos E02, E17 |

## 3. Atores

| Ator | Descrição | Canal |
|---|---|---|
| **Staff da plataforma** | Nossa equipe: gerencia tenants, planos, cobrança SaaS, suporte (modo suporte auditado) | console (login Clerk, app separada) |
| **Admin do tenant** | Dono/gestor de um marketplace cliente; configura marca, domínio, integrações, comissões | admin (login Clerk, organização do tenant) |
| **Visitante** | Navega e busca sem login | storefront |
| **Comprador** | Pessoa física (CPF) ou jurídica (CNPJ) cadastrada que compra | storefront (login próprio, marca do tenant) |
| **Seller (titular)** | Empresa (CNPJ) ou MEI que vende; dona da loja | seller-center (login Clerk, organização do seller) |
| **Colaborador do seller** | Usuário com papel limitado dentro da loja (catálogo, pedidos, financeiro) | seller-center |
| **Operador – Moderação / Atendimento / Financeiro** | Equipe do tenant com papéis especializados | admin |
| **Integração de seller** | ERP/hub autenticado por API key agindo em nome de um seller | API pública |
| **Sistemas externos** | Gateway de pagamento, transportadoras, emissor fiscal, e-mail/SMS, busca | adapters |
| **Jobs do sistema** | Expiração de reservas, liberação de repasses, reindexação | worker |

## 4. Módulos (bounded contexts)

`tenancy` · `saas-billing` · `identity` · `sellers` · `catalog` · `offers` (preço + estoque) · `search` · `cart` · `checkout` · `orders` ·
`payments` · `ledger` (financeiro/comissões/repasses) · `shipping` · `fiscal` · `promotions` · `reviews` ·
`messaging` · `disputes` · `notifications` · `cms` · `integrations` (hub, webhooks, API keys) · `audit` · `reporting`

Detalhes em `arquitetura/02-modulos.md`.

## 5. Escopo por fase

| Fase | Objetivo de negócio | Módulos |
|---|---|---|
| **0 — Fundação** | Esqueleto técnico que torna o resto barato, **com isolamento de tenant desde a primeira tabela** | monorepo, platform (outbox, eventos, auth guards, observabilidade, **TenantContext + RLS**), CI |
| **1 — MVP transacional** | Staff provisiona um tenant; o tenant configura marca/domínio/gateway; um seller aprovado cadastra produto, o comprador encontra, paga (Pix/cartão) e recebe; o tenant retém comissão | tenancy (provisionamento, domínios, tema, planos/entitlements), console, identity, sellers, catalog, offers, search, cart, checkout, orders, payments, ledger, shipping (1 provedor), notifications (e-mail), audit, integrations (webhooks de saída), admin básico |
| **2 — Confiança e pós-venda + SaaS comercial** | Avaliações, perguntas, devoluções, disputas, cupons, repasse automático, NF-e; **self-service de tenant, cobrança SaaS e offboarding** | saas-billing, reviews, messaging, disputes, promotions, fiscal, ledger (payouts automáticos), reputação |
| **3 — Ecossistema** | Escala via integrações: API pública completa, Apps OAuth, ERPs/hubs, importação em massa, múltiplos gateways/transportadoras | integrations (OAuth apps), adapters diversos, reporting |
| **4 — Crescimento** | Monetização extra e conversão | produtos patrocinados (ads), buy box, recomendações, fulfillment, fidelidade |

## 6. Fora de escopo (até decisão contrária)

- App mobile nativo (storefront será PWA responsivo).
- Leilão, serviços agendáveis, assinaturas recorrentes, produtos digitais.
- Internacionalização / múltiplas moedas (somente BRL, pt-BR).
- Logística própria (a plataforma cota e gera etiquetas via parceiros; não opera armazém).
- Código ou deploy customizado por tenant; conta de comprador compartilhada entre marketplaces de tenants diferentes.

## 7. ⚠️ Suposições feitas

1. **SaaS multi-tenant (D1 resolvida → ADR-012)**: modelo pool com RLS. Usuários (compradores, sellers,
   operadores) são **por tenant** — a mesma pessoa em dois marketplaces tem duas contas. Cada tenant contrata
   o próprio gateway, transportadora e e-mail (credenciais próprias). Sem código customizado por tenant.
1b. **Login com Clerk (ADR-013)** para staff, operadores e sellers (painéis, cenário B2B da Clerk). Compradores usam
   login próprio porque o cenário "Platforms" (usuários isolados por cliente, domínio e marca próprios) ainda não é
   suportado pela Clerk. Consequência: um seller que vende em dois marketplaces usa **uma** conta Clerk e alterna
   entre organizações; um comprador tem contas separadas por marketplace.
2. **Produtos físicos**, varejo generalista, mercado brasileiro.
3. **Sellers são PJ ou MEI** (CNPJ obrigatório). Pessoa física vendendo fica fora do MVP (questão fiscal).
4. **Cada seller emite a própria NF-e** (a plataforma é intermediadora, não vendedora).
5. Escala alvo no 1º ano: até **50 tenants**; o maior com **500 sellers, 200 mil SKUs, 50 mil pedidos/mês**; somando
   todos, **2 M SKUs e 300 mil pedidos/mês**, com pico de 10× em datas promocionais (todos os tenants ao mesmo tempo na Black Friday).
6. Time pequeno (1–4 devs + Claude Code). Por isso monólito modular, não microsserviços.
7. **Infraestrutura na Railway (ADR-014)**: banco, cache, storage e todos os apps; domínios próprios de tenants via
   Cloudflare for SaaS. Região de dados fora do Brasil (registrar na política de privacidade).

## 8. Decisões em aberto (resolver antes da fase indicada)

| ID | Decisão | Impacto | Resolver até |
|---|---|---|---|
| ~~D1~~ | ~~Operador único ou SaaS?~~ **Resolvida: SaaS multi-tenant (ADR-012)** | — | — |
| D2 | Gateway de pagamento com split no MVP (Pagar.me, Mercado Pago, Asaas, Iugu, Stripe)? | Adapter e onboarding financeiro do seller | Fase 1 (US-040) |
| D3 | Comissão: só % por categoria, ou também taxa fixa por item / mensalidade de plano? | RN-FIN, ledger | Fase 1 |
| D4 | Quem contrata o frete (seller ou plataforma)? | Módulo shipping | Fase 1 |
| D5 | Prazo de repasse ao seller (D+X após entrega) | RN-FIN-06 | Fase 1 |
| D6 | Moderação de produto prévia (antes de publicar) ou posterior (amostragem/denúncia)? — agora **configurável por tenant** | Fluxo de catálogo | Fase 1 |
| D7 | Modelo de cobrança do SaaS: assinatura fixa, % do GMV, ou ambos (padrão: ambos)? Split automático para a plataforma em cada venda? | saas-billing | Fase 2 |
| D8 | Gateway: cada tenant traz a própria conta (padrão) ou a plataforma oferece conta "de fábrica" como facilitadora? | Onboarding do tenant, risco regulatório | Fase 1 |
| D9 | Provisionamento: somente pela equipe (padrão na Fase 1) ou self-service com trial (Fase 2)? | console, tenancy | Fase 1 |
| ~~D10~~ | ~~Provedor de domínio próprio + TLS~~ **Resolvida: Cloudflare for SaaS na frente da Railway (ADR-014), validar na US-085** | — | — |
| D11 | Compradores: manter contas isoladas por marketplace (padrão, ADR-013) ou oferecer **conta única de comprador** em todos os marketplaces via Clerk? | identity, LGPD, white-label | Antes de US-010 |

Enquanto não decididas, o Claude Code deve usar os **valores padrão** marcados nos documentos
(todos configuráveis via tabela de configuração, nunca hard-coded).

## 9. Glossário

- **Tenant:** cliente do SaaS que opera um marketplace; unidade de isolamento de dados, configuração e cobrança.
- **Plano / entitlements:** conjunto de módulos habilitados e limites (sellers, SKUs, requisições) de um tenant.
- **Célula:** implantação completa (banco + processos); tenants compartilham a célula padrão (modelo pool).
- **Produto (catálogo):** ficha única de um item (título, atributos, imagens, GTIN). Pode ter **variações**.
- **Variação:** combinação concreta de atributos (ex.: camiseta azul M).
- **Oferta:** proposta de um seller para vender uma variação: preço, estoque, condição, prazo de manuseio. Tem SKU do seller.
- **Pedido (Order):** o que o comprador fecha no checkout; pode conter itens de vários sellers.
- **Pedido do seller (SellerOrder / pacote):** fração do pedido que cabe a um seller; unidade de envio, fiscal e repasse.
- **Split:** divisão do valor pago entre sellers e plataforma no gateway.
- **Ledger:** livro-razão de partidas dobradas que registra todo movimento financeiro interno.
- **Repasse (Payout):** transferência do saldo disponível do seller para a conta bancária dele.
- **Comissão (take rate):** percentual retido pela plataforma sobre a venda.
- **Port / Adapter:** interface definida pelo domínio / implementação concreta de um provedor externo.
- **Outbox:** tabela em que eventos são gravados na mesma transação do dado, para publicação confiável.

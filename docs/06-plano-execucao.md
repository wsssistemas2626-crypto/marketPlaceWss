# 06 — Plano de Execução com Claude Code

Estratégia: **fatias verticais pequenas**, cada uma terminando verde no CI. O Claude Code trabalha uma story
por vez, em branch própria, seguindo o `CLAUDE.md`. Ao final de cada marco, você (humano) revisa e faz merge.

## Como conduzir as sessões

- **Uma sessão = um marco ou uma story.** Contexto enxuto rende mais que sessões gigantes. Use `/clear` entre stories.
- **Peça plano antes de código** em stories M/G (modo de planejamento do Claude Code), revise o plano e só então aprove.
- **Testes primeiro nos módulos financeiros** (ledger, payments, offers/reserva): peça os testes dos cenários Gherkin
  antes da implementação.
- **Nunca pule o CI local**: `pnpm lint typecheck test` antes de declarar pronto.
- **Registre desvios**: se o agente precisar decidir algo não documentado, ele cria ADR `Proposto`; você aprova.

---

## Fase 0 — Fundação (US-001 a US-009 + US-070 a US-075 + US-082 + US-084)

**Pré-requisitos:** `docs/07-checklist-pre-desenvolvimento.md` seção A antes de começar e seção B antes da US-084.

**Prompt inicial (cole na primeira sessão):**
```
Leia CLAUDE.md, docs/01-visao-produto.md, docs/arquitetura/01-visao-arquitetura.md,
docs/arquitetura/02-modulos.md, docs/arquitetura/06-multi-tenancy.md e todos os ADRs (atenção
especial ao ADR-012). Depois execute a Fase 0 do docs/06-plano-execucao.md, story por story, na ordem:
US-001 → US-002 → US-003 → US-070 → US-004 + US-071 → US-005 + US-072 → US-006 → US-007 →
US-073 → US-009 → US-082 (Clerk) → US-075 → US-074 → US-008 → US-084 (Railway).
Multi-tenancy não é uma camada adicionada depois: o TenantContext e o RLS precisam existir antes da
primeira tabela de negócio. Para cada story: apresente o plano, implemente, rode lint/typecheck/test
e marque o checkbox no docs/05-backlog.md. Não crie módulos de negócio ainda. Crie um módulo de
exemplo "_template" em packages/modules (domain/application/infrastructure/http/events/index.ts)
com um agregado fictício COM tenant_id e RLS, testes (incluindo cross-tenant), schema Drizzle
próprio, publicação de evento via outbox e um consumidor idempotente que restaura o TenantContext.
```
**Critério de saída da fase:**
- `docker compose up -d && pnpm dev` funcionando; `/health` ok.
- Módulo `_template` demonstra o fluxo completo: HTTP → caso de uso → repositório → outbox → worker → consumidor, **sempre no tenant correto**.
- `loja-a.localhost` e `loja-b.localhost` resolvem tenants diferentes; suíte de isolamento verde; consulta sem contexto retorna 0 linhas.
- Lint de fronteiras falha ao violar regra (teste prova).
- Adapters fake registrados no hub para todas as ports da Fase 1.
- CI verde no GitHub Actions.
- Merge no `main` publica staging na Railway; PR abre ambiente efêmero com seed; api conecta com role sem superusuário.

---

## Fase 1 — MVP transacional

Ordem pensada para ter algo demonstrável cedo e deixar dinheiro para quando a base estiver estável.

| Marco | Stories | Resultado demonstrável |
|---|---|---|
| **1.0 Tenancy de produto** | US-085 (spike, primeiro!), US-076, US-077, US-080, US-081 (US-078 e US-079 no marco 1.10) | Staff cria um tenant no console; tenant aplica sua marca no subdomínio |
| **1.1 Identidade** | US-013, US-083 (painéis/Clerk) → US-010 → US-012, US-014 (compradores) | Operador e seller entram pela Clerk com papéis corretos; comprador tem conta isolada por tenant |
| **1.2 Sellers** | US-015 → US-019 (US-016 com gateway fake) | Loja solicitada, aprovada e visível |
| **1.3 Catálogo** | US-020 → US-024 | Seller cadastra produto; operador modera; página de produto no ar |
| **1.4 Ofertas + Busca** | US-026 → US-032 | Produto com oferta aparece na busca com filtros |
| **1.5 Carrinho + Frete** | US-033, US-034, US-054 (fake), US-055 | Carrinho multi-seller com frete cotado |
| **1.6 Pedido + Pagamento (fake)** | US-028, US-035, US-037, US-041, US-043, US-044 | Compra ponta a ponta com gateway fake (Pix simulado) |
| **1.7 Ledger** | US-049 → US-053 | Comissão e saldo do seller corretos; extrato |
| **1.8 Pós-venda** | US-045 → US-048, US-056 | Seller despacha, entrega confirmada, pedido concluído, saldo liberado |
| **1.9 Plataforma** | US-058 → US-065 | E-mails, webhooks, API pública + SDK, audit, backoffice |
| **1.10 Provedores reais** | US-079, US-040, US-036, US-054 (real), US-042, US-078 | Cada tenant configura o próprio gateway/transportadora em sandbox; domínio próprio com TLS |
| **1.11 Endurecimento** | US-086 | Teste de carga (k6) contra RNF-PERF, Lighthouse/axe, revisão de segurança, runbooks |

**Prompt por story (ou use `/implementar-story US-0xx`):**
```
Implemente a US-0xx de docs/05-backlog.md. Leia os RF/RN/RNF referenciados e a seção do módulo em
docs/arquitetura/02-modulos.md. Primeiro me mostre o plano: arquivos, migrações, eventos publicados e
consumidos, endpoints e testes (um por cenário Gherkin). Aguarde minha aprovação antes de codar.
```

**Prompt de E2E do marco 1.6:**
```
Crie um teste Playwright "compra multi-seller com Pix" que: cria 2 sellers aprovados via seed,
publica 1 produto com oferta para cada um, faz login como comprador, adiciona os dois itens,
escolhe frete, paga com Pix (gateway fake), simula o webhook "paid" pelo endpoint de testes do
adapter fake, e verifica: 1 Order, 2 SellerOrders "paid", estoque baixado, lançamentos no ledger
com soma zero e e-mails no Mailpit. Execute o mesmo fluxo em paralelo em loja-a e loja-b e
verifique que nenhum dado, evento, e-mail ou webhook de um tenant aparece no outro.
```

**Critério de saída da Fase 1 (go-live beta):**
- Fluxo E2E verde com provedores reais em sandbox **em dois tenants simultâneos com gateways diferentes**.
- Teste de carga de vizinho barulhento (RNF-TEN-02) atendido.
- RNF-PERF-01/03 e RNF-PERF-04 medidos e atendidos.
- Conciliação manual de 50 pedidos de teste sem divergência.
- Revisão jurídica: termos de uso, política de privacidade, contrato de intermediação, modelo de split (ADR-006).

---

## Fase 2 — Confiança e pós-venda
Início da fase: peça ao Claude Code para **detalhar os épicos E12–E17 em user stories** no mesmo formato da
Fase 1 (com Gherkin), atualizar `02-requisitos-funcionais.md` se necessário, e só então implementar.
```
Usando o mesmo formato do docs/05-backlog.md, detalhe os épicos E12 a E17 em user stories com
critérios de aceite Gherkin, referenciando RF/RN/RNF existentes. Aponte ambiguidades e suposições
com "⚠️ Suposição:". Não implemente nada ainda.
```
Prioridade sugerida: E00S SaaS comercial (se houver venda para clientes pagantes) → E13 Disputas → E16 Fiscal → E17a Repasse/conciliação → E14 Avaliações → E15 Cupons → E12 Reputação.

## Fase 3 — Ecossistema
Apps OAuth (implica ADR de OIDC provider — ADR-009), conectores ERP (comece por Bling e Tiny, os mais usados por
PMEs), importação em massa, multi-gateway, BI. Cada conector ERP = um adapter de `ErpConnectorPort` + jobs de sincronização.

## Fase 4 — Crescimento
Ads, buy box, recomendações, IA de conteúdo (Claude API via `ContentAssistPort`), fulfillment.

---

## Revisões obrigatórias
- **Fim de cada marco:** `/revisar-arquitetura`.
- **Antes de qualquer merge em módulos financeiros:** revisão humana linha a linha de ledger/payments.
- **Mensal:** atualizar ADRs com status real; revisar decisões em aberto (D1–D6).

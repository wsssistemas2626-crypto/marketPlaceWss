---
description: Cria um adapter para um provedor externo implementando um port existente
argument-hint: <categoria> <provedor>   (ex.: payment pagarme)
---
Crie um adapter para: $ARGUMENTS.

1. Leia `docs/arquitetura/03-integracoes.md` e localize o port da categoria (e a suíte de contrato dele).
2. Pesquise a documentação oficial do provedor (endpoints, autenticação, webhooks, sandbox, limites) e me mostre o
   mapeamento port → API do provedor, destacando operações do port que o provedor NÃO suporta e como tratá-las.
   Aguarde aprovação.
3. Crie `packages/adapters/<categoria>-<provedor>` seguindo o checklist "Como adicionar um provedor":
   - implementação do port usando `ResilientHttpClient` de `@mkt/platform` (sem vazar tipos do SDK)
   - schema Zod das credenciais/configuração (as credenciais são **por tenant**; a factory recebe a config do tenant)
   - `parseWebhook` com validação de assinatura, se aplicável
   - testes: suíte de contrato com HTTP mockado (msw) + teste opcional contra sandbox (pulado sem credenciais)
4. Registre no resolver da categoria e documente em `docs/integracoes/<provedor>.md` (setup, URLs de webhook,
   limitações conhecidas).
5. Rode lint/typecheck/test.

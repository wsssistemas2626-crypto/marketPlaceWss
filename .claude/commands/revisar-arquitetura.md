---
description: Revisa o código contra as regras de arquitetura e os requisitos não funcionais
---
Faça uma revisão de arquitetura do estado atual do repositório. NÃO altere código; produza um relatório.

Verifique e reporte, priorizando por impacto (Crítico / Alto / Médio / Baixo):
0. **Isolamento de tenant (sempre Crítico):** tabela com `tenant_id` sem RLS forçado; uso do cliente/role privilegiado
   fora de migrações, outbox relay e `@PlatformJob`; `tenantId` lido de body/query/header; query fora de `withTenantTx`;
   evento/job sem `tenantid`; chave de cache/storage/índice sem prefixo; adapter singleton com credencial global;
   `if` específico para um tenant; rotas fora da suíte de isolamento.
1. **Fronteiras:** imports entre módulos fora do `index.ts`, acesso a tabelas de outro schema, ciclos de dependência.
2. **Domínio:** lógica de negócio fora de `domain/`/`application/`; uso de framework/I/O em `domain/`; estados
   sem máquina de estados explícita.
3. **Dinheiro:** uso de float, arredondamento fora de `Money`, lançamentos de ledger que não somam zero, updates em
   tabelas imutáveis.
4. **Integrações:** SDK de terceiro importado em módulo; chamada externa sem timeout/retry/circuit breaker;
   chamada externa dentro de transação; port sem adapter fake ou sem suíte de contrato.
5. **Eventos:** evento publicado fora do outbox; consumidor não idempotente; evento sem schema versionado em contracts.
6. **Autenticação (ADR-013):** SDK da Clerk importado fora do adapter/apps Next; rota de painel sem conferência
   organização → tenant no banco; claims usadas sem validar assinatura/azp; rota de comprador aceitando token Clerk
   ou vice-versa; dados de negócio em metadata da Clerk.
6b. **Infraestrutura (ADR-014):** conexão de runtime com superusuário ou role com BYPASSRLS; migração fora do pre-deploy
   ou com role errado; app sem `PORT`/`::`; BullMQ sem `family: 0`; SIGTERM não tratado; `SET` de sessão (deve ser SET LOCAL);
   segredo em Dockerfile/ARG; serviço interno com domínio público; `railway.json` sem healthcheck/watchPatterns.
7. **Segurança/LGPD:** rotas sem guard; possíveis IDOR (seller acessando recurso de outra loja); PII em logs;
   segredos no código; endpoints de escrita sem `Idempotency-Key` quando exigido.
8. **Testes:** cenários Gherkin de stories concluídas sem teste correspondente; cobertura abaixo de 80% em domain/application.
9. **Docs:** divergência entre código e `docs/arquitetura/*`, OpenAPI ou catálogo de eventos.

Formato: tabela de achados (ID, severidade, local, problema, recomendação) + lista das 5 ações prioritárias.
Salve em `docs/revisoes/revisao-<data>.md`.

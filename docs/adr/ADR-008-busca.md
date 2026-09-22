# ADR-008: Meilisearch atrás de SearchPort, alimentado por eventos

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
Busca com tolerância a erros, facetas e baixa latência é crítica para conversão; o Postgres não deve carregar essa carga.

## Decisão
Meilisearch como motor inicial (simples de operar, facetas e typo tolerance nativos), acessado via `SearchIndexPort`,
indexado por eventos com documento desnormalizado. Fallback para listagem no Postgres se indisponível.

| Critério | Meilisearch | OpenSearch | Algolia |
|---|---|---|---|
| Operação | Simples | Complexa | Nenhuma (SaaS) |
| Relevância pronta | Boa | Configurável | Excelente |
| Custo | Baixo | Médio | Alto em escala |
| Escala > 10 M docs / analytics | Limitada | Excelente | Excelente |

## Consequências
Rápido para o MVP; se precisarmos de relevância avançada, learning-to-rank ou > 10 M documentos, trocar adapter.

## Quando revisitar
> 5 M documentos, necessidade de ranking personalizado ou agregações analíticas complexas → OpenSearch/Algolia.

## Atualização — multi-tenancy (ADR-012)
Um índice por tenant (`products_{tenantId}`) em vez de um índice único filtrado: isolamento natural, sinônimos e
ranking por tenant, reindexação e purge por tenant triviais. O adapter recebe o tenant do contexto; nunca aceita
nome de índice vindo de fora. Revisitar se o número de tenants passar de algumas centenas por instância do
Meilisearch (sharding por grupo de tenants ou OpenSearch com routing por tenant).

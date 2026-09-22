# ADR-007: Catálogo no modelo Produto × Oferta

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
Em marketplaces, o mesmo item é vendido por vários sellers. Modelo "cada seller cria seu anúncio" (Shopee, eBay antigo)
gera duplicidade, busca poluída e dificulta comparação. Modelo de catálogo (Amazon, Mercado Livre catálogo) centraliza
a ficha e compara ofertas.

## Decisão
`Product` (+ `Variant`) é a ficha única, moderada, pertencente ao catálogo. `Offer` é do seller (preço, estoque,
condição, SKU próprio) e aponta para uma `Variant`. GTIN duplicado reaproveita o produto (RN-CAT-02). A página de
produto mostra a melhor oferta e "outras ofertas" (buy box completo na Fase 4).

## Alternativas consideradas
- **Anúncio por seller** — descartada: duplicidade e SEO ruim; migrar depois é caro.

## Consequências
**Positivas:** catálogo limpo, SEO, comparação de preço, base para buy box e ads.
**Negativas:** disputa sobre "quem é dono" da ficha e edição concorrente → edição por seller criador + moderação;
sugestões de outros sellers na Fase 3.

## Quando revisitar
Se o nicho for de itens únicos (artesanato, usados), permitir produto "exclusivo do seller" como flag.

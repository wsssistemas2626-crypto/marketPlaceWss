# ADR-005 — Representação de dinheiro, quantidades e arredondamento

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
JavaScript não tem tipo decimal nativo; `0.1 + 0.2 !== 0.3`. Erros de centavo em ERP são inaceitáveis.

## Decisão
- `libs/shared/kernel` expõe `Money` (valor + moeda, padrão `BRL`), `Quantity` e `Percentage`,
  imutáveis, baseados em `decimal.js`.
- Tipos "branded" impedem passar `number` onde se espera `Money`.
- Banco: `numeric(19,4)` para dinheiro, `numeric(19,6)` para quantidades, `numeric(9,4)` para percentuais.
- API/JSON: decimais como string. Conversão só nas bordas (repositório e controller).
- Cálculo interno com 4 casas; arredondamento para 2 casas apenas na apresentação e nos
  pontos definidos por regra de negócio (ex.: valor de título), usando **meia-par (HALF_EVEN)**,
  compatível com a ABNT NBR 5891, salvo regra específica documentada no módulo.
- Rateios (ex.: dividir custo entre centros) usam algoritmo de maior resto para a soma fechar exatamente.
- Operações entre moedas diferentes lançam erro (conversão cambial fora do MVP).

## Consequências
- (+) Precisão garantida e verificável por teste.
- (−) Código mais verboso que aritmética com `number`.

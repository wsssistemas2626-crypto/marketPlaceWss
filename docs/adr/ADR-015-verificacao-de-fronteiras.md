# ADR-015: Verificação de fronteiras com regras nativas do ESLint (em vez de eslint-plugin-boundaries)

**Status:** Proposto · **Data:** 2026-09-22 · **Afeta:** US-002, CLAUDE.md §4, Definition of Done

## Contexto

A US-002 previa `eslint-plugin-boundaries` (ou `dependency-cruiser`) para impedir que um módulo importe
arquivos internos de outro, que `domain/` use framework/I/O e que um SDK de terceiro entre em
`packages/modules/*`. Ao implementar (versão 7.2.0 do plugin, set/2026):

- A API antiga (`boundaries/element-types`, `boundaries/external`) ainda funciona, mas imprime ~12 avisos de
  depreciação a cada execução e **não acusou** `@nestjs/common` dentro de `domain/`: pacotes que existem em
  `node_modules` não foram classificados como dependência externa nos nossos testes.
- A API nova (`boundaries/dependencies` com `policies`) depende de seletores e de sintaxe de template
  (`{{from.captured.*}}`, negação de valores capturados) que só estão documentados no site do projeto;
  as combinações testadas ou não dispararam nenhuma regra ou falharam com `Invalid entity selector`.
- `no-restricted-imports` com lista branca (`group: ['**', '!@mkt/shared-kernel']`) é inviável: o pacote
  `ignore` segue a semântica do gitignore, em que não se re-inclui um caminho cujo "diretório pai" já foi
  excluído. Isso está verificado em teste.

## Decisão

Verificar as fronteiras em duas frentes, sem dependência de plugin:

1. **`no-restricted-imports` por caminho de arquivo** (`packages/config/eslint/boundaries.js`), rodado da raiz
   por `pnpm lint:boundaries` sobre `packages/` e `apps/`: cross-module (fachada `@mkt/modules-<outro>`
   apenas), direção das camadas (`domain/` e `application/` não veem `infrastructure/`, `http/`, `events/`),
   pureza do domínio (sem framework, I/O, driver ou SDK) e o SDK da Clerk restrito ao adapter
   `identity-clerk` e aos apps Next.js (ADR-013).
2. **Lista branca de dependências no `package.json` de cada módulo**
   (`packages/config/scripts/check-module-dependencies.mjs`). Como o pnpm só permite importar o que o pacote
   declara, essa checagem pega **qualquer** SDK de terceiro — inclusive os que a lista do ESLint não enumera.

Cada regra tem teste automatizado sobre fixtures em `packages/config/test/fixtures` (um mini-repositório com
violações propositais), então a suíte falha se alguma regra parar de pegar a violação.

## Consequências

- **Bom:** zero dependência nova, zero aviso de depreciação, regras legíveis e cobertas por teste; a checagem
  de `package.json` é mais forte que a análise de imports para o objetivo do §4.4.
- **Ruim:** as regras são baseadas em caminho, não em um grafo de elementos — a lista de frameworks/SDKs
  conhecidos no ESLint é heurística (o `package.json` é a rede de segurança) e um layout de pastas diferente
  do previsto em CLAUDE.md §3 passaria despercebido.
- **Reversível:** se o `eslint-plugin-boundaries` estabilizar a API v7 (ou se adotarmos `dependency-cruiser`),
  a troca fica restrita a `packages/config/eslint/boundaries.js`; os testes de fixture continuam valendo.

## Alternativas consideradas

| Alternativa | Por que não agora |
|---|---|
| `eslint-plugin-boundaries` API legada | Furo comprovado na detecção de dependência externa + ruído de depreciação |
| `eslint-plugin-boundaries` API v7 | Seletores/templates sem documentação acessível; tentativas não dispararam as regras |
| `dependency-cruiser` | Ferramenta a mais no CI para o mesmo resultado; pode ser retomada se precisarmos de grafo/visualização |

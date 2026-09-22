---
description: Modo autônomo — executa as próximas stories em sequência até o próximo checkpoint
argument-hint: (opcional) "até US-xxx" ou "só a próxima"
---
Você está em **modo autônomo supervisionado**. Argumentos: $ARGUMENTS

## Antes de começar
1. Leia `CLAUDE.md`, `docs/progresso.md` (estado, bloqueios e **Instruções do humano**) e a seção do checkpoint atual.
2. Se não houver branch de trabalho para o checkpoint atual, crie a partir do `main` atualizado:
   `git switch main && git pull && git switch -c fase-<n>/c<k>-<slug>` e registre em `docs/progresso.md`.
3. Confira em `docs/07-checklist-pre-desenvolvimento.md` o que as stories do checkpoint exigem.

## Para cada story do checkpoint, em ordem
1. Leia a story em `docs/05-backlog.md` e todos os RF/RN/RNF/ADRs/documentos de arquitetura referenciados.
2. Escreva o plano em `docs/planos/<US-xxx>.md` (arquivos por camada, migrações, eventos, endpoints, testes por cenário
   Gherkin, suposições). **Não espere aprovação** — o plano fica registrado para a revisão no checkpoint.
3. Se a story estiver marcada (G), quebre em partes no próprio plano e implemente parte por parte.
4. Implemente de dentro para fora com testes (domínio → aplicação → infraestrutura → HTTP → UI).
5. Rode `pnpm lint && pnpm typecheck && pnpm test` até ficar verde, **sem** desabilitar regras ou testes.
6. Se faltar conta/chave externa: use o adapter fake, registre em "Bloqueios e pendências" e siga.
7. Commit único da story: `feat(<escopo>): <US-xxx> <resumo>` (Conventional Commits). Marque o checkbox no backlog.
8. Atualize `docs/progresso.md` (Concluído, Próxima story, Última atualização).

## Quando PARAR e me chamar (não continue sozinho)
- Fim do checkpoint atual → faça `git push -u origin <branch>`, abra o PR (`gh pr create --fill` se disponível)
  e escreva o **relatório do checkpoint** (abaixo).
- Decisão arquitetural não coberta pelos docs → crie ADR "Proposto", registre em progresso e pare.
- Três tentativas sem conseguir deixar testes/lint verdes na mesma story → pare com diagnóstico.
- Qualquer ação em `production`, exclusão de recursos, ou necessidade de segredo que não está no ambiente.
- O argumento pedir para parar antes ("só a próxima", "até US-xxx").

## Relatório do checkpoint (ao parar)
1. Stories concluídas, com link para os planos em `docs/planos/`.
2. Como verificar manualmente (comandos e URLs exatos).
3. Suposições feitas e decisões pequenas tomadas.
4. Bloqueios que dependem do humano.
5. Riscos/dívidas técnicas percebidas.
6. Rode `/revisar-arquitetura` mentalmente sobre o diff do checkpoint e liste achados Críticos/Altos.

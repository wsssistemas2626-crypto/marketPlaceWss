# ADR-001: Monólito modular em vez de microsserviços

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
Marketplace com ~20 bounded contexts, time pequeno (1–4 devs + Claude Code), necessidade de entregar o MVP
rápido e de manter consistência forte em fluxos financeiros. Escala do 1º ano (50 mil pedidos/mês, picos 10×)
é atendida por uma única aplicação escalada horizontalmente.

## Decisão
Um monólito modular: um repositório, um deploy de backend (processos `api` e `worker`), módulos com fronteiras
rígidas verificadas por lint, schema de banco por módulo (ADR-003) e comunicação por facades + eventos (ADR-004).

## Alternativas consideradas
- **Microsserviços desde o início** — descartada: custo operacional (deploys, observabilidade distribuída,
  transações distribuídas/sagas, contratos de rede) desproporcional ao time; depuração mais difícil para
  desenvolvimento assistido por IA.
- **Monólito tradicional em camadas (sem fronteiras)** — descartada: vira "big ball of mud"; impossibilita extrair
  módulos no futuro e dificulta que o agente trabalhe com contexto limitado.
- **Plataforma pronta (Medusa, Mercur, Saleor, VTEX, Mirakl)** — ver Consequências; mantida como alternativa válida
  caso o objetivo seja time-to-market máximo em vez de controle total.

## Consequências
**Positivas:** simplicidade operacional; transações locais quando dentro do módulo; refatoração barata;
contexto de código navegável pelo Claude Code; caminho claro para extração (cada módulo já tem schema, facade e eventos).
**Negativas:** deploy único (falha em um módulo afeta todos); escala não independente por módulo; disciplina de
fronteiras depende de tooling.

## Quando revisitar
Um módulo precisar de escala/stack muito diferente (ex.: busca/recomendação), ou mais de 3 times trabalhando em
paralelo com conflitos frequentes de deploy, ou > 1 M pedidos/mês.

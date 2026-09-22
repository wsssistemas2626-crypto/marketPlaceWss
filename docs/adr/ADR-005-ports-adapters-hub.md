# ADR-005: Ports & adapters + Integration Hub para toda integração externa

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
Requisito central: o sistema deve estar pronto para receber as mais diversas integrações e trocar provedores
(pagamento, frete, fiscal, comunicação, busca, ERPs) sem reescrever o domínio.

## Decisão
Arquitetura hexagonal: cada necessidade externa é um **port** no módulo dono, com adapters em pacotes separados
(`packages/adapters/*`), adapter fake obrigatório e suíte de contrato compartilhada. O módulo `integrations`
mantém o registro de provedores, credenciais criptografadas e roteamento, e o container de DI injeta o adapter ativo.
Detalhes em `docs/arquitetura/03-integracoes.md`.

## Alternativas consideradas
- **Chamar SDKs direto nos casos de uso** — descartada: acopla o domínio ao provedor; troca = reescrita.
- **iPaaS externo (n8n, Zapier, Make) como camada de integração** — descartada como núcleo (latência, controle,
  custo por execução), mas **suportada** como consumidora da API pública/webhooks.

## Consequências
**Positivas:** trocar/adicionar provedor = novo pacote + configuração (RNF-MAN-03); testes rápidos com fakes;
multi-provedor possível. **Negativas:** o port é o "menor denominador comum" — recursos exclusivos de um provedor
exigem extensão explícita do port; mais código de mapeamento.

## Quando revisitar
Se um provedor for estratégico a ponto de o port restringir o produto, criar port especializado para ele.

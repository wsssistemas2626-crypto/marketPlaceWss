# 04 — Regras de Negócio

Valores marcados com **[config]** são resolvidos na hierarquia **padrão da plataforma → plano → tenant**
(módulo `platform`/`tenancy`), editáveis pelo admin do tenant, com o padrão indicado. Nunca hard-coded.
Todas as regras abaixo valem **dentro de um tenant**.

## Tenants (RN-TEN)
- **RN-TEN-01** Slug do tenant: 3–30 caracteres `[a-z0-9-]`, único na plataforma, imutável após ativação; lista de slugs reservados (www, api, admin, console...).
- **RN-TEN-02** Tenant só aceita pedidos quando `active`/`trial` **e** possui gateway de pagamento configurado e testado.
- **RN-TEN-03** Limites do plano são verificados na criação (seller, oferta, usuário, domínio); exceder → `plan_limit_reached`. Downgrade não apaga dados: bloqueia novas criações até o uso voltar ao limite.
- **RN-TEN-04** Tenant suspenso: storefront indisponível, pedidos em andamento continuam processando eventos (pagamento, entrega, repasse) — o dinheiro dos sellers nunca fica preso pela suspensão do tenant.
- **RN-TEN-05** E-mails saem do domínio do tenant apenas após verificação SPF/DKIM; antes disso, remetente da plataforma com nome do tenant.
- **RN-TEN-06** Seller e comprador pertencem a um único tenant; a mesma empresa pode se cadastrar em vários tenants como sellers distintos.

## Sellers (RN-SEL)
- **RN-SEL-01** Seller precisa de CNPJ ativo. Status do CNPJ ≠ "ativa" bloqueia aprovação.
- **RN-SEL-02** Seller só publica ofertas após `approved` **e** recebedor criado no gateway com sucesso.
- **RN-SEL-03** Seller suspenso: ofertas são despublicadas imediatamente; pedidos em aberto seguem o fluxo; saldo fica retido até a reativação ou decisão do operador.
- **RN-SEL-04** Alteração de dados bancários exige 2FA e gera retenção de repasses por **48 h [config]** (antifraude de sequestro de conta).

## Catálogo e ofertas (RN-CAT / RN-EST)
- **RN-CAT-01** Produto só pode ser publicado em categoria folha, com todos os atributos obrigatórios preenchidos e ao menos 1 imagem.
- **RN-CAT-02** GTIN, quando informado, é único no catálogo: se já existir, a nova oferta é vinculada ao produto existente.
- **RN-CAT-03** Moderação prévia é o padrão **[config]**; sellers com reputação "verde" e > 50 vendas podem ser marcados como "publicação automática".
- **RN-CAT-04** Palavras/categorias proibidas (lista do operador) bloqueiam publicação automaticamente.
- **RN-EST-01** Estoque disponível = estoque físico − reservas ativas. Nunca negativo.
- **RN-EST-02** Reserva criada ao gerar a cobrança, com TTL = expiração do Pix (**30 min [config]**) ou **15 min [config]** para cartão; liberada automaticamente ao expirar.
- **RN-EST-03** "Preço de" só é exibido se o preço atual for pelo menos 5% menor e o "preço de" tiver sido praticado nos últimos 30 dias (proteção ao consumidor contra desconto fictício).

## Carrinho e checkout (RN-CHK)
- **RN-CHK-01** Preço e estoque são revalidados no momento de criar o pedido; divergência devolve o carrinho com as alterações destacadas, sem criar pedido.
- **RN-CHK-02** Valor mínimo do pedido: **R$ 10,00 [config]**.
- **RN-CHK-03** Parcelamento de cartão: até **12x [config]**; sem juros até **3x [config]** (custo da plataforma/seller definido em D3); parcela mínima **R$ 5,00 [config]**.
- **RN-CHK-04** Frete é cotado e cobrado por SellerOrder; o comprador escolhe o serviço para cada seller.

## Pedidos (RN-PED)
- **RN-PED-01** Um Order gera um SellerOrder por seller; cada SellerOrder tem ciclo de vida independente.
- **RN-PED-02** Estados do SellerOrder:
  `awaiting_payment → paid → in_preparation → shipped → delivered → completed`
  com saídas `cancelled` (antes de `shipped`) e `returned`/`refunded` (após entrega, via disputa).
  `completed` ocorre automaticamente após o fim do prazo de arrependimento sem disputa aberta.
- **RN-PED-03** Comprador pode cancelar sozinho enquanto o SellerOrder estiver em `paid` ou `in_preparation` sem NF-e emitida; reembolso integral automático.
- **RN-PED-04** Seller pode cancelar antes do envio informando motivo; conta negativamente na reputação (exceto motivo "suspeita de fraude" validado pelo operador).
- **RN-PED-05** Prazo de despacho = prazo de manuseio da oferta; após **+2 dias úteis [config]** de atraso, o comprador pode cancelar sem ônus e, após **+5 dias úteis [config]**, cancelamento automático (Fase 2).
- **RN-PED-06** Pedido não pago até a expiração do meio de pagamento → `cancelled` com motivo `payment_expired`.

## Financeiro (RN-FIN)
- **RN-FIN-01** Comissão = % da categoria folha (herdando da mais próxima configurada acima) **[config, padrão 12%]**, aplicada sobre o valor dos itens (sem frete, padrão D3). Regra específica de seller sobrepõe a de categoria.
- **RN-FIN-02** Comissão é calculada e **congelada** no item no momento do pedido; mudanças de regra não afetam pedidos existentes.
- **RN-FIN-03** Arredondamento: calcular por item em centavos com arredondamento *half-even*; a soma do split deve ser exatamente igual ao valor cobrado — diferença de centavos vai para a plataforma.
- **RN-FIN-04** Frete: repassado integralmente ao seller quando ele contrata o envio; retido pela plataforma quando ela contrata (D4).
- **RN-FIN-05** Taxa do gateway: custeada pela plataforma no MVP **[config]** (alternativa: rateada proporcionalmente).
- **RN-FIN-06** Saldo do SellerOrder fica `pending` até `delivered` + **7 dias corridos [config]** (direito de arrependimento – CDC art. 49) sem disputa aberta; então vira `available`. Disputa aberta congela o saldo daquele SellerOrder.
- **RN-FIN-07** Reembolso após liberação gera débito no saldo do seller; saldo negativo é compensado em vendas futuras.
- **RN-FIN-08** Chargeback: debita o seller, salvo se o operador decidir absorver (registro obrigatório no audit log).
- **RN-FIN-09** Todo lançamento no ledger é imutável; correção somente por lançamento de estorno.

## Frete (RN-FRT)
- **RN-FRT-01** Pacote consolidado por SellerOrder: peso = soma; dimensões = empilhamento simples pela maior base (heurística); peso cubado conforme regra do provedor.
- **RN-FRT-02** Cotação é válida por **30 min [config]**; expirada, recotar no checkout.
- **RN-FRT-03** Entrega confirmada por evento do provedor; na ausência de rastreio, o comprador pode confirmar recebimento ou, após prazo estimado **+15 dias [config]**, o operador arbitra.

## Devoluções e disputas (RN-DSP) — Fase 2
- **RN-DSP-01** Arrependimento: até 7 dias da entrega, sem justificativa, frete de volta pago pela plataforma/seller conforme política **[config]**.
- **RN-DSP-02** Vício: até 30 dias (não duráveis) / 90 dias (duráveis) da entrega.
- **RN-DSP-03** Seller tem **3 dias úteis [config]** para responder; sem resposta, escala para mediação do operador automaticamente.
- **RN-DSP-04** Decisão da mediação é final na plataforma e gera reembolso/estorno correspondente.

## Avaliações e mensagens (RN-REV / RN-MSG) — Fase 2
- **RN-REV-01** Só avalia quem comprou e recebeu; 1 avaliação por item por pedido; editável por 30 dias.
- **RN-MSG-01** Mensagens e perguntas com telefone, e-mail, links externos ou redes sociais são bloqueadas/mascaradas (evita desintermediação).

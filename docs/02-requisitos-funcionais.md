# 02 — Requisitos Funcionais

Formato: `RF-<MÓDULO>-NN` · **F** = fase de entrega · Prioridade MoSCoW (M/S/C).
Cada RF é rastreado a user stories em `05-backlog.md`.

## tenancy — Tenants, planos e white-label
| ID | Requisito | F | P |
|---|---|---|---|
| RF-TEN-01 | Staff da plataforma cria tenant (nome, slug, plano, admin inicial, template de categorias); provisionamento idempotente conclui em até 5 min e envia convite ao admin do tenant. | 1 | M |
| RF-TEN-02 | Cada tenant recebe subdomínio `{slug}.<dominio-plataforma>` para storefront e painéis. | 1 | M |
| RF-TEN-03 | Admin do tenant conecta domínio próprio com verificação DNS e TLS automático (`DomainProvisioningPort`). | 1 | S |
| RF-TEN-04 | Admin do tenant personaliza tema (cores, fontes, logo, favicon), textos legais e remetente de e-mail. | 1 | M |
| RF-TEN-05 | Planos definem módulos habilitados e limites (sellers, SKUs, usuários, requisições de API, domínios); rotas/menus de módulos não contratados ficam indisponíveis. | 1 | M |
| RF-TEN-06 | Staff suspende/reativa tenant (storefront exibe página de indisponibilidade; APIs retornam 403). | 1 | M |
| RF-TEN-07 | Modo suporte: staff acessa um tenant com motivo e prazo, somente leitura por padrão, registrado no audit log do tenant. | 1 | M |
| RF-TEN-08 | Configurações `[config]` com hierarquia plataforma → plano → tenant, editáveis pelo admin do tenant dentro dos limites do plano. | 1 | M |
| RF-TEN-09 | Cadastro self-service de tenant com trial de 14 dias `[config]`. | 2 | S |
| RF-TEN-10 | Offboarding: export completo dos dados do tenant (JSON/CSV + mídias) e purge após 30 dias. | 2 | M |
| RF-TEN-11 | Console da plataforma: lista de tenants com status, plano, uso (GMV, pedidos, SKUs, sellers) e saúde de integrações. | 1 | M |
| RF-TEN-12 | Mover tenant para célula dedicada (silo) sem mudança de código. | 4 | C |

## saas-billing — Cobrança da plataforma aos tenants (Fase 2)
| ID | Requisito | F | P |
|---|---|---|---|
| RF-SAAS-01 | Assinatura do tenant por plano (mensal/anual) cobrada via `SubscriptionBillingPort` (ex.: Stripe Billing, Asaas, Iugu). | 2 | M |
| RF-SAAS-02 | Taxa variável sobre GMV mensal apurada por projeção de eventos `payments.payment.paid`/`refunded`, com fatura detalhada. | 2 | S |
| RF-SAAS-03 | Inadimplência: aviso em D+1, D+7; suspensão em D+15 `[config]`. | 2 | M |
| RF-SAAS-04 | Upgrade/downgrade de plano com pró-rata; downgrade bloqueado se uso exceder limites do novo plano. | 2 | S |

## identity — Identidade e acesso
> Em todo este documento, "operador" = equipe **do tenant**.
> **Autenticação (ADR-013):** usuários de painel (staff, operadores, sellers) autenticam na **Clerk**; compradores no
> módulo `identity` próprio, isolados por tenant. RF-IAM-01 a 04 e 09 referem-se a **compradores**.

| ID | Requisito (painéis — Clerk) | F | P |
|---|---|---|---|
| RF-IAM-10 | Login de operadores e sellers pela Clerk (e-mail + senha, Google, passkey conforme configuração), com organização ativa definindo o tenant/seller do painel. | 0/1 | M |
| RF-IAM-11 | Criar automaticamente organização Clerk ao provisionar tenant (kind=tenant) e ao solicitar cadastro de seller (kind=seller), com `publicMetadata` e mapeamento salvo no banco. | 1 | M |
| RF-IAM-12 | Convites de colaboradores via organização Clerk, respeitando limite de membros do plano. | 1 | M |
| RF-IAM-13 | Espelhar usuários, organizações e membros da Clerk localmente via webhooks assinados (idempotente, tolerante a ordem). | 0/1 | M |
| RF-IAM-14 | MFA obrigatório para staff (Console) e para papéis `tenant_admin`, `tenant_finance` e `seller_owner`. | 1 | M |
| RF-IAM-15 | Seletor de organização: usuário com mais de uma organização (ex.: seller em dois marketplaces) alterna o contexto sem novo login; a UI mostra marca do tenant da organização ativa. | 1 | S |
| ID | Requisito | F | P |
|---|---|---|---|
| RF-IAM-01 | Cadastrar comprador com e-mail + senha, nome, CPF/CNPJ e aceite de termos/política de privacidade (versão aceita registrada). | 1 | M |
| RF-IAM-02 | Confirmar e-mail por link com validade de 24h antes de permitir compra. | 1 | M |
| RF-IAM-03 | Login com e-mail/senha; emitir access token (15 min) e refresh token rotativo (30 dias). | 1 | M |
| RF-IAM-04 | Recuperar senha por e-mail com token de uso único válido por 1h. | 1 | M |
| RF-IAM-05 | Login social (Google, Apple) via OIDC. | 2 | S |
| RF-IAM-06 | 2FA (TOTP) opcional para compradores (painéis: ver RF-IAM-14). | 2 | C |
| RF-IAM-07 | RBAC: compradores (papel único no storefront); painéis via papéis e permissões customizados da Clerk por organização (tenant: admin, moderation, support, finance; seller: owner, catalog, orders, finance — tabela no ADR-013). Staff na aplicação Clerk do Console. | 1 | M |
| RF-IAM-08 | Titular exporta seus dados pessoais e solicita exclusão/anonimização (LGPD). | 2 | M |
| RF-IAM-09 | Gerenciar endereços do comprador (CEP com autocompletar via port de CEP). | 1 | M |

## sellers — Vendedores
| ID | Requisito | F | P |
|---|---|---|---|
| RF-SEL-01 | Seller solicita cadastro informando CNPJ, razão social, nome fantasia, endereço, responsável, dados bancários e aceite do contrato de intermediação. | 1 | M |
| RF-SEL-02 | Validar CNPJ (dígito + consulta de situação cadastral via `CompanyRegistryPort`). | 1 | S |
| RF-SEL-03 | Operador aprova/reprova cadastro com motivo; seller recebe notificação. Estados: `pending → under_review → approved | rejected | suspended`. | 1 | M |
| RF-SEL-04 | Na aprovação, criar o recebedor (subconta) no gateway de pagamento via `PaymentGatewayPort`. | 1 | M |
| RF-SEL-05 | Seller configura loja: logo, banner, descrição, políticas (troca, envio), prazo de manuseio padrão. | 1 | M |
| RF-SEL-06 | Seller convida colaboradores e atribui papéis (convites da organização Clerk — RF-IAM-12). | 1 | S |
| RF-SEL-07 | Operador suspende seller (ofertas saem da vitrine; pedidos abertos continuam). | 1 | M |
| RF-SEL-08 | Painel de reputação: % atraso, % cancelamento, % reclamações, nota média (janela de 60 dias). | 2 | S |
| RF-SEL-09 | Planos de seller com comissão/mensalidade diferenciada. | 3 | C |

## catalog — Catálogo
| ID | Requisito | F | P |
|---|---|---|---|
| RF-CAT-01 | Operador mantém árvore de categorias (até 4 níveis) com atributos por categoria (tipo, obrigatório, valores permitidos, se é de variação). | 1 | M |
| RF-CAT-02 | Seller cria produto: título, descrição, marca, GTIN/EAN opcional, categoria folha, atributos, dimensões/peso, até 12 imagens, variações. | 1 | M |
| RF-CAT-03 | Ao criar produto com GTIN já existente, sugerir anexar oferta ao produto existente em vez de duplicar. | 1 | S |
| RF-CAT-04 | Moderação de produto: `draft → pending_review → published | rejected` (padrão D6: moderação prévia; configurável para publicação automática por seller confiável). | 1 | M |
| RF-CAT-05 | Imagens enviadas por URL pré-assinada ao storage; gerar variantes redimensionadas (thumb, médio, zoom) em WebP. | 1 | M |
| RF-CAT-06 | Página de produto com URL amigável (slug) e dados estruturados (schema.org Product) para SEO. | 1 | M |
| RF-CAT-07 | Importação em massa via planilha (CSV/XLSX) com relatório de erros por linha. | 3 | S |
| RF-CAT-08 | Sugestão de categoria e melhoria de título/descrição por IA (port `ContentAssistPort`). | 4 | C |

## offers — Ofertas, preço e estoque
| ID | Requisito | F | P |
|---|---|---|---|
| RF-OFR-01 | Seller cria oferta para uma variação: SKU próprio, preço, preço "de" (opcional), estoque, condição (novo/usado/recondicionado), prazo de manuseio. | 1 | M |
| RF-OFR-02 | Atualizar preço/estoque individualmente e em lote (API e UI). | 1 | M |
| RF-OFR-03 | Reservar estoque no início do pagamento com TTL (RN-EST-02); baixar ao confirmar pagamento; liberar ao expirar/cancelar. | 1 | M |
| RF-OFR-04 | Oferta com estoque 0 fica indisponível na vitrine automaticamente. | 1 | M |
| RF-OFR-05 | Histórico de preço por oferta (base para regra de "preço de" honesto e buy box). | 2 | S |
| RF-OFR-06 | Buy box: escolher oferta vencedora por preço + frete + reputação + prazo. | 4 | C |

## search — Busca e navegação
| ID | Requisito | F | P |
|---|---|---|---|
| RF-SRC-01 | Busca textual com tolerância a erro de digitação, sinônimos e ordenação (relevância, menor/maior preço, mais vendidos, mais recentes). | 1 | M |
| RF-SRC-02 | Filtros facetados por categoria, faixa de preço, marca, atributos da categoria, condição, seller, frete grátis. | 1 | M |
| RF-SRC-03 | Autocompletar com sugestões de termos e categorias. | 1 | S |
| RF-SRC-04 | Índice atualizado por eventos em até 60s após alteração de produto/oferta. | 1 | M |
| RF-SRC-05 | Operador gerencia sinônimos e termos bloqueados. | 2 | S |

## cart / checkout
| ID | Requisito | F | P |
|---|---|---|---|
| RF-CRT-01 | Carrinho para visitante (cookie) e comprador (persistido); mesclar ao logar. | 1 | M |
| RF-CRT-02 | Carrinho agrupa itens por seller e revalida preço/estoque a cada visualização, sinalizando mudanças. | 1 | M |
| RF-CHK-01 | Checkout: endereço → cotação de frete por seller (opções de serviço) → pagamento → revisão → confirmação. | 1 | M |
| RF-CHK-02 | Formas de pagamento no MVP: Pix (QR + copia-e-cola, expiração 30 min) e cartão de crédito tokenizado com parcelamento. Boleto na Fase 2. | 1 | M |
| RF-CHK-03 | Aplicar cupom (plataforma ou seller). | 2 | S |
| RF-CHK-04 | Checkout idempotente: reenvio com mesma `Idempotency-Key` não cria pedido duplicado. | 1 | M |
| RF-CHK-05 | Análise antifraude antes da captura de cartão via `FraudAnalysisPort` (adapter "no-op" no MVP). | 2 | S |

## orders — Pedidos
| ID | Requisito | F | P |
|---|---|---|---|
| RF-PED-01 | Criar Order com N SellerOrders (um por seller) e itens com snapshot de título, preço, SKU, comissão aplicada. | 1 | M |
| RF-PED-02 | Máquina de estados do SellerOrder (ver RN-PED-02) com histórico de transições (quem, quando, motivo). | 1 | M |
| RF-PED-03 | Comprador acompanha pedidos, rastreio e pode cancelar antes do envio. | 1 | M |
| RF-PED-04 | Seller lista, filtra, confirma separação, informa envio (ou gera etiqueta) e cancela com motivo. | 1 | M |
| RF-PED-05 | Operador consulta qualquer pedido e executa ações de suporte (cancelar, reembolsar) com auditoria. | 1 | M |
| RF-PED-06 | Cancelamento automático de SellerOrder não despachado dentro do prazo de manuseio + tolerância (RN-PED-05). | 2 | S |

## payments — Pagamentos
| ID | Requisito | F | P |
|---|---|---|---|
| RF-PAG-01 | Criar cobrança única do Order no gateway com regras de split por recebedor (sellers + plataforma). | 1 | M |
| RF-PAG-02 | Processar webhooks do gateway (assinatura validada, idempotente) e atualizar estado: `pending → authorized → paid | failed | expired | refunded | partially_refunded | chargeback`. | 1 | M |
| RF-PAG-03 | Reembolso total ou parcial por SellerOrder/item, refletindo no split. | 1 | M |
| RF-PAG-04 | Conciliação diária: comparar transações do gateway com o ledger e gerar relatório de divergências. | 2 | M |
| RF-PAG-05 | Suportar mais de um gateway ativo simultaneamente (roteamento por método de pagamento). | 3 | S |

## ledger — Financeiro, comissão e repasse
| ID | Requisito | F | P |
|---|---|---|---|
| RF-FIN-01 | Registrar em partidas dobradas: venda, comissão, taxa de gateway, frete, reembolso, chargeback, ajuste manual. | 1 | M |
| RF-FIN-02 | Calcular comissão por item conforme regra vigente (RN-FIN-01) e congelar o valor no pedido. | 1 | M |
| RF-FIN-03 | Seller vê extrato: saldo a liberar, disponível, repassado, com detalhamento por pedido. | 1 | M |
| RF-FIN-04 | Liberar saldo do SellerOrder após entrega + prazo de arrependimento (RN-FIN-06). | 1 | M |
| RF-FIN-05 | Repasse: no MVP, o saque é feito pelo próprio gateway (subconta); ledger acompanha via webhooks. Repasse automático agendado na Fase 2. | 1/2 | M |
| RF-FIN-06 | Operador faz ajuste manual (crédito/débito) com justificativa e dupla aprovação acima de limite configurável. | 2 | S |
| RF-FIN-07 | Relatório de comissões por período/categoria/seller exportável (CSV). | 1 | S |

## shipping — Frete e entrega
| ID | Requisito | F | P |
|---|---|---|---|
| RF-FRT-01 | Cotar frete por SellerOrder (CEP origem do seller, destino, pacote consolidado) via `ShippingQuotePort`; exibir preço e prazo por serviço. | 1 | M |
| RF-FRT-02 | Fallback: tabela de frete própria do seller (faixas de CEP × peso) quando nenhum provedor responder em 3s. | 1 | S |
| RF-FRT-03 | Gerar etiqueta via `ShippingLabelPort` e registrar código de rastreio. | 1 | S |
| RF-FRT-04 | Atualizar status de rastreio por webhook/polling e marcar entregue. | 1 | M |
| RF-FRT-05 | Regras de frete grátis (plataforma e/ou seller) acima de valor mínimo. | 2 | S |

## fiscal
| ID | Requisito | F | P |
|---|---|---|---|
| RF-FIS-01 | Seller informa chave/XML da NF-e do SellerOrder (manual ou via integração) antes do despacho. | 1 | S |
| RF-FIS-02 | Emissão de NF-e pelo seller via integração com emissor (`FiscalIssuerPort`: ex. Focus NFe, eNotas, Bling). | 2 | S |
| RF-FIS-03 | Plataforma emite NFS-e da comissão cobrada do seller. | 2 | S |

## promotions / reviews / messaging / disputes (Fase 2)
| ID | Requisito | F | P |
|---|---|---|---|
| RF-PRO-01 | Cupons (%, valor fixo, frete grátis) com validade, limite de uso, valor mínimo, escopo (plataforma, seller, categoria) e definição de quem custeia. | 2 | S |
| RF-PRO-02 | Campanhas com preço promocional agendado por oferta. | 2 | S |
| RF-REV-01 | Comprador avalia produto (1–5 + texto + fotos) e seller somente após entrega. | 2 | S |
| RF-REV-02 | Perguntas e respostas públicas no produto, com moderação de dados de contato. | 2 | S |
| RF-MSG-01 | Chat comprador–seller vinculado a um SellerOrder, com bloqueio de troca de contatos externos. | 2 | S |
| RF-DSP-01 | Solicitação de devolução/troca pelo comprador em até 7 dias da entrega (arrependimento) ou 30/90 dias (vício), com fluxo seller → mediação do operador. | 2 | M |

## notifications
| ID | Requisito | F | P |
|---|---|---|---|
| RF-NOT-01 | Enviar e-mails transacionais por eventos (cadastro, pedido, pagamento, envio, entrega, repasse) com templates versionados. | 1 | M |
| RF-NOT-02 | Canais adicionais plugáveis: SMS, WhatsApp, push (`NotificationChannelPort`). | 2 | S |
| RF-NOT-03 | Preferências de notificação por usuário (exceto transacionais obrigatórias). | 2 | S |

## integrations — Hub de integrações
| ID | Requisito | F | P |
|---|---|---|---|
| RF-INT-01 | Registro de provedores por categoria (payment, shipping, fiscal, notification, search, storage, erp, fraud) **por tenant**: admin do tenant escolhe provedor, informa e testa credenciais (criptografadas), entre os provedores liberados pelo plano. | 1 | M |
| RF-INT-02 | Webhooks de saída: seller/operador cadastra endpoint e eventos assinados; entrega com assinatura HMAC-SHA256, retries exponenciais por até 24h, log de entregas e reenvio manual. | 1 | M |
| RF-INT-03 | API keys por seller com escopos (catalog:write, offers:write, orders:read...) e rotação. | 1 | M |
| RF-INT-04 | API pública documentada (OpenAPI) + SDK TypeScript gerado. | 1 | M |
| RF-INT-05 | Apps de terceiros via OAuth 2.0 (authorization code + PKCE) com tela de consentimento de escopos. | 3 | S |
| RF-INT-06 | Conectores prontos para ERPs/hubs (Bling, Tiny/Olist, Omie, Anymarket) sincronizando catálogo, estoque e pedidos. | 3 | S |

## cms / admin / audit / reporting
| ID | Requisito | F | P |
|---|---|---|---|
| RF-CMS-01 | Operador gerencia banners, vitrines de home (coleções manuais ou por regra) e páginas institucionais. | 1 | S |
| RF-ADM-01 | Backoffice com: aprovação de sellers, moderação de produtos, pedidos, financeiro, categorias, configurações e integrações. | 1 | M |
| RF-AUD-01 | Registrar em audit log imutável toda ação administrativa e financeira: ator, ação, entidade, antes/depois, IP, timestamp. | 1 | M |
| RF-REP-01 | Dashboards do tenant: GMV, pedidos, ticket médio, take rate, conversão, top sellers/categorias. Console: os mesmos indicadores agregados por tenant. | 2 | S |

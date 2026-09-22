# 05 — Backlog (Épicos e User Stories)

Convenções: cada story referencia RF/RN/RNF. Stories marcadas **[ENABLER]** são técnicas.
Estimativa relativa: P (≤1 dia de Claude Code), M (1–3 dias), G (quebrar antes de implementar).
Marque `[x]` quando a story atender à Definition of Done do `CLAUDE.md`.

---
## E00 — Fundação técnica (Fase 0)

- [x] **US-001 [ENABLER] Monorepo e tooling** (M) — pnpm + Turborepo, tsconfig/eslint/prettier compartilhados em `packages/config`, apps vazios (`api`, `worker`, `storefront`, `seller-center`, `admin`, `console`), `docker-compose.yml` (postgres montando `infra/db/` e executando `local-init.sh`, redis com `noeviction`, meilisearch, mailpit, minio), scripts do CLAUDE.md §6. Cada app já nasce lendo `PORT`, escutando em `::` e com `/health`.
  - *Aceite:* `pnpm install && docker compose up -d && pnpm dev` sobe tudo; `GET /health` retorna 200 com status de DB e Redis.
- [x] **US-002 [ENABLER] Fronteiras de módulo** (P) — `eslint-plugin-boundaries` (ou dependency-cruiser) com as regras do CLAUDE.md §4; teste que falha ao importar interno de outro módulo.
- [x] **US-003 [ENABLER] Shared kernel** (P) — `Money` (centavos, soma/rateio sem perda — RN-FIN-03), `Id` (UUIDv7), `Result`, `DomainError`, `Clock`, `DomainEvent`. 100% testado.
- [x] **US-004 [ENABLER] Banco por módulo** (M) — Drizzle com um schema Postgres por módulo, migrações por módulo executadas por `pnpm db:migrate` **com o role `migrator`**, helper `createModuleSchema` conforme `infra/db/module-schema-template.sql`, entrypoint `dist/migrate.js` para o pre-deploy da Railway, teste que conecta com `DATABASE_URL` e falha se o role for superusuário ou tiver BYPASSRLS, helper de transação (Unit of Work) e Testcontainers para testes de integração.
- [x] **US-005 [ENABLER] Outbox + Event Bus** (M) — tabela `outbox` por schema, gravação na mesma transação, relay no worker publicando no BullMQ, consumidores idempotentes (tabela `processed_events`), DLQ e reprocessamento. Envelope CloudEvents validado por Zod (ver `arquitetura/03-integracoes.md`).
  - *Aceite:* teste de integração prova que (1) rollback da transação não publica evento; (2) evento duplicado é processado uma só vez; (3) falha 5× vai para DLQ.
- [x] **US-006 [ENABLER] Observabilidade e erros** (P) — pino com redação de PII, OpenTelemetry, `correlation_id`, filtro de exceções → Problem Details (RFC 9457).
- [x] **US-007 [ENABLER] Idempotência e rate limit** (P) — interceptor `Idempotency-Key` (armazenamento 24 h em Redis/PG) e rate limit por IP/usuário/API key.
- [x] **US-008 [ENABLER] CI** (M) — GitHub Actions: lint, typecheck, boundaries, testes (Testcontainers com as roles de `infra/db/`), suíte de isolamento, build de todos os Dockerfiles, gitleaks, scan de dependências, geração/validação de OpenAPI; Lighthouse CI e axe no storefront (a partir da Fase 1). O status do workflow é o que a Railway espera ("Wait for CI").
- [x] **US-009 [ENABLER] Hub de configuração e registro de adapters** (M) — módulo `integrations` com registro de providers por categoria **e por tenant**, credenciais criptografadas, resolução do adapter ativo **em tempo de requisição a partir do TenantContext** (não é singleton global), adapters **fake/in-memory** de todas as ports para dev e testes. (RF-INT-01, RNF-MAN-03)

### Multi-tenancy na fundação (fazer ANTES de US-004/005 terminarem — tudo depende disso)

### US-082 [ENABLER] — Integração com a Clerk (painéis) ✅
**Como** plataforma **eu quero** autenticar usuários de painel pela Clerk **para que** operadores e sellers tenham
login seguro, MFA e organizações sem construirmos isso do zero. (ADR-013)
```gherkin
Cenário: token válido
  Dado um usuário autenticado na Clerk com organização ativa kind=seller mapeada para o seller S do tenant T
  Quando ele chama GET /v1/seller/offers com o token de sessão
  Então a API valida a assinatura localmente (CLERK_JWT_KEY), a expiração e o authorized party
  E abre TenantContext = T e SellerContext = S

Cenário: token inválido ou de outra aplicação
  Quando o token está expirado, tem assinatura inválida ou azp fora de CLERK_AUTHORIZED_PARTIES
  Então a resposta é 401

Cenário: permissão insuficiente
  Dado o papel "org:seller_catalog"
  Quando ele chama POST /v1/seller/orders/{id}/ship (exige org:orders:manage)
  Então a resposta é 403

Cenário: rota de seller com organização de tenant
  Dado a organização ativa kind=tenant
  Quando ele chama uma rota /v1/seller/*
  Então a resposta é 403 "wrong_organization_kind"

Cenário: sincronização por webhook
  Quando a Clerk envia "user.created", "organization.created" ou "organizationMembership.created" com assinatura válida
  Então a projeção local é criada/atualizada de forma idempotente
  E webhook com assinatura inválida é rejeitado com 400
```
Inclui: pacote `packages/adapters/identity-clerk` implementando `WorkforceIdentityPort` (verifyToken, createOrganization,
inviteMember, setOrganizationMetadata, listMemberships) + adapter **fake** para testes (tokens assinados com chave local);
guards `@PanelAuth('tenant'|'seller'|'console')` e `@Requires('org:...')`; rota `POST /v1/hooks/identity/clerk`;
customização do session token da Clerk com claims `org_kind`, `tenant_id`, `seller_id` vindos do `publicMetadata`;
middleware `clerkMiddleware` nos apps admin, seller-center e console; seed de organizações de desenvolvimento.
*Fora de escopo:* login de compradores (US-010/011).

### US-070 [ENABLER] — TenantContext e resolução do tenant ✅
**Como** plataforma **eu quero** que toda requisição e job saiba a qual tenant pertence **para que** nenhum dado seja lido ou gravado no tenant errado.
```gherkin
Cenário: resolução por host
  Dado o tenant "loja-x" com domínio "loja-x.plataforma.com.br" e status "active"
  Quando chega GET https://loja-x.plataforma.com.br/v1/store/products
  Então o TenantContext contém o id de "loja-x" durante toda a requisição

Cenário: token de comprador de outro tenant
  Dado um access token de comprador com tid do tenant "loja-y"
  Quando ele é usado no host de "loja-x"
  Então a resposta é 403 "tenant_mismatch"

Cenário: painel com organização ativa da Clerk
  Dado um operador cuja organização ativa na Clerk é a do tenant "loja-x"
  Quando ele chama GET /v1/admin/orders
  Então o TenantContext é "loja-x" após conferir o mapeamento organização → tenant no banco
  E se a organização não estiver mapeada ou o tenant estiver suspenso a resposta é 403

Cenário: tenant informado pelo cliente é ignorado
  Quando o corpo ou header da requisição contém "tenantId" de outro tenant
  Então o valor é ignorado e o contexto continua sendo o resolvido pelo host/credencial

Cenário: host desconhecido ou tenant suspenso
  Quando o host não corresponde a nenhum tenant
  Então a resposta é 404 sem revelar informações
  E se o tenant estiver "suspended" a resposta é 403 "tenant_suspended"
```
ADR-012 · `arquitetura/06-multi-tenancy.md` §2 · RNF-TEN-01

### US-071 [ENABLER] — RLS e repositório tenant-aware ✅
```gherkin
Cenário: filtro automático
  Dado ofertas dos tenants A e B
  Quando um caso de uso no contexto de A lista ofertas via TenantAwareRepository
  Então apenas ofertas de A são retornadas, sem WHERE escrito manualmente

Cenário: rede de segurança do RLS
  Quando uma consulta crua é executada com o role da aplicação sem SET LOCAL app.tenant_id
  Então nenhuma linha é retornada e inserts falham

Cenário: tabela sem RLS
  Quando uma migração cria tabela com coluna tenant_id sem habilitar e forçar RLS
  Então o teste de CI "tenancy/rls-coverage" falha
```
Inclui: helper `enableTenantRls(table)` para migrações, role `app` sem BYPASSRLS, role `platform` restrito, `withTenantTx`, geração de números de pedido por tenant.

- [x] **US-072 [ENABLER] Tenant em eventos, jobs, cache, storage e logs** (M) — `tenantid` obrigatório no envelope; consumidores abrem o contexto a partir do evento; decorator `@PlatformJob`; prefixos `t:{tenantId}` em Redis e `t/{tenantId}/` no storage; atributo `tenant.id` em logs/traces/métricas; concorrência de jobs e rate limit por tenant. Aceite: evento sem `tenantid` vai para DLQ; teste prova fairness entre dois tenants.
- [x] **US-073 [ENABLER] Configuração hierárquica e entitlements** (M) — `ConfigService` (plataforma → plano → tenant), `@RequiresModule`, verificação de limites do plano (RN-TEN-03). RF-TEN-05/08.
- [x] **US-074 [ENABLER] Suíte de isolamento** (M) — harness que cria Tenant A e B com dados e, para cada rota registrada, prova que A não acessa B (listagem, leitura por ID, alteração, exclusão). Roda no CI; toda story nova herda automaticamente. RNF-TEN-01.
- [x] **US-075 [ENABLER] Módulo `tenancy` e app `console` (esqueleto)** (M) — tenants, domínios, planos, staff autenticado pela aplicação Clerk **Console** (MFA obrigatório, cadastro restrito por allowlist/convite), rotas `/v1/platform/*`, seed de 2 tenants de desenvolvimento (`loja-a.localhost`, `loja-b.localhost`).

### US-084 [ENABLER] — Deploy na Railway (staging + ambientes de PR) 🚧 (código pronto; falta a conta — checklist §B)
**Como** time **eu quero** que cada merge vá para staging e cada PR ganhe um ambiente próprio **para que** tudo seja
testável fora da máquina local. (ADR-014, `arquitetura/07-infraestrutura-railway.md`)
```gherkin
Cenário: merge no main
  Dado um PR aprovado com CI verde
  Quando ele é mergeado no main
  Então a Railway faz deploy de staging apenas dos serviços afetados (watchPatterns)
  E o pre-deploy da api executa as migrações com o role migrator antes da nova versão receber tráfego
  E o healthcheck /health responde 200 em api e frontends

Cenário: ambiente de PR
  Quando um Pull Request é aberto
  Então é criado um ambiente efêmero com banco vazio, migrado e com seed de loja-a e loja-b
  E o link do ambiente aparece no PR

Cenário: migração falha
  Quando a migração do pre-deploy falha
  Então o deploy é abortado e a versão anterior continua no ar

Cenário: segurança do banco
  Então nenhum serviço de aplicação possui a URL do usuário postgres
  E a api conectada com DATABASE_URL confirma rolsuper = false e rolbypassrls = false
```
Inclui: Dockerfiles multi-stage (`turbo prune`), `apps/*/railway.json` conforme o documento de infraestrutura,
variáveis de referência, SIGTERM/graceful shutdown, `family: 0` no BullMQ, verificação de `noeviction` no boot do worker,
runbook `docs/runbooks/deploy.md`. *Pré-requisitos (você):* checklist seção B.

---
## E00T — Tenancy de produto (Fase 1)

### US-085 [SPIKE] — Domínio próprio de tenant via Cloudflare for SaaS → Railway 🚧 (artefatos prontos; validação real pendente — checklist §C)
**Objetivo:** provar, antes de construir US-078, que um domínio próprio chega ao storefront certo com HTTPS.
```gherkin
Cenário: domínio próprio resolvido
  Dado o tenant "loja-x" com o domínio "loja-teste.com.br" apontado por CNAME para customers.<plataforma>
  E o hostname cadastrado no Cloudflare for SaaS com certificado ativo
  Quando acesso https://loja-teste.com.br
  Então o storefront de "loja-x" responde com certificado válido
  E login do comprador, carrinho (cookies), redirects, canonical e sitemap usam "loja-teste.com.br"

Cenário: tentativa de falsificar o host
  Quando uma requisição chega direto à Railway com X-Forwarded-Host de outro tenant sem X-Edge-Secret válido
  Então o header é ignorado e o tenant é resolvido pelo Host real
```
Entregáveis: Cloudflare Worker versionado em `infra/cloudflare/`, adapter `domains-cloudflare` (`DomainProvisioningPort`),
relatório em `docs/spikes/US-085.md` com a conclusão (seguir / ajustar / alternativa Vercel). Timebox: 2 dias.

- [ ] **US-083 — Seletor de organização e marca no painel** (P) — RF-IAM-15.

### US-076 — Provisionar tenant ✅
**Como** staff da plataforma **eu quero** criar um novo marketplace **para que** o cliente comece a operar.
```gherkin
Cenário: provisionamento completo
  Dado que informo nome "Loja X", slug "loja-x", plano "growth", template "moda" e e-mail do admin
  Quando confirmo
  Então o tenant é criado em "provisioning" e o evento "tenancy.tenant.created" é publicado
  E cada módulo semeia seus dados (categorias do template, configurações, templates de e-mail, índice de busca)
  E é criada a organização Clerk kind=tenant com o mapeamento salvo e o admin é convidado como org:tenant_admin
  E em até 5 minutos o tenant fica "trial" e o admin recebe o convite da Clerk por e-mail
  E "loja-x.<dominio-plataforma>" passa a responder com o storefront padrão

Cenário: falha parcial
  Dado que a criação do índice de busca falha
  Quando o provisionamento é reexecutado
  Então apenas as etapas pendentes são refeitas (idempotência) e nada é duplicado

Cenário: slug inválido ou reservado
  Quando informo slug "admin"
  Então recebo erro de validação (RN-TEN-01)
```
RF-TEN-01/02 · RNF-TEN-03

- [ ] **US-077 — Tema e identidade visual do tenant** (M) — RF-TEN-04; tokens de design aplicados via CSS variables no storefront/painéis; preview antes de publicar.
- [ ] **US-078 — Domínio próprio com TLS** (M) — RF-TEN-03; produto em cima do resultado da US-085: tela no admin, `DomainProvisioningPort` com adapter Cloudflare for SaaS + fake, verificação DNS (CNAME/TXT), status do certificado, remoção.
- [ ] **US-079 — Configuração de integrações pelo tenant** (M) — RF-INT-01; tela no admin: escolher provedor, credenciais, "testar conexão", ativar; RN-TEN-02 bloqueia checkout sem gateway válido.
- [ ] **US-080 — Suspensão e modo suporte** (M) — RF-TEN-06/07, RN-TEN-04; audit log visível ao admin do tenant.
- [ ] **US-081 — Console: lista de tenants e uso** (M) — RF-TEN-11; projeção de uso alimentada por eventos.

---
## E01 — Identidade e acesso (Fase 1)

> **Escopo do E01:** identidade própria dos **compradores** (storefront). Login de painéis é Clerk (US-082).

### US-010 — Cadastro de comprador
**Como** visitante **eu quero** criar minha conta **para que** eu possa comprar.
```gherkin
Cenário: cadastro válido
  Dado que informo nome, e-mail inédito, CPF válido, senha forte e aceito os termos
  Quando envio o cadastro
  Então a conta é criada com status "pending_verification"
  E recebo e-mail de confirmação com link válido por 24h
  E o aceite registra versão dos termos, data e IP

Cenário: e-mail já cadastrado
  Dado que o e-mail já existe
  Quando envio o cadastro
  Então recebo a mesma resposta genérica de sucesso (não revelar existência de conta)
  E o dono do e-mail recebe aviso de tentativa de cadastro

Cenário: CPF inválido
  Quando informo CPF com dígito verificador inválido
  Então recebo erro de validação no campo "document"
```
RF-IAM-01, RF-IAM-02 · RNF-SEG-02, RNF-LGPD-03 · *Fora de escopo:* login social.
*Nota multi-tenant:* e-mail é único **por tenant**; o mesmo e-mail pode ter conta em outro marketplace (teste obrigatório).

- [ ] **US-011 — Login, refresh e logout** (M) — RF-IAM-03. Refresh rotativo com detecção de reuso (reuso revoga a família de tokens). Bloqueio progressivo (RNF-SEG-02).
- [ ] **US-012 — Recuperação de senha** (P) — RF-IAM-04. Resposta genérica; token de uso único 1 h; invalida sessões ao trocar senha.
- [ ] **US-013 — Papéis e permissões dos painéis na Clerk + MFA** (M) — RF-IAM-07/14. Criar na Clerk os papéis e permissões da tabela do ADR-013 (script idempotente via Backend API, versionado no repo), exigir MFA nos papéis sensíveis, teste que varre todas as rotas e falha se alguma não declarar guard (`@PanelAuth`/`@Requires` ou `@CustomerAuth`/`@Public`) (RNF-SEG-03).
- [ ] **US-014 — Endereços do comprador** (P) — RF-IAM-09. CEP via `PostalCodePort` (adapter ViaCEP + fake).

---
## E02 — Sellers (Fase 1)

### US-015 — Solicitação de cadastro de seller
**Como** lojista **eu quero** solicitar minha entrada no marketplace **para que** eu possa vender.
```gherkin
Cenário: solicitação completa
  Dado que criei minha conta na Clerk a partir do link "Venda conosco" do marketplace (vendedor.<plataforma>/?t=loja-x)
  E informo CNPJ válido, razão social, endereço, responsável e dados bancários
  E aceito o contrato de intermediação
  Quando envio a solicitação
  Então a loja é criada com status "pending" no tenant "loja-x"
  E é criada uma organização Clerk kind=seller com o mapeamento salvo, e eu sou "org:seller_owner"
  E o evento "sellers.seller.applied" é publicado

Cenário: CNPJ inativo
  Dado que a consulta ao CompanyRegistryPort retorna situação "baixada"
  Quando envio a solicitação
  Então recebo erro explicando que o CNPJ precisa estar ativo (RN-SEL-01)

Cenário: consulta de CNPJ indisponível
  Dado que o CompanyRegistryPort excede o timeout
  Quando envio a solicitação
  Então a loja é criada como "pending" com pendência "cnpj_not_verified" para revisão manual
```
RF-SEL-01/02 · RN-SEL-01

### US-016 — Aprovação de seller e criação de recebedor
**Como** operador de moderação **eu quero** aprovar ou reprovar lojas **para que** só vendedores idôneos operem.
```gherkin
Cenário: aprovação com recebedor criado
  Dado uma loja "under_review"
  Quando aprovo
  Então o sistema cria o recebedor no gateway via PaymentGatewayPort
  E a loja passa para "approved" com o recipient_id salvo
  E o evento "sellers.seller.approved" é publicado e o seller recebe e-mail

Cenário: falha no gateway
  Dado que o gateway rejeita os dados bancários
  Quando aprovo
  Então a loja fica "approved" com flag "payment_account_pending"
  E ela não pode publicar ofertas (RN-SEL-02)
  E o seller é notificado para corrigir os dados bancários

Cenário: reprovação
  Quando reprovo informando motivo
  Então a loja passa para "rejected" e o seller recebe o motivo por e-mail
  E a ação fica no audit log
```
RF-SEL-03/04 · RN-SEL-02 · RF-AUD-01

- [ ] **US-017 — Configuração da loja** (P) — RF-SEL-05. Página pública da loja `/loja/{slug}`.
- [ ] **US-018 — Colaboradores da loja** (P) — RF-SEL-06, RF-IAM-12: convites e papéis pela organização Clerk do seller; limite de membros do plano aplicado na Clerk e verificado no backend.
- [ ] **US-019 — Suspensão de seller** (P) — RF-SEL-07, RN-SEL-03. Evento `sellers.seller.suspended` consumido por `offers` (despublica) e `search` (remove do índice).

---
## E03 — Catálogo (Fase 1)

- [ ] **US-020 — Categorias e atributos** (M) — RF-CAT-01. CRUD admin; atributos tipados (texto, número, lista, booleano), flag "de variação"; seed com árvore inicial.
### US-021 — Cadastro de produto pelo seller (G → quebrar em 021a dados básicos / 021b variações / 021c imagens)
**Como** seller **eu quero** cadastrar produtos com variações **para que** eu possa ofertá-los.
```gherkin
Cenário: produto válido enviado para moderação
  Dado que sou seller aprovado
  E preencho título, descrição, categoria folha, atributos obrigatórios, dimensões, peso e 1+ imagem
  Quando envio para publicação
  Então o produto fica "pending_review"
  E o evento "catalog.product.submitted" é publicado

Cenário: GTIN já existente
  Dado que existe produto publicado com o GTIN informado
  Quando tento criar um novo produto com esse GTIN
  Então sou orientado a criar apenas uma oferta vinculada ao produto existente (RN-CAT-02)

Cenário: atributo obrigatório faltando
  Quando envio sem o atributo obrigatório "voltagem"
  Então recebo erro de validação indicando o atributo
```
RF-CAT-02/03/05 · RN-CAT-01/02

- [ ] **US-022 — Moderação de produto** (M) — RF-CAT-04, RN-CAT-03/04. Fila no admin, aprovar/rejeitar com motivo, lista de termos proibidos. Evento `catalog.product.published`.
- [ ] **US-023 — Upload e processamento de imagens** (M) — RF-CAT-05. URL pré-assinada via `ObjectStoragePort` (adapter S3/MinIO); job de redimensionamento WebP.
- [ ] **US-024 — Página de produto (storefront)** (M) — RF-CAT-06. SSR, slug, schema.org, galeria, seletor de variação, ofertas disponíveis, cálculo de frete por CEP. RNF-PERF-04.

---
## E04 — Ofertas, preço e estoque (Fase 1)

- [ ] **US-026 — Criar/editar oferta** (M) — RF-OFR-01/04, RN-SEL-02, RN-EST-03. Evento `offers.offer.changed`.
- [ ] **US-027 — Atualização em lote de preço/estoque** (P) — RF-OFR-02. Endpoint bulk (até 500 itens) idempotente, usado também pela API pública.
### US-028 — Reserva de estoque
**Como** plataforma **eu quero** reservar estoque durante o pagamento **para que** não haja venda acima do disponível.
```gherkin
Cenário: reserva com sucesso
  Dado oferta com estoque 5 e nenhuma reserva
  Quando um pedido de 2 unidades gera cobrança
  Então é criada reserva de 2 com expiração conforme RN-EST-02
  E o estoque disponível passa a 3

Cenário: concorrência
  Dado oferta com estoque 1
  Quando dois checkouts simultâneos tentam reservar 1 unidade
  Então exatamente um obtém a reserva e o outro recebe "out_of_stock"

Cenário: expiração
  Dado reserva ativa cujo pagamento não foi confirmado
  Quando o TTL expira
  Então a reserva é liberada e o disponível volta ao valor anterior

Cenário: confirmação
  Quando o evento "payments.payment.paid" do pedido é recebido
  Então a reserva é convertida em baixa definitiva de estoque
```
RF-OFR-03 · RN-EST-01/02 · *Nota técnica:* usar `UPDATE ... WHERE available >= qty` atômico ou lock de linha; nunca ler-depois-escrever.

---
## E05 — Busca (Fase 1)

- [ ] **US-030 — Indexação por eventos** (M) — RF-SRC-04. Handler de `catalog.product.published`, `offers.offer.changed`, `sellers.seller.suspended` → documento desnormalizado (produto + melhor oferta + faixas de preço + facetas) via `SearchIndexPort` (adapter Meilisearch). Job de reindexação total.
- [ ] **US-031 — Busca com filtros e ordenação** (M) — RF-SRC-01/02. Fallback Postgres (RNF-DISP-03).
- [ ] **US-032 — Autocomplete** (P) — RF-SRC-03.

---
## E06 — Carrinho e checkout (Fase 1)

- [ ] **US-033 — Carrinho anônimo e logado com merge** (M) — RF-CRT-01/02.
- [ ] **US-034 — Cotação de frete no carrinho/checkout** (M) — RF-FRT-01/02, RN-FRT-01/02, RN-CHK-04.
### US-035 — Fechar pedido (checkout)
**Como** comprador **eu quero** finalizar a compra de itens de vários sellers em um único pagamento **para que** a compra seja simples.
```gherkin
Cenário: pedido multi-seller com Pix
  Dado carrinho com itens dos sellers A e B, endereço selecionado e frete escolhido para cada seller
  Quando confirmo o pagamento via Pix com Idempotency-Key "k1"
  Então é criado 1 Order com 2 SellerOrders em "awaiting_payment"
  E comissões são calculadas e congeladas por item (RN-FIN-01/02)
  E o estoque é reservado (US-028)
  E é criada uma cobrança Pix com split entre A, B e a plataforma
  E recebo QR Code e código copia-e-cola com expiração de 30 min

Cenário: reenvio idempotente
  Quando reenvio a mesma requisição com Idempotency-Key "k1"
  Então recebo a mesma resposta e nenhum pedido novo é criado

Cenário: preço mudou
  Dado que o seller A alterou o preço após eu abrir o checkout
  Quando confirmo
  Então nenhum pedido é criado e vejo o item com o novo preço destacado (RN-CHK-01)

Cenário: gateway indisponível
  Dado que o gateway não responde em 5 s
  Quando confirmo
  Então o pedido é marcado "payment_failed", as reservas são liberadas
  E vejo mensagem para tentar novamente
```
RF-CHK-01/02/04, RF-PED-01, RF-PAG-01 · RNF-PERF-03 · *Fora de escopo:* cupons, boleto.

- [ ] **US-036 — Pagamento com cartão tokenizado e parcelamento** (M) — RF-CHK-02, RN-CHK-03, RNF-SEG-04. Tokenização no front com o SDK do gateway (atrás de componente `PaymentForm` com implementação por provedor).
- [ ] **US-037 — Tela de confirmação e acompanhamento do pagamento** (P) — polling/SSE do status do Pix.

---
## E07 — Pagamentos (Fase 1)

- [ ] **US-040 — Adapter do gateway escolhido (D2)** (G → quebrar: recebedores / cobrança com split / webhooks / reembolso) — implementa `PaymentGatewayPort` completo + testes de contrato compartilhados com o adapter fake.
### US-041 — Webhooks do gateway
```gherkin
Cenário: pagamento confirmado
  Dado cobrança "pending" do Order X
  Quando chega webhook "paid" com assinatura válida
  Então o pagamento vai para "paid" e o evento "payments.payment.paid" é publicado
  E os SellerOrders de X vão para "paid"

Cenário: webhook duplicado ou fora de ordem
  Quando o mesmo webhook chega 2 vezes, ou "authorized" chega depois de "paid"
  Então o estado final permanece "paid" e nada é reprocessado

Cenário: assinatura inválida
  Quando chega webhook com assinatura inválida
  Então respondo 401, registro alerta de segurança e não altero estado
```
RF-PAG-02 · RNF-SEG-07
- [ ] **US-042 — Reembolso total/parcial** (M) — RF-PAG-03, RN-PED-03, RN-FIN-07.
- [ ] **US-043 — Expiração de pagamento** (P) — RN-PED-06; job/evento de expiração libera reservas.

---
## E08 — Pedidos (Fase 1)

- [ ] **US-044 — Máquina de estados de SellerOrder** (M) — RN-PED-02; tabela de transições permitidas testada exaustivamente; histórico.
- [ ] **US-045 — Meus pedidos (comprador)** (M) — RF-PED-03; cancelamento conforme RN-PED-03.
- [ ] **US-046 — Gestão de pedidos (seller)** (M) — RF-PED-04; confirmar preparação, informar NF-e (RF-FIS-01), despachar (etiqueta ou rastreio manual), cancelar com motivo.
- [ ] **US-047 — Pedidos no backoffice** (P) — RF-PED-05 com audit log.
- [ ] **US-048 — Conclusão automática** (P) — job que move `delivered` → `completed` ao fim da janela (RN-FIN-06), publicando `orders.seller_order.completed`.

---
## E09 — Financeiro / Ledger (Fase 1)

### US-049 — Ledger de partidas dobradas
```gherkin
Cenário: venda paga
  Dado SellerOrder de R$ 100,00 em itens + R$ 20,00 de frete (seller envia), comissão 12%
  Quando o pagamento é confirmado
  Então são lançados: crédito seller:pending R$ 108,00 (100 − 12 + 20)
  E crédito platform:commission R$ 12,00
  E débito gateway:receivable R$ 120,00
  E a soma de débitos e créditos da transação é zero

Cenário: liberação
  Quando o SellerOrder vai para "completed"
  Então R$ 108,00 é transferido de seller:pending para seller:available

Cenário: imutabilidade
  Quando alguém tenta alterar ou apagar um lançamento
  Então a operação é recusada; correções só por estorno (RN-FIN-09)
```
RF-FIN-01/02/04 · RN-FIN-01..09 · RNF-DISP-05
- [ ] **US-050 — Extrato do seller** (M) — RF-FIN-03.
- [ ] **US-051 — Sincronizar saques do gateway** (P) — RF-FIN-05 (MVP).
- [ ] **US-052 — Regras de comissão no admin** (P) — RN-FIN-01; vigência com data de início.
- [ ] **US-053 — Relatório de comissões** (P) — RF-FIN-07.

---
## E10 — Frete (Fase 1)

- [ ] **US-054 — Adapter de cotação e etiqueta** (M) — `ShippingQuotePort` + `ShippingLabelPort` (sugestão: Melhor Envio, que agrega Correios/Jadlog/Loggi; alternativa: Frenet) + fake.
- [ ] **US-055 — Tabela de frete do seller (fallback)** (P) — RF-FRT-02.
- [ ] **US-056 — Rastreio e entrega** (M) — RF-FRT-04, RN-FRT-03; evento `shipping.shipment.delivered`.

---
## E11 — Plataforma: notificações, integrações, admin, auditoria (Fase 1)

- [ ] **US-058 — E-mails transacionais** (M) — RF-NOT-01; `EmailPort` (adapter SES/Resend/SendGrid + Mailpit em dev); templates React Email versionados.
- [ ] **US-059 — Webhooks de saída** (M) — RF-INT-02. Ver cenários no `arquitetura/03-integracoes.md`.
- [ ] **US-060 — API keys de seller** (P) — RF-INT-03.
- [ ] **US-061 — API pública v1 + SDK** (M) — RF-INT-04: catálogo, ofertas (bulk), pedidos (listar, detalhar, atualizar status), webhooks.
- [ ] **US-062 — Audit log** (P) — RF-AUD-01, RNF-AUD-01; interceptor + consumo de eventos sensíveis.
- [ ] **US-063 — Backoffice: shell, dashboard e configurações** (M) — RF-ADM-01, tabela de configuração `[config]`.
- [ ] **US-064 — CMS de home e banners** (P) — RF-CMS-01.
- [ ] **US-065 — Seller center: shell e onboarding guiado** (M) — checklist de primeiros passos.

---
### US-086 [ENABLER] — Prontidão de produção na Railway (marco 1.11)
- Ambiente `production` com as mesmas definições de staging, domínios definitivos e instâncias de produção da Clerk.
- PITR habilitado, backups de volume diário e semanal, **teste de restauração executado** e registrado em `docs/runbooks/restore.md`.
- Decisão registrada sobre Postgres HA e PgBouncer (com teste de carga RNF-PERF/RNF-TEN-02).
- Réplicas de `api` e `storefront`, alertas (webhooks da Railway + alertas de aplicação), runbooks de incidente e rollback.

## Fase 2 — Épicos (detalhar em stories no início da fase)
- **E00S SaaS comercial** — RF-SAAS-01..04 (cobrança), RF-TEN-09 (self-service + trial), RF-TEN-10 (export/offboarding).
- **E12 Reputação de seller** — RF-SEL-08, RN-PED-04/05, cancelamento automático RF-PED-06.
- **E13 Devoluções e disputas** — RF-DSP-01, RN-DSP-01..04, congelamento de saldo.
- **E14 Avaliações e perguntas** — RF-REV-01/02, RN-REV-01, RN-MSG-01.
- **E15 Promoções e cupons** — RF-PRO-01/02, RF-CHK-03.
- **E16 Fiscal** — RF-FIS-02/03.
- **E17a Financeiro avançado** — repasse automático, conciliação (RF-PAG-04), ajustes com dupla aprovação (RF-FIN-06).
- **E17b Mensageria e canais** — RF-MSG-01, RF-NOT-02/03.
- **E17c LGPD self-service, login social, boleto, antifraude** — RF-IAM-05/08, RF-CHK-05.

## Fase 3 — Ecossistema
- **E18 Apps OAuth e marketplace de integrações** — RF-INT-05.
- **E19 Conectores ERP/hubs** — RF-INT-06 (Bling, Tiny/Olist, Omie, Anymarket).
- **E20 Importação em massa e multi-gateway** — RF-CAT-07, RF-PAG-05.
- **E21 BI e relatórios** — RF-REP-01.

## Fase 4 — Crescimento
- **E26 Células dedicadas para tenants enterprise** (RF-TEN-12)
- **E22 Ads (produtos patrocinados)** · **E23 Buy box** (RF-OFR-06) · **E24 Recomendações e IA de conteúdo** (RF-CAT-08) · **E25 Fulfillment**.

# 07 — Checklist de Pré-voo (tudo que precisa existir para o agente não parar)

O Claude Code trabalha sozinho **desde que** contas, chaves e decisões existam na hora em que a story precisa delas.
Esta lista diz **o que**, **quem** faz e **até quando**. Itens de "Você" não podem ser feitos pelo agente
(exigem cadastro, pagamento, contrato ou decisão de negócio).

Legenda: ☐ pendente · ◑ parcial (a coluna "Por quê" diz o que falta) · ☑ feito

## A. Antes da Fase 0 (antes de US-001)

| ☐ | Item | Quem | Onde / como | Por quê |
|---|---|---|---|---|
| ☐ | Conta Claude Pro/Max + Claude Code instalado | Você | `GUIA-DE-INICIO.md` Passos 1–2 | executar o agente |
| ☐ | Repositório `marketPlaceWss` com o kit na raiz e 1º push | Você | Guia Passos 3–5 | base de tudo |
| ☐ | Proteção do branch `main` (PR + CI obrigatórios) | Você | GitHub → Settings → Branches | nada quebrado entra |
| ☐ | Branch `production` criado a partir do `main` | Você | `git checkout -b production && git push -u origin production` | deploy de produção separado |
| ☐ | Docker Desktop, Node LTS, pnpm, Git | Você | Guia Passo 1 | ambiente local |
| ☑ | Clerk: apps **Plataforma** e **Console** (instâncias de desenvolvimento), Organizations ativado na Plataforma | Você | Guia Passo 6 | US-082 |
| ◑ | `.env` local preenchido com chaves de dev da Clerk | Você | `cp .env.example .env` | US-082 — falta só o webhook secret das 2 apps (seção G) |
| ☐ | `.claude/settings.json` revisado (permissões do agente) | Você | já vem no kit | menos interrupções, segredos protegidos |
| ☐ | `docs/progresso.md` com suas instruções iniciais (opcional) | Você | seção "Instruções do humano" | orienta o modo autônomo |
| ☐ | Decisão **D11** (conta de comprador isolada ou única) | Você | `docs/01-visao-produto.md` §8 | muda US-010 |

## B. Antes de US-084 (deploy em staging — fim da Fase 0)

| ☐ | Item | Quem | Onde / como | Por quê |
|---|---|---|---|---|
| ☐ | Conta Railway no plano **Pro** (PITR, réplicas, 20 domínios/serviço) | Você | railway.com | ADR-014 |
| ☐ | Projeto `marketplace` com ambientes `staging` e `production`; **PR environments** habilitados | Você | dashboard Railway | pipeline |
| ☐ | Railway conectada ao GitHub (repo `marketPlaceWss`) com **Wait for CI** | Você | Settings do projeto/serviço | deploy só com CI verde |
| ☐ | Railway CLI instalada e `railway login` feito | Você | `npm i -g @railway/cli` (ou instalador oficial) | agente usa contexto local |
| ☐ | Plugin da Railway no Claude Code | Você | `/plugin install railway@claude-plugins-official` | agente opera a infra |
| ☐ | Serviços de dados criados em `staging`: `postgres`, `redis`, `meilisearch`, bucket `media` | Você ou agente (com sua confirmação) | dashboard/CLI | US-084 |
| ☐ | Bootstrap de roles executado em `staging` | Você | Guia Passo 11.4 | RLS efetivo |
| ☐ | Senhas das roles como **variáveis compartilhadas** (`DB_*_PASSWORD`) | Você | Railway → Shared Variables | referências entre serviços |

## C. Antes do marco 1.0 / US-085 (domínios)

| ☐ | Item | Quem | Onde / como | Por quê |
|---|---|---|---|---|
| ☐ | Domínio da plataforma registrado (ex.: `suaplataforma.com.br`) | Você | Registro.br | subdomínios dos tenants |
| ☐ | DNS do domínio no **Cloudflare** | Você | trocar nameservers no Registro.br | wildcard + Cloudflare for SaaS |
| ☐ | Cloudflare for SaaS (Custom Hostnames) habilitado na zona; token de API com permissão de SSL/Custom Hostnames | Você | Cloudflare → SSL/TLS → Custom Hostnames | domínios próprios de tenants |
| ☐ | Registros DNS: `*.`, `api.`, `admin.`, `vendedor.`, `console.`, `edge-origin.` → Railway | Agente prepara a lista; você cadastra | Cloudflare DNS | acesso público |

## D. Antes do marco 1.9/1.10 (provedores reais)

| ☐ | Item | Quem | Onde / como | Bloqueia |
|---|---|---|---|---|
| ☐ | **D2** gateway escolhido + conta **sandbox** com split/recebedores | Você | Pagar.me / Mercado Pago / Asaas / Iugu / Stripe | US-040, US-036 |
| ☐ | Conta sandbox **Melhor Envio** (ou alternativa) | Você | melhorenvio.com.br | US-054 |
| ☐ | Provedor de e-mail (ex.: Resend ou SES) + domínio com SPF/DKIM verificados | Você | painel do provedor + DNS Cloudflare | US-058 |
| ☐ | **D3, D4, D5, D6** (comissão, frete, prazo de repasse, moderação) | Você | `docs/01-visao-produto.md` §8 | ledger, shipping |
| ☐ | Túnel para webhooks em dev (cloudflared/ngrok) — ou usar ambiente `pr` | Agente | — | webhooks Clerk/gateway |

## E. Antes do go-live (US-086)

| ☐ | Item | Quem | Bloqueia |
|---|---|---|---|
| ☐ | Clerk: instâncias de **produção** das duas apps + registros DNS exigidos pela Clerk | Você | login em produção |
| ☐ | Gateway em produção (KYC da conta do primeiro tenant) | Você/tenant | vendas reais |
| ☐ | PITR + backups agendados + teste de restauração feito | Você + agente | RNF-DISP-02 |
| ☐ | Termos de uso, política de privacidade (Clerk, Railway, Cloudflare como suboperadores), DPA com tenants, contrato de intermediação com sellers | Você + jurídico | ADR-006, LGPD |
| ☐ | **D7, D8, D9** (cobrança SaaS, gateway por tenant, provisionamento) | Você | Fase 2 |

## G. Identificadores do projeto (não secretos — podem ficar no repositório)

| Recurso | Identificador | Observação |
|---|---|---|
| Repositório Git | https://github.com/wsssistemas2626-crypto/marketPlaceWss.git | branch principal `main`; produção em `production` |
| Clerk — app **Plataforma** (`MARKET-PLACE`) | app `app_3JdjODM84APxXF6dL2ewdZNHU7V` | confirmado em 2026-09-22 via `clerk apps list` |
| Clerk — Plataforma, instância de **desenvolvimento** | `ins_3JdjOCSAXjtD5HOerVfEyCIEAWF` | confirmado: `kid` do JWKS = este ID; host `blessed-python-4747.clerk.accounts.dev` |
| Clerk — app **Console** (`Marketplace Console`) | app `app_3JgVPGBGAFELPrdSnwsWkcOgFUa` | já existia; reutilizada em vez de criar duplicata |
| Clerk — Console, instância de **desenvolvimento** | `ins_3JgVPJdIRn3rMeMy13oKSJDJjct` | host `ace-ox-2680.clerk.accounts.dev` |
| Clerk — instâncias de produção | _pendente_ | criar antes do go-live (seção E) |
| Railway — projeto `marketplace` | _pendente_ | seção B |

### Configuração aplicada nas instâncias de dev (2026-09-22, via `clerk config patch`)

| Instância | Configuração | Valor |
|---|---|---|
| Plataforma | `organization_settings.enabled` | `true` (orgs = tenants e sellers, ADR-013) |
| Plataforma | `organization_settings.force_organization_selection` | `false` desde 2026-09-22 — ver a nota abaixo |
| Plataforma | `organization_settings.slug_disabled` | `true` (padrão da instância): organização se identifica pelo `publicMetadata`, não por slug |
| Plataforma | `organization_settings.max_allowed_memberships` | `0` (ilimitado) — o limite de membros é **entitlement de plano** no nosso `ConfigService`, não teto da Clerk |
| Console | `auth_access_control.sign_up_mode` | `restricted` — staff entra **somente por convite** |
| Console | `auth_access_control.block_disposable_email_domains` | `true` |
| Console | `auth_multi_factor` | TOTP + backup codes, `required_for_sign_in: true` |

> **Por que `force_organization_selection` voltou para `false`:** com ele ligado, a sessão de quem ainda não
> escolheu organização fica *pendente*; o `auth()` do Next trata pendente como deslogado e o `auth.protect()`
> devolve para o login, que vê a sessão válida e manda de volta — laço, tela em branco. Quem obriga a escolha
> agora é o nosso middleware, que manda para `/organizacao` (a tela com o `OrganizationList`), e quem decide o
> tenant continua sendo a API pelo `identity.org_links`.

> A Clerk **não** permite `sign_up_mode: restricted` junto com `allowlist_enabled: true` — são modos mutuamente
> exclusivos (a API aceita o patch e devolve `allowlist_enabled: false`). `restricted` é o mais forte dos dois e foi
> o escolhido, então a Console não usa allowlist. Convites: `clerk api /invitations -X POST`.

**Pendente (só existe após criar o endpoint; não há API de leitura):** `CLERK_WEBHOOK_SIGNING_SECRET` e
`CONSOLE_CLERK_WEBHOOK_SIGNING_SECRET`. Em **cada** app: Dashboard → **Configure** → **Webhooks** → **+ Add Endpoint**
→ URL → assinar `user.*`, `organization.*`, `organizationMembership.*` → **Create** → copiar o **Signing Secret**
(`whsec_…`) para o `.env`.

O ID de instância (`ins_...`) só identifica a instância no dashboard e no suporte da Clerk; ele **não** substitui as
chaves. Publishable key, secret key, JWT key e webhook secret continuam indo apenas no `.env` (local) e nas variáveis
da Railway.

## F. Onde cada chave mora

| Chave | Local (`.env`) | Railway | Nunca |
|---|---|---|---|
| Clerk publishable | sim | frontends | — |
| Clerk secret / JWT key / webhook secret | sim | api (e server-side do Next) | chat, código, commit |
| Senhas das roles do banco | sim (valores locais) | Shared Variables | chat, código, commit |
| URL do superusuário `postgres` | só no terminal, na hora do bootstrap | **não** configurar em serviços | serviços de aplicação |
| Credenciais do gateway/frete de cada tenant | — | **banco, criptografadas** (hub de integrações) | variáveis de ambiente |
| Token da API do Cloudflare | sim | api | chat, commit |

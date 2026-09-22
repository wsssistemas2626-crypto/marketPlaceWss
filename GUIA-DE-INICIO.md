# Guia de Início — do zero à primeira story

> Para o fluxo **autônomo** (recomendado depois da primeira story), siga `docs/08-roteiro-desenvolvimento-autonomo.md`.

Repositório do projeto: **https://github.com/wsssistemas2626-crypto/marketPlaceWss**

Este guia leva você da máquina vazia até o Claude Code implementando as stories. Siga na ordem.
Onde Windows, macOS e Linux diferem, há indicação.

**O que vai acontecer:** você instala as ferramentas, clona o repositório, coloca o conteúdo deste kit na raiz dele,
cria as aplicações na Clerk (login), envia tudo ao GitHub e abre o Claude Code dentro da pasta. Ele desenvolve story
por story, sempre pedindo sua aprovação antes de codar. O kit não é código: é o manual que o Claude Code segue.

---

## Passo 1 — Pré-requisitos

| Ferramenta | Para quê | Onde |
|---|---|---|
| Conta Claude Pro, Max, Team ou Enterprise | Claude Code (o plano gratuito não inclui). Para este projeto, o Max é o mais confortável | claude.ai |
| Git | Controle de versão | git-scm.com |
| Node.js LTS (22 ou superior) | Runtime do projeto | nodejs.org |
| pnpm | Gerenciador do monorepo | `corepack enable && corepack prepare pnpm@latest --activate` |
| Docker Desktop | Postgres, Redis, Meilisearch, Mailpit e MinIO locais | docker.com (deixe aberto ao desenvolver) |
| VS Code | Ler e revisar o código | code.visualstudio.com |
| Conta na Clerk | Login dos painéis (ADR-013) | clerk.com |
| Conta no GitHub com acesso ao repositório | Versionamento e CI | github.com |
| Conta Railway (plano Pro) | Banco, cache, storage e deploy — só necessária no fim da Fase 0 | railway.com |

**Windows — use WSL2 (recomendado):**
1. PowerShell como administrador: `wsl --install` e reinicie.
2. Docker Desktop → *Settings → Resources → WSL Integration* → ative para o Ubuntu.
3. Instale Git, Node e pnpm **dentro do Ubuntu**.
4. Guarde o projeto em `~/projetos/...` (dentro do Linux), **nunca** em `/mnt/c/...` (fica muito lento).

**Verificação** (todos devem responder uma versão):
```bash
git --version
node --version        # v22 ou superior
pnpm --version
docker --version
docker compose version
```

---

## Passo 2 — Instalar o Claude Code

macOS, Linux ou WSL:
```bash
curl -fsSL https://claude.ai/install.sh | bash
```
Windows nativo (sem WSL), no PowerShell: `irm https://claude.ai/install.ps1 | iex`

Verifique com `claude --version`. Na primeira execução de `claude`, o navegador abre para login (só uma vez).
Se o comando não for encontrado, feche e reabra o terminal.

---

## Passo 3 — Clonar o repositório

```bash
mkdir -p ~/projetos
cd ~/projetos
git clone https://github.com/wsssistemas2626-crypto/marketPlaceWss.git
cd marketPlaceWss
```

O GitHub vai pedir autenticação. A forma mais simples é instalar o GitHub CLI e rodar `gh auth login` antes
do clone. Alternativa: usar um *Personal Access Token* como senha.

Se o repositório estiver vazio, o Git avisa "You appear to have cloned an empty repository" — isso é normal.

---

## Passo 4 — Colocar o kit na raiz do repositório

Cuidados:
- O zip contém uma pasta `marketplace-kit/`. Você quer o **conteúdo** dela na raiz do repositório, não a pasta.
- Há arquivos ocultos (começam com ponto): `.claude/`, `.env.example`, `.gitignore`. O Explorer e o Finder os
  escondem. **Copie pelo terminal.**

macOS / Linux (zip em Downloads):
```bash
cd ~/projetos/marketPlaceWss
unzip ~/Downloads/marketplace-kit.zip -d /tmp/kit
cp -r /tmp/kit/marketplace-kit/. .
rm -rf /tmp/kit
```

WSL (Downloads do Windows):
```bash
sudo apt install -y unzip          # só na primeira vez
cd ~/projetos/marketPlaceWss
unzip /mnt/c/Users/SEU_USUARIO/Downloads/marketplace-kit.zip -d /tmp/kit
cp -r /tmp/kit/marketplace-kit/. .
rm -rf /tmp/kit
```

Se o repositório já tinha um `README.md`, o `cp` o substitui pelo do kit. Se quiser manter algo do antigo,
confira com `git diff README.md` antes do commit.

**Confira com `ls -la`.** A raiz precisa ficar assim:
```
marketPlaceWss/
├── .claude/commands/        (implementar-story, novo-adapter, novo-modulo, revisar-arquitetura)
├── .claude/settings.json    (permissões do agente)
├── .env.example
├── .gitignore
├── CLAUDE.md
├── GUIA-DE-INICIO.md
├── README.md
└── docs/
    ├── 01-visao-produto.md … 06-plano-execucao.md
    ├── 07-checklist-pre-desenvolvimento.md
    ├── adr/            (ADR-001 a ADR-014)
    └── arquitetura/    (01 a 07)
└── infra/db/           (bootstrap-roles.sql, local-init.sh, module-schema-template.sql)
```
Sinais de erro: `marketPlaceWss/marketplace-kit/...` (um nível a mais — mova para cima) ou ausência de `.claude/`
(repita a cópia pelo terminal). As pastas `apps/` e `packages/` ainda não existem: o Claude Code cria na Fase 0.

---

## Passo 5 — Primeiro commit e envio ao GitHub

```bash
git checkout -B main
git add .
git commit -m "docs: kit inicial de requisitos e arquitetura"
git push -u origin main
```

Se o push for rejeitado porque o repositório remoto já tem commits (ex.: README criado pelo GitHub):
```bash
git pull origin main --rebase --allow-unrelated-histories   # se o rebase reclamar, use: git pull origin main --allow-unrelated-histories
git push -u origin main
```

Proteja o `main` no GitHub (*Settings → Branches → Add rule*): exigir Pull Request e CI verde antes do merge.
Isso impede que algo quebrado entre sem revisão.

---

## Passo 6 — Configurar a Clerk (login dos painéis)

Por que duas aplicações e por que compradores não usam a Clerk: ver `docs/adr/ADR-013-autenticacao-clerk.md`.
Os nomes dos menus da Clerk podem mudar com o tempo; se algo não bater, procure a opção equivalente no dashboard.

### 6.1 Aplicação "Marketplace Plataforma" (admin do tenant + seller center)
1. Em dashboard.clerk.com, crie uma aplicação chamada **Marketplace Plataforma**.
2. Métodos de login: e-mail + senha (e Google, se quiser).
3. Ative **Organizations** nas configurações da aplicação.
4. Em **API Keys**, copie a *Publishable key*, a *Secret key* e a *JWT public key* para o `.env`
   (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`).
5. Papéis, permissões, claims customizadas do token de sessão (`org_kind`, `tenant_id`, `seller_id`) e webhooks
   serão configurados **pelo Claude Code** nas stories US-082 e US-013, com script versionado. O Claude Code confirma a
   sintaxe exata na documentação atual da Clerk nesse momento.

### 6.2 Aplicação "Marketplace Console" (staff da plataforma)
1. Crie outra aplicação chamada **Marketplace Console**.
2. Restrinja o cadastro (allowlist com os e-mails da sua equipe, ou apenas por convite).
3. Exija MFA para todos os usuários.
4. Copie as chaves para as variáveis `CONSOLE_*` do `.env`.

### 6.3 Criar o `.env`
```bash
cp .env.example .env
code .env        # preencha as chaves da Clerk; o resto já vem pronto para desenvolvimento local
```
O `.env` está no `.gitignore` e **nunca** vai para o GitHub. Confira com `git status` (ele não deve aparecer).

**Webhooks da Clerk em desenvolvimento:** a Clerk precisa alcançar sua máquina. Na US-082, o Claude Code vai
sugerir um túnel (ex.: `cloudflared` ou `ngrok`) e a URL a cadastrar em *Webhooks* no dashboard. Até lá, não precisa.

---

## Passo 7 — Revisar as decisões em aberto (15 minutos que valem semanas)

Abra o projeto com `code .` e leia em `docs/01-visao-produto.md`:
- **§7 Suposições** — corrija o que não bater com o seu negócio.
- **§8 Decisões em aberto** — preencha as que já souber (ex.: "D2: Pagar.me"). A **D11** (conta de comprador
  isolada por marketplace ou única) precisa ser decidida antes da US-010.

Depois:
```bash
git add . && git commit -m "docs: decisões de negócio" && git push
```

---

## Passo 8 — Primeira sessão do Claude Code

```bash
cd ~/projetos/marketPlaceWss
claude
```
**Não rode `/init`** — ele gera um CLAUDE.md, e o seu já existe.

O kit traz `.claude/settings.json` com permissões pré-aprovadas (pnpm, testes, git local, docker compose) e bloqueios
(ler o `.env`, `git push --force`, apagar recursos na Railway). Isso evita que o agente pare a cada comando e protege
seus segredos. Digite `/permissions` para ver ou ajustar.

**8.1 Teste de entendimento:**
```
Leia CLAUDE.md, docs/01-visao-produto.md, docs/arquitetura/01-visao-arquitetura.md,
docs/arquitetura/06-multi-tenancy.md, o ADR-012 e o ADR-013. Explique em 10 linhas o sistema,
o isolamento entre tenants, como funciona o login com a Clerk e qual é a primeira story.
Não escreva código.
```
A resposta deve citar monólito modular, RLS, TenantContext, Clerk com Organizations para painéis, login próprio
de compradores e US-001. Digite `/` e confirme que aparecem os comandos `implementar-story`, `novo-modulo`,
`novo-adapter` e `revisar-arquitetura`.

**8.2 Primeira story:**
```
/implementar-story US-001
```
1. Ele apresenta um **plano** sem codar. Leia, questione, ajuste e responda "aprovado, pode implementar".
2. Ele pede permissão para rodar comandos. Leia cada um; comandos seguros e repetitivos (`pnpm test`, `pnpm lint`)
   podem ser liberados para a sessão.
3. Ao final, roda lint e testes, cria a branch e marca a story no `docs/05-backlog.md`.

**Shift+Tab** alterna o modo de permissão; o **modo de planejamento** garante que ele só planeje, sem editar.

**8.3 Conferir você mesmo** (outro terminal):
```bash
docker compose up -d
pnpm install
pnpm dev
```
Abra `http://localhost:<porta>/health` (a porta aparece no resumo da story).

---

## Passo 9 — Ciclo de cada story

1. `/clear` no Claude Code (contexto limpo = resultados melhores).
2. `/implementar-story US-0XX`
3. Revise e aprove o plano.
4. Revise o resultado: `git diff main` (ou aba Source Control do VS Code) e `pnpm lint && pnpm typecheck && pnpm test`.
5. Envie a branch e abra um Pull Request:
   ```bash
   git push -u origin feat/US-0XX-descricao
   gh pr create --fill            # ou abra o PR pelo site do GitHub
   ```
6. Com o CI verde e sua revisão feita, faça o merge no GitHub e atualize a máquina:
   ```bash
   git checkout main && git pull
   ```
7. Próxima story.

**Ordem da Fase 0** (o multi-tenancy vem antes da primeira tabela; a Clerk antes do console; a Railway por último):

US-001 → US-002 → US-003 → US-070 → US-004 + US-071 → US-005 + US-072 → US-006 → US-007 → US-073 → US-009 →
**US-082 (Clerk)** → US-075 → US-074 → US-008 → **US-084 (Railway — faça o Passo 11 antes)**

Depois, siga os marcos da Fase 1 em `docs/06-plano-execucao.md`.

---

## Passo 10 — Fechar cada fase

Rode `/revisar-arquitetura`. O relatório vai para `docs/revisoes/`. Achados **críticos** (isolamento entre tenants,
autenticação) devem ser corrigidos antes de avançar.

**A Fase 0 está pronta quando:**
- `docker compose up -d && pnpm dev` sobe sem erros;
- `http://loja-a.localhost:<porta>` e `http://loja-b.localhost:<porta>` respondem como tenants diferentes
  (endereços `*.localhost` funcionam direto no Chrome, Edge e Firefox);
- você entra no admin com um usuário Clerk da organização da loja-a e **não** vê dados da loja-b;
- a suíte de isolamento (US-074) passa;
- o CI está verde no GitHub.

---

## Passo 11 — Preparar a Railway (antes da US-084, fim da Fase 0)

Até aqui tudo roda na sua máquina. A US-084 publica o sistema na Railway. Faça isto antes dela
(checklist completo em `docs/07-checklist-pre-desenvolvimento.md`, seção B).

**11.1 Conta e projeto**
1. Crie a conta em railway.com e assine o plano **Pro** (necessário para PITR, réplicas e domínios).
2. Crie o projeto `marketplace`, conecte ao repositório `marketPlaceWss` e crie os ambientes `staging` e `production`.
   Ative os **PR environments**.
3. Em `staging`, adicione: **PostgreSQL** (nomeie o serviço `postgres`), **Redis** (`redis`), **Bucket** (`media`) e um
   serviço Docker com a imagem do Meilisearch (`meilisearch`, com volume). O Claude Code pode fazer isso via plugin
   se você preferir — ele vai pedir confirmação.

**11.2 CLI e plugin**
```bash
npm i -g @railway/cli
railway login
railway link          # escolha o projeto marketplace e o ambiente staging
```
No Claude Code: `/plugin install railway@claude-plugins-official`

**11.3 Senhas das roles do banco**
Gere três senhas fortes:
```bash
openssl rand -base64 24   # rode 3 vezes: migrator, app, platform
```
Cadastre-as na Railway em **Shared Variables** do ambiente `staging` como `DB_MIGRATOR_PASSWORD`, `DB_APP_PASSWORD`
e `DB_PLATFORM_PASSWORD`.

**11.4 Bootstrap das roles (uma vez por ambiente)**
Por que: o usuário padrão `postgres` é superusuário e ignora o isolamento entre tenants (RLS). A aplicação precisa
usar roles próprias. Copie a `DATABASE_PUBLIC_URL` do serviço `postgres` (aba Variables) e rode, sem instalar nada
além do Docker:
```bash
docker run --rm -it -v "$PWD/infra/db:/b" postgres:17   psql "COLE_AQUI_A_DATABASE_PUBLIC_URL"   -v migrator_password='SENHA_MIGRATOR'   -v app_password='SENHA_APP'   -v platform_password='SENHA_PLATFORM'   -f /b/bootstrap-roles.sql
```
A última linha da saída deve listar `app`, `migrator` e `platform` com `rolsuper = f`; só `platform` com
`rolbypassrls = t`. Repita no ambiente `production` antes do go-live (com senhas diferentes).

**11.5 Rodar a story**
```
/implementar-story US-084
```
O agente cria Dockerfiles, `railway.json` de cada app e as variáveis de referência, e explica o que você precisa
clicar no painel (ex.: caminho do arquivo de config de cada serviço e "Wait for CI").

---

## Problemas comuns

| Sintoma | Solução |
|---|---|
| Claude Code confuso ou repetindo erros | `/clear` e recomece a story com instrução mais específica |
| Ele quer contrariar os documentos | "Siga o CLAUDE.md e o ADR-0XX". Se a ideia dele for melhor: "crie um ADR com status Proposto" |
| Desativou teste ou regra de lint para passar | Não aceite: "reverta e corrija a causa" |
| Erro de conexão com banco/Redis | Docker Desktop fechado → abra e rode `docker compose up -d` |
| "Porta já em uso" | Feche o outro programa ou peça ao Claude Code para trocar a porta |
| 401 em todas as rotas do painel | Chaves da Clerk erradas no `.env`, ou `CLERK_AUTHORIZED_PARTIES` sem a URL do painel |
| 403 "organização não mapeada" | Usuário sem organização ativa ou organização criada à mão sem `org_links` — use o seed/fluxo de provisionamento |
| `.env` aparece no `git status` | Pare: confira o `.gitignore`. Se já foi commitado, **troque todas as chaves na Clerk** |
| Push rejeitado | `git pull --rebase` e depois `git push` |
| Deploy na Railway não inicia | Veja se o CI do GitHub passou ("Wait for CI") e se o caminho do `railway.json` está certo no serviço |
| "permission denied" / RLS bloqueando tudo em staging | Bootstrap de roles não foi feito ou senhas das Shared Variables diferentes das usadas no bootstrap |
| `ENOTFOUND redis.railway.internal` | Conexão BullMQ/ioredis sem `family: 0` — peça ao agente para seguir a armadilha 3 do doc de infraestrutura |
| Healthcheck falhando na Railway | App não está lendo `PORT` ou não escuta em `::` |
| Story marcada (G) | Aceite a quebra proposta e implemente uma parte por vez |
| Módulos financeiros | Peça os testes **antes** da implementação e revise linha a linha |

---

## Onde procurar cada coisa

| Se você quer saber... | Abra |
|---|---|
| O que o sistema faz, para quem, em que fase | `docs/01-visao-produto.md` |
| Qual é a próxima story | `docs/06-plano-execucao.md` |
| Critérios de aceite de uma story | `docs/05-backlog.md` |
| Uma regra de negócio | `docs/04-regras-de-negocio.md` |
| Como os módulos se falam | `docs/arquitetura/02-modulos.md` |
| Como plugar gateway, frete, ERP | `docs/arquitetura/03-integracoes.md` |
| Isolamento entre tenants | `docs/arquitetura/06-multi-tenancy.md` |
| Por que Clerk e como ela se encaixa | `docs/adr/ADR-013-autenticacao-clerk.md` |
| Como está montada a Railway | `docs/arquitetura/07-infraestrutura-railway.md` |
| O que precisa existir antes de cada fase | `docs/07-checklist-pre-desenvolvimento.md` |
| Por que tal tecnologia | `docs/adr/` |

# 08 — Roteiro para iniciar o desenvolvimento autônomo

Repositório: `https://github.com/wsssistemas2626-crypto/marketPlaceWss.git`
Clerk (app Plataforma, dev): `ins_3JdjOCSAXjtD5HOerVfEyCIEAWF`

Este roteiro leva você do zero até o Claude Code desenvolvendo sozinho, parando só nos **checkpoints** para sua revisão.
Tempo estimado até a primeira execução autônoma: **1h30 a 2h** (a maior parte é instalação).

**Como funciona a autonomia neste projeto**

| Peça | Papel |
|---|---|
| `CLAUDE.md` | Regras que o agente segue sempre |
| `docs/05-backlog.md` + `06-plano-execucao.md` | O que construir e em que ordem |
| `/continuar` | Executa stories em sequência: planeja, implementa, testa, faz commit — sem pedir aprovação a cada passo |
| `docs/progresso.md` | Memória entre sessões: onde parou, bloqueios, suas instruções |
| `.claude/settings.json` | Libera comandos seguros sem perguntar; bloqueia os perigosos |
| Checkpoints | Pontos em que o agente **para**, abre um Pull Request e entrega um relatório para você revisar |

Você deixa de aprovar cada passo e passa a revisar **blocos de 3 a 5 stories**.

---

## ETAPA 1 — Preparar a máquina (uma vez)

### 1.1 Windows: instalar o WSL2 (pule se usa macOS ou Linux)
PowerShell **como administrador**:
```powershell
wsl --install
```
Reinicie o computador. Abra o app **Ubuntu**, crie usuário e senha. **Todos os comandos seguintes rodam no Ubuntu.**

### 1.2 Ferramentas básicas
Ubuntu/WSL:
```bash
sudo apt update && sudo apt install -y git unzip curl build-essential
```
macOS (com Homebrew):
```bash
brew install git
```

### 1.3 Node.js LTS e pnpm
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
# feche e reabra o terminal
nvm install --lts
corepack enable
corepack prepare pnpm@latest --activate
```

### 1.4 Docker Desktop
Instale pelo site docker.com. No Windows: *Settings → Resources → WSL Integration* → ative o Ubuntu.
Deixe o Docker Desktop **aberto** sempre que for desenvolver.

### 1.5 GitHub CLI (facilita login e Pull Requests)
Ubuntu/WSL:
```bash
sudo apt install -y gh
```
macOS: `brew install gh`. Depois:
```bash
gh auth login        # GitHub.com → HTTPS → Login with a web browser
```

### 1.6 Claude Code
```bash
curl -fsSL https://claude.ai/install.sh | bash
# feche e reabra o terminal
claude --version
```

### ✅ Verificação da Etapa 1
```bash
git --version && node --version && pnpm --version && docker --version && docker compose version && gh --version && claude --version
```
Todos precisam responder com versão. Node deve ser 22 ou superior.

---

## ETAPA 2 — Montar o repositório (uma vez)

### 2.1 Clonar
```bash
mkdir -p ~/projetos && cd ~/projetos
git clone https://github.com/wsssistemas2626-crypto/marketPlaceWss.git
cd marketPlaceWss
```

### 2.2 Copiar o kit para a raiz
Baixe o `marketplace-kit.zip`. Depois (ajuste o caminho do zip):

macOS/Linux:
```bash
unzip ~/Downloads/marketplace-kit.zip -d /tmp/kit
cp -r /tmp/kit/marketplace-kit/. .
rm -rf /tmp/kit
```
WSL (troque `SEU_USUARIO` pelo seu usuário do Windows):
```bash
unzip /mnt/c/Users/SEU_USUARIO/Downloads/marketplace-kit.zip -d /tmp/kit
cp -r /tmp/kit/marketplace-kit/. .
rm -rf /tmp/kit
```

### 2.3 Conferir
```bash
ls -la
ls .claude/commands
```
Precisa aparecer: `.claude/`, `.env.example`, `.gitignore`, `CLAUDE.md`, `GUIA-DE-INICIO.md`, `README.md`, `docs/`, `infra/`.
Em `.claude/commands`: `continuar.md`, `implementar-story.md`, `novo-adapter.md`, `novo-modulo.md`, `revisar-arquitetura.md`.

> Se aparecer uma pasta `marketplace-kit/` dentro do repositório, você copiou a pasta em vez do conteúdo.
> Rode `cp -r marketplace-kit/. . && rm -rf marketplace-kit`.

### 2.4 Primeiro commit, push e branch de produção
```bash
git checkout -B main
git add .
git commit -m "docs: kit de requisitos, arquitetura e automação do desenvolvimento"
git push -u origin main
git checkout -b production && git push -u origin production && git checkout main
```
Se o push for rejeitado (repositório já tinha arquivos):
```bash
git pull origin main --allow-unrelated-histories --no-edit
git push -u origin main
```

### 2.5 Proteger o `main`
No GitHub: **Settings → Branches → Add branch ruleset** (ou *Add rule*) para `main`:
- ☑ Require a pull request before merging
- ☑ Require status checks to pass (marque o check do CI **depois** que a US-008 criar o workflow)
- ☑ Block force pushes

---

## ETAPA 3 — Clerk (15 minutos)

### 3.1 App Plataforma (já existe: `ins_3JdjOCSAXjtD5HOerVfEyCIEAWF`)
No dashboard da Clerk, abra essa aplicação e confira:
1. É a instância de **Development** (seletor no topo do dashboard).
2. **Organizations** está ativado (menu de configurações da aplicação → Organizations → Enable).
3. Métodos de login: e-mail + senha (Google opcional).
4. Em **API Keys**, você verá: *Publishable key* (`pk_test_...`), *Secret key* (`sk_test_...`) e a
   *JWT public key* (em "Show JWT public key" / PEM).

### 3.2 App Console (criar)
1. **Create application** → nome `Marketplace Console` → e-mail + senha.
2. Restrinja cadastros: *Restrictions* → **Allowlist** com o seu e-mail (e da equipe).
3. Exija MFA: *Multi-factor* → obrigatório.
4. Anote as chaves da aba **API Keys**.

### 3.3 Criar o `.env`
```bash
cp .env.example .env
code .env      # ou: nano .env
```
Preencha **somente** estas linhas por enquanto:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...        # app Plataforma
CLERK_SECRET_KEY=sk_test_...                         # app Plataforma
CLERK_JWT_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
CONSOLE_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... # app Console
CONSOLE_CLERK_SECRET_KEY=sk_test_...
CONSOLE_CLERK_JWT_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```
Os segredos de webhook (`whsec_...`) ficam em branco — o agente orienta na US-082.
O restante do `.env` já vem pronto para desenvolvimento local.

Confirme que o `.env` **não** vai para o Git:
```bash
git status        # .env NÃO pode aparecer na lista
```

---

## ETAPA 4 — Decisões mínimas (10 minutos)

Abra `docs/01-visao-produto.md`, seção 8. Para a **Fase 0** nada é bloqueante, mas decida já:
- **D11** — comprador com conta separada por marketplace (padrão) ou conta única? Se não souber, mantenha o padrão.

Se quiser orientar o agente, escreva em `docs/progresso.md`, seção **Instruções do humano**. Exemplos:
```
- Nome comercial provisório da plataforma: "WSS Marketplace"
- Priorizar clareza do código a otimizações prematuras
```
```bash
git add . && git commit -m "docs: decisões e instruções iniciais" && git push
```

---

## ETAPA 5 — Primeira sessão: validar o entendimento (10 minutos)

```bash
cd ~/projetos/marketPlaceWss
docker compose version   # Docker Desktop precisa estar aberto
claude
```
Na primeira vez, faça login no navegador. **Não rode `/init`.**

### 5.1 Conferir permissões e comandos
- Digite `/permissions` → devem aparecer as regras de `.claude/settings.json`.
- Digite `/` → devem aparecer `continuar`, `implementar-story`, `novo-modulo`, `novo-adapter`, `revisar-arquitetura`.

### 5.2 Teste de entendimento
Cole:
```
Leia CLAUDE.md, docs/progresso.md, docs/01-visao-produto.md, docs/06-plano-execucao.md,
docs/arquitetura/06-multi-tenancy.md, docs/arquitetura/07-infraestrutura-railway.md e os ADRs 012, 013 e 014.
Responda em até 15 linhas: (1) o que é o sistema, (2) como funciona o isolamento entre tenants,
(3) como é o login (Clerk x compradores), (4) por que a aplicação não pode usar o usuário postgres,
(5) quais stories compõem o checkpoint C1 e o que você vai entregar nele. Não escreva código.
```
**Critério:** a resposta cita monólito modular, RLS + TenantContext, Clerk com Organizations para painéis e login
próprio para compradores, superusuário ignorando RLS, e C1 = US-001, US-002, US-003.
Se algo vier errado, corrija na conversa antes de seguir.

---

## ETAPA 6 — Primeira story com você acompanhando (30–60 min)

Antes de liberar a autonomia, veja o agente trabalhar uma vez:
```
/implementar-story US-001
```
1. Ele mostra o plano. Leia e responda `aprovado, pode implementar`.
2. Acompanhe os comandos. O que está em `settings.json` roda sem perguntar; `git push` e `railway ...` perguntam.
3. Ao final, teste você mesmo em **outro terminal**:
   ```bash
   docker compose up -d
   pnpm install
   pnpm dev
   ```
   e abra o endereço de `/health` informado no resumo.

Se gostou do resultado, faça o PR dessa story (`gh pr create --fill`), merge no GitHub e atualize:
```bash
git switch main && git pull
```
Se preferir, pule a Etapa 6 e deixe a US-001 para o `/continuar`.

---

## ETAPA 7 — Ligar o modo autônomo

### 7.1 Deixar as edições de arquivo sem confirmação
Na sessão do Claude Code, aperte **Shift+Tab** até aparecer o modo de **aceitar edições automaticamente**
(*accept edits*). Assim o agente edita arquivos sem perguntar; comandos continuam regidos pelo `settings.json`.

> Não use a opção que ignora todas as permissões na sua máquina. O `settings.json` já dá autonomia suficiente
> mantendo bloqueados os comandos destrutivos.

### 7.2 Iniciar
```
/clear
/continuar
```
O agente vai, para cada story do checkpoint atual:
1. escrever o plano em `docs/planos/US-xxx.md` (sem esperar sua aprovação);
2. implementar com testes;
3. rodar lint, typecheck e testes até ficarem verdes;
4. fazer **um commit por story** na branch do checkpoint;
5. atualizar `docs/progresso.md`.

Ao terminar o checkpoint ele **para**, faz push, abre o Pull Request e entrega o relatório.

### 7.3 Enquanto ele trabalha
- Pode deixar rodando. Ele só pergunta ao fazer `git push`, operações na Railway ou `psql`.
- Quer interromper? **Esc**. Para retomar, digite `/continuar` de novo — ele lê o `progresso.md`.
- Sessão muito longa ficando confusa? `/clear` e `/continuar`: a memória está no `progresso.md`, não na conversa.

---

## ETAPA 8 — Revisar um checkpoint (20–40 min cada)

Quando o agente parar com o relatório:

1. **Leia o relatório** (stories, suposições, bloqueios, riscos).
2. **Teste localmente** com os comandos que ele indicou:
   ```bash
   git fetch && git switch <branch-do-checkpoint>
   pnpm install && docker compose up -d
   pnpm lint && pnpm typecheck && pnpm test
   pnpm dev
   ```
3. **Revise o código** no Pull Request do GitHub (aba *Files changed*) — foque em:
   - C2 e C4: isolamento entre tenants (RLS, `tenant_id`, testes cross-tenant). **Revisão linha a linha.**
   - C3: autenticação (validação do token Clerk e conferência organização → tenant).
4. Rode na sessão: `/revisar-arquitetura` e peça correção dos achados Críticos/Altos:
   ```
   Corrija os achados Críticos e Altos do relatório de revisão na mesma branch, um commit por correção.
   ```
5. **Merge** do PR no GitHub (com CI verde, a partir da US-008). Depois:
   ```bash
   git switch main && git pull
   ```
6. Se quiser mudar algo para os próximos checkpoints, escreva em `docs/progresso.md` → **Instruções do humano**.
7. Nova sessão limpa e siga:
   ```
   /clear
   /continuar
   ```

### O que conferir em cada checkpoint da Fase 0

| Checkpoint | Você confere | Sinal de problema |
|---|---|---|
| **C1** US-001–003 | `pnpm dev` sobe tudo; `/health` ok; lint de fronteiras falha ao importar interno de outro módulo | apps sem `/health`; `Money` usando float |
| **C2** US-070, 004, 071, 005, 072 | `loja-a.localhost` e `loja-b.localhost` resolvem tenants diferentes; consulta sem contexto retorna 0 linhas; evento duplicado processado uma vez | conexão da app com usuário `postgres`; `tenantId` lido do body |
| **C3** US-006, 007, 073, 009, 082 | login no admin com usuário Clerk; token inválido → 401; organização de outro tenant → 403 | SDK da Clerk importado dentro de `packages/modules/` |
| **C4** US-075, 074, 008 | console exige login da app Console; suíte de isolamento verde; CI roda no PR | rotas fora da suíte de isolamento |
| **C5** US-084 | merge no `main` publica staging; PR abre ambiente efêmero com seed | segredo em Dockerfile; serviço interno com domínio público |

Depois do C3, marque no GitHub o check do CI como obrigatório (Etapa 2.5).

---

## ETAPA 9 — Antes do C5: preparar a Railway

Siga o **Passo 11 do `GUIA-DE-INICIO.md`** (conta Pro, projeto, serviços, CLI, plugin, senhas das roles e bootstrap).
Checklist completo: `docs/07-checklist-pre-desenvolvimento.md`, seção B. Depois, `/continuar`.

---

## ETAPA 10 — Depois da Fase 0

1. Atualize `docs/progresso.md` → Fase 1, checkpoints a partir dos **marcos** de `docs/06-plano-execucao.md`
   (ou peça: `Monte em docs/progresso.md os checkpoints da Fase 1 a partir dos marcos 1.0 a 1.11`).
2. Resolva as decisões que cada marco exige (checklist seções C e D) — o agente segue com fakes enquanto isso.
3. Continue o ciclo: `/continuar` → revisar checkpoint → merge → `/clear` → `/continuar`.

---

## Quando o agente parar sozinho (e o que fazer)

| Motivo da parada | O que você faz |
|---|---|
| Fim de checkpoint | Etapa 8 |
| Criou ADR "Proposto" | Leia o ADR; aprove (mude para "Aceito") ou escreva sua decisão em "Instruções do humano"; `/continuar` |
| 3 tentativas sem ficar verde | Leia o diagnóstico; às vezes é ambiente (Docker fechado, porta ocupada). Dê uma dica específica e `/continuar` |
| Precisa de conta/chave | Resolva o item no checklist (07) e `/continuar` |
| Pediu confirmação de push/Railway | Leia o comando e aprove se fizer sentido |

## Dicas para render mais

- **Uma sessão por checkpoint.** Contexto limpo = menos erros.
- **Comunique pelo `progresso.md`**, não só pela conversa — a conversa some com `/clear`, o arquivo fica.
- **Não pule revisões de C2 e C4.** Erro de isolamento entre tenants é o mais caro de corrigir depois.
- **Não aceite teste desativado ou regra de lint desligada** para "passar". Peça para reverter e corrigir a causa.
- **Custos:** sessões autônomas longas consomem bastante do seu plano Claude; o plano Max é o mais adequado.

# erpWss — Kit de desenvolvimento autônomo do ERP Modular

Repositório: https://github.com/wsssistemas2626-crypto/erpWss

Este repositório começa só com documentação. O código é construído pelo Claude Code,
item a item, a partir do `PROGRESS.md`.

## Conteúdo

| Arquivo | Para quê |
|---|---|
| `CLAUDE.md` | Memória permanente do agente: stack, regras inegociáveis, convenções, variáveis de ambiente, DoD |
| `PROGRESS.md` | Backlog executável, estado atual e log de decisões |
| `autoloop.sh` | Loop de execução autônoma (v2, com timeout por rodada) |
| `.devcontainer/` | Ambiente isolado para rodar o loop com segurança |
| `.env.example` | Modelo das variáveis de ambiente (copie para `.env`) |
| `docs/00-visao.md` | Visão, atores, escopo por fase, fora de escopo |
| `docs/01-mapa-modulos.md` | Bounded contexts, responsabilidades e eventos entre módulos |
| `docs/02-rnf.md` | Requisitos não funcionais mensuráveis |
| `docs/03-glossario.md` | Linguagem ubíqua PT → EN usada no código |
| `docs/adr/` | Decisões arquiteturais (ADR-001 a ADR-007) |
| `docs/dominio/` | Modelos de dados de plataforma, cadastros e projetos |
| `docs/backlog/` | Stories com critérios de aceite (Fases 0 e 1) e roadmap (Fases 2 a 4) |

## Pré-requisitos humanos (antes de rodar o loop)

O agente não consegue fazer estes passos. Sem eles, os itens de autenticação param com `TAREFA_BLOQUEADA`.

### 1. Clerk (instância de desenvolvimento)
Aplicação Clerk do projeto: `app_3JdisYmzXgGLw4l1bhicBekMrMX`
(identificador da aplicação no Dashboard; não é segredo e não substitui as chaves abaixo).

1. No Dashboard, abra a aplicação acima e use a instância **Development**.
2. Em **Organizations**, habilite organizações. Cada organização será um tenant do ERP.
3. Em **Updates**, confirme que o **session token está na versão 2**.
4. Habilite login por e-mail e senha.
5. Crie uma organização de teste e um usuário de teste membro dela, com papel `admin`.
   Um e-mail com sufixo `+clerk_test` (ex.: `voce+clerk_test@example.com`) facilita a verificação em desenvolvimento.
6. Em **API keys**, copie a publishable key, a secret key e a JWT public key para o `.env`.
7. Webhooks (opcional em desenvolvimento): o sistema funciona sem eles graças ao provisionamento sob demanda.
   Para testá-los localmente, é preciso um túnel (ex.: ngrok) apontando para `/api/v1/webhooks/clerk`.

### 2. GitHub
- Cadastre os mesmos valores do `.env` como **Secrets** do repositório (Settings → Secrets and variables → Actions),
  para o CI do item F0-15.

## Como começar

1. Publique o kit no repositório:
   ```bash
   unzip erp-kit.zip && cd erp-kit
   git init -b main
   git add -A && git commit -m "docs: kit inicial do ERP"
   git remote add origin https://github.com/wsssistemas2626-crypto/erpWss.git
   git push -u origin main
   ```
   Se o repositório já tiver algum arquivo criado pelo GitHub (README, licença), rode antes do push:
   `git pull --rebase origin main` e resolva o conflito no README mantendo este.
2. Abra no VS Code e escolha **Reopen in Container** (ou use GitHub Codespaces).
   O container traz Node LTS, pnpm (via corepack), Docker (para Testcontainers) e o Claude Code.
3. Crie o `.env` a partir do `.env.example` com as chaves do Clerk de desenvolvimento.
4. Autentique o Claude Code dentro do container: `claude` (uma vez, interativo).
5. **Rode a primeira rodada acompanhando**, sem o loop, para validar o ambiente:
   ```bash
   claude "Leia o CLAUDE.md e o PROGRESS.md e execute o item F0-01."
   ```
   Revise o resultado, rode `pnpm verify` e faça commit.
6. Rode o loop:
   ```bash
   CHECK_CMD="pnpm verify" MAX_ITERACOES=4 ./autoloop.sh
   ```
   Aumente `MAX_ITERACOES` conforme ganhar confiança. Cada rodada tem limite de 45 minutos
   (`TIMEOUT_RODADA=60m` para mudar).
7. Envie os commits do loop ao GitHub quando revisar: `git push`.

## O que fazer quando o loop parar

| Saída | Significado | Ação |
|---|---|---|
| `0` | Backlog concluído | Revisar e planejar a próxima fase |
| `1` | Check falhou, timeout, erro ou rodada sem alterações | Ver `autoloop.log` e o branch `autoloop/falha-*`; corrigir, ou dividir o item se for grande demais; commit; rodar de novo |
| `2` | Bloqueado | Ler o Status do PROGRESS.md; decidir (se for decisão arquitetural, escrever um ADR; se faltar variável, preencher o `.env`); voltar Status para `EM_ANDAMENTO`; commit; rodar de novo |
| `3` | Limite de iterações | Normal; revisar os commits e continuar |

## Gates de fase

Ao final de cada fase há um item `GATE-*`. O loop para, e você revisa:
- o código de pelo menos um módulo por inteiro (não só diffs);
- se as regras do CLAUDE.md estão sendo respeitadas;
- as decisões menores registradas no log. Promova as recorrentes a regra no CLAUDE.md;
- antes de seguir para a Fase 2, detalhe os épicos dela em stories (a partir de `roadmap-fases-2-4.md`).

## Custos e cuidados

- Cada rodada consome uso do Claude Code. Comece com `MAX_ITERACOES` baixo.
- O loop usa `--dangerously-skip-permissions`: no container, só chaves da instância de **desenvolvimento** do Clerk.
  Nunca coloque credenciais de produção.
- O `.env` está no `.gitignore`. Confira antes de cada push que nenhum segredo foi commitado.
- O Clerk cobra por usuários/organizações ativos conforme o plano; confira os limites do plano gratuito antes de ter clientes.
- LGPD: os dados de identificação ficam no Clerk, fora do Brasil (ver ADR-004 e RNF024).

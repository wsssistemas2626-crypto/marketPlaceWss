#!/usr/bin/env bash
#
# autoloop.sh — Loop de execução autônoma para Claude Code (v2)
#
# Mudanças em relação à v1:
#   - Recusa rodar fora de container (usa --dangerously-skip-permissions).
#   - Exige repositório git limpo no início.
#   - Commit automático a cada iteração aprovada no CHECK_CMD (ponto de retorno por item).
#   - Se o CHECK_CMD falhar, salva a tentativa num branch "autoloop/falha-*" e restaura o
#     último estado bom, evitando PROGRESS.md dizendo "feito" sobre código quebrado.
#   - Leitura robusta do Status (procura os tokens em toda a seção, ignora linhas em branco).
#   - Detecta rodada sem nenhuma alteração (agente travado) e para.
#   - Timeout por rodada (TIMEOUT_RODADA, padrão 45m): rodada que estoura é tratada como falha.
#
# Uso:
#   CHECK_CMD="pnpm verify" ./autoloop.sh
#   MAX_ITERACOES=20 TIMEOUT_RODADA=60m CHECK_CMD="pnpm verify" ./autoloop.sh
#
# Códigos de saída: 0 concluído · 1 erro/falha de check · 2 bloqueado (decisão humana) · 3 limite de iterações

set -uo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
PROGRESS_FILE="${PROGRESS_FILE:-$PROJECT_DIR/PROGRESS.md}"
LOG_FILE="${LOG_FILE:-$PROJECT_DIR/autoloop.log}"
MAX_ITERACOES="${MAX_ITERACOES:-15}"
SLEEP_ENTRE_RODADAS="${SLEEP_ENTRE_RODADAS:-5}"
CHECK_CMD="${CHECK_CMD:-}"
CLAUDE_MODEL="${CLAUDE_MODEL:-}"
PROMPT_CUSTOM="${PROMPT_CUSTOM:-}"
AUTOLOOP_ALLOW_HOST="${AUTOLOOP_ALLOW_HOST:-0}"   # 1 = permite rodar fora de container (NÃO recomendado)
TIMEOUT_RODADA="${TIMEOUT_RODADA:-45m}"           # tempo máximo de uma rodada do Claude Code (formato do comando timeout)

TOKEN_CONCLUIDO="TAREFA_CONCLUIDA"
TOKEN_BLOQUEADO="TAREFA_BLOQUEADA"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

dentro_de_container() {
  [ -f /.dockerenv ] || [ -f /run/.containerenv ] || [ -n "${REMOTE_CONTAINERS:-}" ] || [ -n "${CODESPACES:-}" ]
}

checar_prerequisitos() {
  command -v claude &>/dev/null || { log "ERRO: 'claude' não encontrado no PATH."; exit 1; }
  command -v git &>/dev/null    || { log "ERRO: 'git' não encontrado no PATH."; exit 1; }
  command -v timeout &>/dev/null || { log "ERRO: 'timeout' (coreutils) não encontrado no PATH."; exit 1; }

  if ! dentro_de_container && [ "$AUTOLOOP_ALLOW_HOST" != "1" ]; then
    log "ERRO: este loop usa --dangerously-skip-permissions e deve rodar dentro de um container/devcontainer."
    log "      Se tiver certeza do que está fazendo, use AUTOLOOP_ALLOW_HOST=1."
    exit 1
  fi

  git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree &>/dev/null \
    || { log "ERRO: $PROJECT_DIR não é um repositório git. Rode 'git init' e faça o primeiro commit."; exit 1; }

  # o log do loop nunca entra nos commits
  local exclude_file; exclude_file="$(git -C "$PROJECT_DIR" rev-parse --git-path info/exclude)"
  case "$exclude_file" in /*) ;; *) exclude_file="$PROJECT_DIR/$exclude_file" ;; esac
  mkdir -p "$(dirname "$exclude_file")"
  grep -qxF "$(basename "$LOG_FILE")" "$exclude_file" 2>/dev/null || echo "$(basename "$LOG_FILE")" >> "$exclude_file"

  if [ -n "$(git -C "$PROJECT_DIR" status --porcelain)" ]; then
    log "ERRO: há alterações não commitadas. Faça commit ou stash antes de iniciar o loop."
    exit 1
  fi

  [ -f "$PROGRESS_FILE" ] || { log "ERRO: $PROGRESS_FILE não existe."; exit 1; }
  [ -f "$PROJECT_DIR/CLAUDE.md" ] || log "AVISO: CLAUDE.md não encontrado na raiz do projeto."
  [ -n "$CHECK_CMD" ] || log "AVISO: CHECK_CMD vazio. Nenhuma verificação será feita entre rodadas."
}

montar_prompt() {
  cat <<PROMPT
Leia o CLAUDE.md e depois o PROGRESS.md na raiz deste projeto.

Sua tarefa nesta rodada:
1. Identifique o PRIMEIRO item não marcado do backlog. Execute somente esse item.
2. Leia a story e os documentos que o item referencia antes de escrever código.
3. Implemente de ponta a ponta, com testes derivados dos critérios de aceite.
4. Rode o comando de verificação (${CHECK_CMD:-pnpm verify}) e corrija até passar.
5. Atualize o PROGRESS.md:
   - marque o item como concluído somente se a verificação passou
   - adicione uma entrada no "Log de decisões" (data, item, o que fez, decisões menores, pendências)
   - bloqueio real (decisão arquitetural fora dos ADRs, regra de negócio ambígua, credencial faltando):
     escreva "$TOKEN_BLOQUEADO" na seção Status e explique o motivo logo abaixo
   - se o item for um GATE, escreva "$TOKEN_BLOQUEADO" no Status com o resumo da fase
   - se todo o backlog estiver concluído, escreva "$TOKEN_CONCLUIDO" na seção Status
6. Não peça confirmação. Decida e prossiga, exceto nos casos de bloqueio do passo 5.
7. Não faça commits git. O script cuida disso.

${PROMPT_CUSTOM}

Trabalhe apenas dentro deste projeto.
PROMPT
}

# Conteúdo da seção "## Status" até o próximo "## "
secao_status() {
  awk '/^## Status/{f=1;next} /^## /{f=0} f' "$PROGRESS_FILE" 2>/dev/null
}

ultimo_item_log() {
  awk '/^## Log de decisões/{f=1;next} /^## /{f=0} f && NF' "$PROGRESS_FILE" | tail -n1 | sed 's/^[-* ]*//' | cut -c1-120
}

salvar_falha_e_restaurar() {
  local iteracao="$1" motivo="$2"
  local branch_atual branch_falha
  branch_atual="$(git rev-parse --abbrev-ref HEAD)"
  branch_falha="autoloop/falha-$(date '+%Y%m%d-%H%M%S')-it${iteracao}"
  git checkout -q -b "$branch_falha"
  git add -A
  git commit -q -m "autoloop: iteração ${iteracao} FALHOU (${motivo}) — estado salvo para análise" || true
  git checkout -q "$branch_atual"
  log "Tentativa salva no branch '$branch_falha'. Branch '$branch_atual' mantido no último estado bom."
}

main() {
  cd "$PROJECT_DIR" || exit 1
  checar_prerequisitos

  log "=== Iniciando autoloop.sh v2 ==="
  log "Projeto: $PROJECT_DIR · Branch: $(git rev-parse --abbrev-ref HEAD) · Máx. iterações: $MAX_ITERACOES · Timeout/rodada: $TIMEOUT_RODADA"
  [ -n "$CHECK_CMD" ] && log "Verificação: $CHECK_CMD"

  local iteracao=1
  while [ "$iteracao" -le "$MAX_ITERACOES" ]; do
    log "--- Iteração $iteracao/$MAX_ITERACOES ---"

    local claude_args=(-p "$(montar_prompt)" --dangerously-skip-permissions)
    [ -n "$CLAUDE_MODEL" ] && claude_args+=(--model "$CLAUDE_MODEL")

    log "Chamando Claude Code (timeout: $TIMEOUT_RODADA)..."
    timeout --foreground "$TIMEOUT_RODADA" claude "${claude_args[@]}" 2>&1 | tee -a "$LOG_FILE"
    local rc=${PIPESTATUS[0]}
    if [ "$rc" -eq 124 ]; then
      log "ERRO: a rodada excedeu $TIMEOUT_RODADA. O item provavelmente é grande demais ou o agente entrou em ciclo."
      salvar_falha_e_restaurar "$iteracao" "timeout"
      exit 1
    elif [ "$rc" -ne 0 ]; then
      log "ERRO: a chamada ao Claude Code falhou (código $rc)."
      salvar_falha_e_restaurar "$iteracao" "erro na chamada do claude"
      exit 1
    fi

    if [ -z "$(git status --porcelain)" ]; then
      log "AVISO: a rodada não alterou nenhum arquivo. Possível travamento. Parando para revisão."
      exit 1
    fi

    if [ -n "$CHECK_CMD" ]; then
      log "Rodando verificação: $CHECK_CMD"
      if ! eval "$CHECK_CMD" >> "$LOG_FILE" 2>&1; then
        log "FALHA na verificação."
        salvar_falha_e_restaurar "$iteracao" "check falhou"
        exit 1
      fi
      log "Verificação passou."
    fi

    local status resumo
    status="$(secao_status)"
    resumo="$(ultimo_item_log)"
    git add -A
    git commit -q -m "autoloop: iteração ${iteracao} — ${resumo:-sem resumo}"
    log "Commit criado: $(git rev-parse --short HEAD)"

    if grep -q "$TOKEN_CONCLUIDO" <<<"$status"; then
      log "Backlog concluído. Encerrando com sucesso."
      exit 0
    fi
    if grep -q "$TOKEN_BLOQUEADO" <<<"$status"; then
      log "Tarefa bloqueada: precisa de decisão humana. Veja a seção Status do PROGRESS.md."
      exit 2
    fi

    iteracao=$((iteracao + 1))
    sleep "$SLEEP_ENTRE_RODADAS"
  done

  log "Limite de iterações ($MAX_ITERACOES) atingido. Revise o PROGRESS.md."
  exit 3
}

main

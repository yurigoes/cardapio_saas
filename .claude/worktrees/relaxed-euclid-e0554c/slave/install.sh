#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Cardápio SaaS — Instalador do Slave
# Versão: 1.0.0
#
# Uso:
#   curl -sSL https://cardapio.yugochat.com.br/install.sh | bash
#   ou:
#   bash install.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Cores ANSI
# ─────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
DIM='\033[2m'
RESET='\033[0m'

# ─────────────────────────────────────────────────────────────────────────────
# Funções de UI
# ─────────────────────────────────────────────────────────────────────────────

header() {
  echo ""
  echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
  echo -e "${WHITE}  Cardápio SaaS — Instalador do Servidor Local (Slave)${RESET}"
  echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
  echo ""
}

step() {
  echo -e "${BLUE}▶ $1${RESET}"
}

ok() {
  echo -e "${GREEN}[✓] $1${RESET}"
}

warn() {
  echo -e "${YELLOW}[!] $1${RESET}"
}

error() {
  echo -e "${RED}[✗] $1${RESET}"
}

info() {
  echo -e "${DIM}    $1${RESET}"
}

ask() {
  echo -e "${WHITE}$1${RESET}"
  printf "    → "
}

ask_default() {
  echo -e "${WHITE}$1${RESET} ${DIM}[padrão: $2]${RESET}"
  printf "    → "
}

separator() {
  echo -e "${DIM}────────────────────────────────────────────────────────────${RESET}"
}

# ─────────────────────────────────────────────────────────────────────────────
# Variáveis globais
# ─────────────────────────────────────────────────────────────────────────────

VPS_URL="https://cardapio.yugochat.com.br"
EMPRESA_CNPJ=""
SLAVE_KEY=""
INSTALL_DIR="/opt/cardapio-slave"
COMPOSE_FILE="$INSTALL_DIR/docker-compose.yml"
ENV_FILE="$INSTALL_DIR/.env"
DISTRO=""
PRINTERS_JSON="{}"

# ─────────────────────────────────────────────────────────────────────────────
# Detecção de distro
# ─────────────────────────────────────────────────────────────────────────────

detect_distro() {
  step "Detectando distribuição Linux..."

  if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO="${ID:-unknown}"
    info "Distribuição: $PRETTY_NAME"
  elif command -v lsb_release &>/dev/null; then
    DISTRO=$(lsb_release -si | tr '[:upper:]' '[:lower:]')
  else
    DISTRO="unknown"
  fi

  case "$DISTRO" in
    ubuntu|debian|raspbian|linuxmint|pop)
      DISTRO="debian"
      ok "Compatível com Debian/Ubuntu"
      ;;
    centos|rhel|fedora|rocky|almalinux|ol)
      DISTRO="rhel"
      ok "Compatível com RHEL/CentOS"
      ;;
    *)
      warn "Distribuição '$DISTRO' não testada. Tentando instalação genérica..."
      DISTRO="debian"
      ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────────────
# Verificação de root
# ─────────────────────────────────────────────────────────────────────────────

check_root() {
  if [ "$EUID" -ne 0 ]; then
    error "Este script deve ser executado como root (use: sudo bash install.sh)"
    exit 1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Coleta de dados do usuário
# ─────────────────────────────────────────────────────────────────────────────

collect_config() {
  separator
  echo -e "${WHITE}CONFIGURAÇÃO DA EMPRESA${RESET}"
  separator

  # VPS URL
  ask_default "URL da VPS" "$VPS_URL"
  read -r input
  if [ -n "$input" ]; then
    VPS_URL="$input"
  fi

  # CNPJ
  while true; do
    ask "CNPJ da empresa (apenas números, 14 dígitos):"
    read -r EMPRESA_CNPJ
    EMPRESA_CNPJ="${EMPRESA_CNPJ//[^0-9]/}"
    if [ "${#EMPRESA_CNPJ}" -eq 14 ]; then
      break
    else
      error "CNPJ inválido. Digite 14 dígitos."
    fi
  done

  # Slave key
  while true; do
    ask "Chave de Instalação (copie do painel Admin):"
    read -r SLAVE_KEY
    SLAVE_KEY="${SLAVE_KEY// /}"   # remove espaços
    if [ "${#SLAVE_KEY}" -eq 64 ]; then
      break
    else
      error "Chave inválida. Deve ter 64 caracteres hexadecimais."
    fi
  done
}

# ─────────────────────────────────────────────────────────────────────────────
# Validação com a VPS
# ─────────────────────────────────────────────────────────────────────────────

validate_with_vps() {
  step "Validando credenciais com a VPS..."
  info "URL: $VPS_URL"

  if ! command -v curl &>/dev/null; then
    warn "curl não encontrado. Instalando..."
    case "$DISTRO" in
      debian) apt-get install -y curl >/dev/null 2>&1 ;;
      rhel)   yum install -y curl    >/dev/null 2>&1 ;;
    esac
  fi

  local response
  response=$(curl -sSL -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"cnpj\":\"${EMPRESA_CNPJ}\",\"slave_key\":\"${SLAVE_KEY}\"}" \
    "${VPS_URL}/api/sync/token" 2>/dev/null || echo '{"success":false,"error":"Falha de conexão"}\n000')

  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | head -1)

  if [ "$http_code" -eq 200 ]; then
    local empresa_nome
    empresa_nome=$(echo "$body" | grep -o '"nome_fantasia":"[^"]*"' | cut -d'"' -f4 || echo "Empresa")
    ok "Credenciais válidas! Empresa: $empresa_nome"

    # Salva o nome da empresa para o .env
    EMPRESA_NOME="$empresa_nome"
  else
    local err_msg
    err_msg=$(echo "$body" | grep -o '"error":"[^"]*"' | cut -d'"' -f4 || echo "Erro desconhecido")
    error "Validação falhou [$http_code]: $err_msg"
    error "Verifique o CNPJ e a chave de instalação no painel admin."
    exit 1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Instalação do Docker
# ─────────────────────────────────────────────────────────────────────────────

install_docker() {
  if command -v docker &>/dev/null; then
    local version
    version=$(docker --version 2>/dev/null | grep -oP '[\d.]+' | head -1)
    ok "Docker já instalado: v$version"
    return 0
  fi

  step "Instalando Docker CE..."

  case "$DISTRO" in
    debian)
      apt-get update -qq
      apt-get install -y -qq \
        ca-certificates curl gnupg lsb-release

      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg

      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list

      apt-get update -qq
      apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
      ;;

    rhel)
      yum install -y -q yum-utils
      yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
      yum install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
      systemctl enable --now docker
      ;;
  esac

  ok "Docker CE instalado com sucesso"
  docker --version
}

# ─────────────────────────────────────────────────────────────────────────────
# Configuração de impressoras
# ─────────────────────────────────────────────────────────────────────────────

configure_printers() {
  separator
  echo -e "${WHITE}CONFIGURAÇÃO DE IMPRESSORAS${RESET}"
  separator
  info "Configure cada setor de impressão. Pressione Enter para pular."
  echo ""

  declare -A printer_configs
  local setores=("totem" "balcao" "cozinha" "producao" "bar")
  local labels=("Totem / PDV" "Balcão" "Cozinha" "Produção" "Bar")

  for i in "${!setores[@]}"; do
    local setor="${setores[$i]}"
    local label="${labels[$i]}"

    echo -e "${WHITE}  $label (${setor})${RESET}"
    printf "    Tipo [ip/usb/pular]: "
    read -r tipo

    case "${tipo,,}" in
      ip|rede|network)
        printf "    IP da impressora: "
        read -r host

        printf "    Porta [9100]: "
        read -r port
        port="${port:-9100}"

        if [ -n "$host" ]; then
          printer_configs[$setor]="{\"type\":\"network\",\"host\":\"${host}\",\"port\":${port}}"
          ok "  $label: $host:$port"
        fi
        ;;

      usb)
        info "Dispositivos USB detectados:"
        lsusb 2>/dev/null || info "  (lsusb não disponível)"

        printf "    VendorId (ex: 0x04b8): "
        read -r vid

        printf "    ProductId (ex: 0x0e15): "
        read -r pid

        if [ -n "$vid" ] && [ -n "$pid" ]; then
          printer_configs[$setor]="{\"type\":\"usb\",\"vendorId\":\"${vid}\",\"productId\":\"${pid}\"}"
          ok "  $label: USB ${vid}:${pid}"
        fi
        ;;

      pular|skip|""|*)
        info "  $label: não configurada"
        ;;
    esac
  done

  # Monta JSON de impressoras
  local printer_json="{"
  local first=true
  for setor in "${!printer_configs[@]}"; do
    if [ "$first" = "true" ]; then
      first=false
    else
      printer_json="${printer_json},"
    fi
    printer_json="${printer_json}\"${setor}\":${printer_configs[$setor]}"
  done
  printer_json="${printer_json}}"

  PRINTERS_JSON="$printer_json"
}

# ─────────────────────────────────────────────────────────────────────────────
# Download e configuração dos arquivos
# ─────────────────────────────────────────────────────────────────────────────

setup_files() {
  step "Criando diretório de instalação: $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"

  step "Baixando docker-compose.yml..."
  curl -sSL "${VPS_URL}/slave/docker-compose.yml" -o "$COMPOSE_FILE" 2>/dev/null || {
    warn "Não foi possível baixar da VPS. Usando configuração embutida..."
    # Fallback — cria o compose inline se o download falhar
    cat > "$COMPOSE_FILE" << 'COMPOSE_EOF'
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB:       ${DB_NAME:-cardapio_slave}
      POSTGRES_USER:     ${DB_USER:-cardapio}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - slave_net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-cardapio} -d ${DB_NAME:-cardapio_slave}"]
      interval: 10s
      timeout: 5s
      retries: 5
  app:
    image: cardapio-saas:latest
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3000
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ${DB_NAME:-cardapio_slave}
      DB_USER: ${DB_USER:-cardapio}
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      SLAVE_MODE: "true"
      SLAVE_VPS_URL: ${VPS_URL}
    ports:
      - "3000:3000"
    networks:
      - slave_net
  sync-agent:
    image: cardapio-sync-agent:latest
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      VPS_URL: ${VPS_URL}
      SLAVE_KEY: ${SLAVE_KEY}
      EMPRESA_CNPJ: ${EMPRESA_CNPJ}
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ${DB_NAME:-cardapio_slave}
      DB_USER: ${DB_USER:-cardapio}
      DB_PASSWORD: ${DB_PASSWORD}
      SYNC_INTERVAL_MS: ${SYNC_INTERVAL_MS:-30000}
    volumes:
      - sync_state:/var/lib/sync-agent
    networks:
      - slave_net
  print-agent:
    image: cardapio-print-agent:latest
    restart: unless-stopped
    environment:
      PORT: 3001
      EMPRESA_NOME: ${EMPRESA_NOME}
      EMPRESA_CNPJ: ${EMPRESA_CNPJ}
      PRINTERS: ${PRINTERS:-{}}
    ports:
      - "127.0.0.1:3001:3001"
    networks:
      - slave_net
networks:
  slave_net:
    driver: bridge
volumes:
  postgres_data:
  sync_state:
COMPOSE_EOF
  }

  step "Gerando senha aleatória para o banco de dados..."
  local DB_PASSWORD
  DB_PASSWORD=$(cat /dev/urandom | tr -dc 'A-Za-z0-9!@#$%' | head -c 32)

  step "Criando arquivo .env..."
  cat > "$ENV_FILE" << ENV_EOF
# Cardápio SaaS — Slave — Configuração gerada por install.sh
# Data: $(date '+%Y-%m-%d %H:%M:%S')

VPS_URL=${VPS_URL}
EMPRESA_CNPJ=${EMPRESA_CNPJ}
EMPRESA_NOME=${EMPRESA_NOME:-Restaurante}
SLAVE_KEY=${SLAVE_KEY}

DB_HOST=postgres
DB_PORT=5432
DB_NAME=cardapio_slave
DB_USER=cardapio
DB_PASSWORD=${DB_PASSWORD}

JWT_SECRET=
JWT_REFRESH_SECRET=

SYNC_INTERVAL_MS=30000
PRINTERS=${PRINTERS_JSON}
LOG_LEVEL=info
ENV_EOF

  chmod 600 "$ENV_FILE"
  ok "Arquivo .env criado com permissões seguras (600)"
}

# ─────────────────────────────────────────────────────────────────────────────
# Serviço systemd para auto-start
# ─────────────────────────────────────────────────────────────────────────────

setup_systemd() {
  if ! command -v systemctl &>/dev/null; then
    warn "systemd não disponível — auto-start não configurado"
    return 0
  fi

  step "Configurando serviço systemd para auto-start..."

  cat > /etc/systemd/system/cardapio-slave.service << SERVICE_EOF
[Unit]
Description=Cardápio SaaS — Servidor Slave
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStop=/usr/bin/docker compose down
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
SERVICE_EOF

  systemctl daemon-reload
  systemctl enable cardapio-slave.service

  ok "Serviço systemd configurado (cardapio-slave.service)"
}

# ─────────────────────────────────────────────────────────────────────────────
# Inicialização dos containers
# ─────────────────────────────────────────────────────────────────────────────

start_containers() {
  step "Baixando imagens Docker..."
  cd "$INSTALL_DIR"
  docker compose pull 2>/dev/null || warn "Algumas imagens podem precisar ser buildadas localmente"

  step "Iniciando containers..."
  docker compose up -d 2>&1 | while read -r line; do
    info "$line"
  done

  ok "Containers iniciados"
}

# ─────────────────────────────────────────────────────────────────────────────
# Verificação de saúde
# ─────────────────────────────────────────────────────────────────────────────

health_check() {
  step "Aguardando serviços ficarem prontos..."

  local attempts=0
  local max_attempts=24   # ~2 minutos

  while [ $attempts -lt $max_attempts ]; do
    if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
      ok "Next.js respondendo em http://localhost:3000"
      break
    fi

    attempts=$((attempts + 1))
    printf "."
    sleep 5
  done

  echo ""

  if [ $attempts -ge $max_attempts ]; then
    warn "Next.js não respondeu após 2 minutos. Verifique os logs:"
    info "docker compose -f $COMPOSE_FILE logs app"
  fi

  # Verifica sync-agent
  if curl -sf http://localhost:3002/health >/dev/null 2>&1; then
    ok "Sync-agent respondendo em http://localhost:3002"
  else
    warn "Sync-agent ainda inicializando (verifique em instantes)"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Obter IP local
# ─────────────────────────────────────────────────────────────────────────────

get_local_ip() {
  ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || hostname -I 2>/dev/null | awk '{print $1}'
}

# ─────────────────────────────────────────────────────────────────────────────
# Resumo final
# ─────────────────────────────────────────────────────────────────────────────

print_summary() {
  local local_ip
  local_ip=$(get_local_ip || echo "localhost")

  echo ""
  echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
  echo -e "${GREEN}  Instalação concluída com sucesso!${RESET}"
  echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
  echo ""
  echo -e "${WHITE}  Sistema disponível em:${RESET}"
  echo -e "    ${CYAN}http://${local_ip}:3000${RESET}       ← Interface do restaurante"
  echo -e "    ${DIM}http://localhost:3002/health${RESET}  ← Status do sync-agent"
  echo ""
  echo -e "${WHITE}  Comandos úteis:${RESET}"
  echo -e "    ${DIM}cd ${INSTALL_DIR}${RESET}"
  echo -e "    ${DIM}docker compose logs -f${RESET}              → Ver logs em tempo real"
  echo -e "    ${DIM}docker compose restart sync-agent${RESET}   → Reiniciar sync"
  echo -e "    ${DIM}docker compose down${RESET}                 → Parar todos os serviços"
  echo -e "    ${DIM}systemctl status cardapio-slave${RESET}     → Status do serviço"
  echo ""
  echo -e "${WHITE}  Arquivos de configuração:${RESET}"
  echo -e "    ${DIM}${ENV_FILE}${RESET}"
  echo -e "    ${DIM}${COMPOSE_FILE}${RESET}"
  echo ""
  echo -e "${YELLOW}  IMPORTANTE:${RESET} Adicione o JWT_SECRET no arquivo .env para"
  echo -e "  habilitar o login local de usuários."
  echo -e "  O secret deve ser o mesmo configurado na VPS."
  echo ""
  echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
}

# ─────────────────────────────────────────────────────────────────────────────
# Tratamento de erros
# ─────────────────────────────────────────────────────────────────────────────

on_error() {
  echo ""
  error "Ocorreu um erro durante a instalação."
  echo ""
  echo -e "${WHITE}Para reverter:${RESET}"
  echo -e "  ${DIM}cd ${INSTALL_DIR} && docker compose down -v${RESET}"
  echo -e "  ${DIM}rm -rf ${INSTALL_DIR}${RESET}"
  echo -e "  ${DIM}systemctl disable cardapio-slave.service${RESET}"
  echo -e "  ${DIM}rm -f /etc/systemd/system/cardapio-slave.service${RESET}"
  echo ""
  echo -e "${WHITE}Logs de erro:${RESET}"
  echo -e "  ${DIM}docker compose -f ${COMPOSE_FILE} logs${RESET}"
  exit 1
}

trap on_error ERR

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

main() {
  header
  check_root
  detect_distro

  separator
  collect_config
  validate_with_vps

  separator
  install_docker

  configure_printers

  separator
  setup_files
  setup_systemd

  separator
  start_containers
  health_check

  print_summary
}

main "$@"

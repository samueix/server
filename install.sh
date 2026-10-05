#!/usr/bin/env bash
# ==============================================================================
# Script de Instalação Automatizada do Server Monitor no Ubuntu Server
# ==============================================================================
set -euo pipefail

# Cores para saída no terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # Sem cor

echo -e "${CYAN}${BOLD}"
echo "================================================================="
echo "       🚀 INSTALADOR OFICIAL: SERVER MONITOR (UBUNTU SERVER)      "
echo "================================================================="
echo -e "${NC}"

# 1. Verifica se está sendo executado como root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERRO] Este script precisa ser executado como root ou com sudo.${NC}"
  echo "Execute: sudo bash install.sh"
  exit 1
fi

INSTALL_DIR="/opt/server-monitor"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Localiza onde estão os arquivos do backend (no subdiretório backend/ ou no próprio diretório)
if [ -d "$SCRIPT_DIR/backend" ]; then
  SRC_BACKEND="$SCRIPT_DIR/backend"
else
  SRC_BACKEND="$SCRIPT_DIR"
fi

echo -e "${BLUE}[1/6] Atualizando repositórios e instalando dependências mínimas do sistema...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv curl systemd > /dev/null

echo -e "${BLUE}[2/6] Preparando diretório de instalação em ${INSTALL_DIR}...${NC}"
mkdir -p "${INSTALL_DIR}"

# Copia arquivos do backend
cp -f "${SRC_BACKEND}/main.py" "${INSTALL_DIR}/"
cp -f "${SRC_BACKEND}/monitor.py" "${INSTALL_DIR}/"
cp -f "${SRC_BACKEND}/services.py" "${INSTALL_DIR}/"
cp -f "${SRC_BACKEND}/adguard.py" "${INSTALL_DIR}/"
cp -f "${SRC_BACKEND}/auth.py" "${INSTALL_DIR}/"
cp -f "${SRC_BACKEND}/logs.py" "${INSTALL_DIR}/"
cp -f "${SRC_BACKEND}/requirements.txt" "${INSTALL_DIR}/"

if [ -f "${SRC_BACKEND}/.env.example" ]; then
  cp -n "${SRC_BACKEND}/.env.example" "${INSTALL_DIR}/.env.example"
fi

# 3. Cria arquivo .env se não existir
if [ ! -f "${INSTALL_DIR}/.env" ]; then
  echo -e "${YELLOW}[AVISO] Gerando arquivo de configuração inicial .env...${NC}"
  # Gera senha e token aleatórios e seguros
  GENERATED_PASS=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 16 ; echo '')
  GENERATED_KEY=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 24 ; echo '')
  
  cat > "${INSTALL_DIR}/.env" <<EOF
# Server Monitor - Configurações de Ambiente
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
USER_USERNAME=user
USER_PASSWORD=user
API_KEY=${GENERATED_KEY}
HOST=0.0.0.0
PORT=8000
CORS_ORIGINS=*
ADGUARD_URL=http://127.0.0.1:8081
ADGUARD_USERNAME=
ADGUARD_PASSWORD=
EOF
  chmod 600 "${INSTALL_DIR}/.env"
  echo -e "${GREEN}✓ Arquivo .env criado com credenciais geradas aleatoriamente.${NC}"
else
  echo -e "${GREEN}✓ Arquivo .env existente preservado.${NC}"
fi

# 4. Cria ambiente virtual Python isolado
echo -e "${BLUE}[3/6] Criando ambiente virtual Python (venv)...${NC}"
python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --upgrade pip -q
echo -e "${BLUE}[4/6] Instalando requirements via pip...${NC}"
"${INSTALL_DIR}/venv/bin/pip" install -r "${INSTALL_DIR}/requirements.txt" -q

# 5. Configura e instala o serviço systemd
echo -e "${BLUE}[5/6] Configurando serviço systemd...${NC}"
SERVICE_FILE="/etc/systemd/system/server-monitor.service"

if [ -f "$SCRIPT_DIR/systemd/server-monitor.service" ]; then
  cp -f "$SCRIPT_DIR/systemd/server-monitor.service" "$SERVICE_FILE"
elif [ -f "$SCRIPT_DIR/server-monitor.service" ]; then
  cp -f "$SCRIPT_DIR/server-monitor.service" "$SERVICE_FILE"
else
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Server Monitor - Backend API de Telemetria
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=${INSTALL_DIR}/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
Restart=always
RestartSec=5s
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
fi

systemctl daemon-reload
systemctl enable server-monitor.service
systemctl restart server-monitor.service

# 6. Verificação e teste de integridade
echo -e "${BLUE}[6/6] Verificando se a API está online na porta 8000...${NC}"
sleep 2

# Obter IP primário da máquina
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "SEU_IP")

if systemctl is-active --quiet server-monitor.service; then
  echo -e "\n${GREEN}${BOLD}✓ SUCESSO! O Server Monitor está instalado e ativo!${NC}\n"
  
  # Extrai dados do .env
  ADMIN_USER=$(grep -E "^ADMIN_USERNAME=" "${INSTALL_DIR}/.env" | cut -d '=' -f2-)
  ADMIN_PASS=$(grep -E "^ADMIN_PASSWORD=" "${INSTALL_DIR}/.env" | cut -d '=' -f2-)
  API_KEY=$(grep -E "^API_KEY=" "${INSTALL_DIR}/.env" | cut -d '=' -f2-)
  
  echo -e "${CYAN}================================================================="
  echo -e "                   DADOS DE ACESSO AO MONITOR                    "
  echo -e "=================================================================${NC}"
  echo -e "🌐 URL da API:        ${BOLD}http://${SERVER_IP}:8000${NC}"
  echo -e "⚡ Teste Health:      ${BOLD}http://${SERVER_IP}:8000/api/health${NC}"
  echo -e "🔑 Usuário Admin:     ${BOLD}${ADMIN_USER}${NC}"
  echo -e "🔒 Senha Admin:       ${BOLD}${ADMIN_PASS}${NC}"
  echo -e "🛡️ Token / API Key:   ${BOLD}${API_KEY}${NC}"
  echo -e "📁 Diretório:         ${BOLD}${INSTALL_DIR}${NC}"
  echo -e "⚙️  Arquivo de Config: ${BOLD}${INSTALL_DIR}/.env${NC}"
  echo -e "${CYAN}=================================================================${NC}\n"

  echo -e "${YELLOW}Comandos úteis para o servidor:${NC}"
  echo "  - Ver logs em tempo real:   sudo journalctl -u server-monitor -f"
  echo "  - Reiniciar serviço:        sudo systemctl restart server-monitor"
  echo "  - Parar serviço:            sudo systemctl stop server-monitor"
  echo "  - Editar configurações:     sudo nano ${INSTALL_DIR}/.env"
  echo ""
  echo -e "${GREEN}Agora configure o Frontend colocando o endereço http://${SERVER_IP}:8000 e suas credenciais!${NC}\n"
else
  echo -e "${RED}[AVISO] O serviço foi instalado mas não parece estar rodando no momento.${NC}"
  echo "Verifique os logs detalhados executando:"
  echo "  sudo journalctl -u server-monitor.service -n 50 --no-pager"
fi

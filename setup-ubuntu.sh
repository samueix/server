#!/usr/bin/env bash
# ==============================================================================
# Script de Instalação e Deploy do AdGuard Home AI no Ubuntu Server
# ==============================================================================
set -e

echo "🚀 Iniciando configuração do AdGuard Home AI no Ubuntu Server..."

# 1. Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "📦 Instalando Node.js 22 LTS via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs build-essential
fi

echo "✅ Node.js versão: $(node -v)"
echo "✅ NPM versão: $(npm -v)"

# 2. Instalar dependências
echo "📦 Instalando dependências do projeto..."
npm install

# 3. Compilar aplicação
echo "🔨 Compilando frontend (Vite) e backend (Node.js/esbuild)..."
npm run build

# 4. Criar diretório de dados para SQLite
mkdir -p data

# 5. Criar arquivo de configuração .env se não existir
if [ ! -f .env ]; then
    echo "📝 Criando .env a partir de .env.example..."
    cp .env.example .env
    echo "⚠️ Por favor, edite o arquivo .env com a sua GEMINI_API_KEY e credenciais do AdGuard se necessário."
fi

# 6. Configurar serviço Systemd (opcional)
read -p "Deseja instalar como serviço do sistema (systemd) para iniciar no boot? (s/n): " RESPOSTA
if [[ "$RESPOSTA" =~ ^[Ss]$ ]]; then
    CURRENT_DIR=$(pwd)
    CURRENT_USER=$(whoami)
    SERVICE_FILE="/etc/systemd/system/adguard-ai.service"

    echo "⚙️ Configurando permissões de leitura de logs (/var/log/syslog) para o usuário ${CURRENT_USER}..."
    sudo usermod -aG adm,systemd-journal "${CURRENT_USER}" || true

    echo "⚙️ Configurando ${SERVICE_FILE}..."
    sudo bash -c "cat <<EOF > ${SERVICE_FILE}
[Unit]
Description=AdGuard Home AI - Analisador Inteligente de Bloqueios
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
SupplementaryGroups=adm systemd-journal
WorkingDirectory=${CURRENT_DIR}
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=${CURRENT_DIR}/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF"

    sudo systemctl daemon-reload
    sudo systemctl enable adguard-ai
    sudo systemctl restart adguard-ai
    echo "🎉 Serviço ativado e rodando! Verifique o status com: sudo systemctl status adguard-ai"
else
    echo "Para iniciar manualmente, execute: npm start"
fi

echo "✨ Instalação concluída com sucesso! Acesse em: http://$(hostname -I | awk '{print $1}'):3000"

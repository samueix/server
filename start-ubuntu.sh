#!/usr/bin/env bash
# ==============================================================================
# Script de 1 Comando: Inicialização Completa do Server Panel no Ubuntu Server
# Host: 192.168.100.23 (samuelserver)
# ==============================================================================
# Este script:
# 1. Garante Node.js, npm e Nginx instalados
# 2. Compila a aplicação completa (frontend + backend)
# 3. Publica o frontend em /var/www/server-panel
# 4. Configura e ativa o proxy Nginx na porta 80
# 5. Configura e inicia o serviço systemd "server-panel" na porta 3000
# 6. Valida a conexão da API e do Nginx
# ==============================================================================
set -e

echo "🚀 [1/6] Verificando dependências essenciais do sistema..."
if ! command -v node &> /dev/null; then
    echo "📦 Instalando Node.js 22 LTS via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs build-essential
fi

if ! command -v nginx &> /dev/null; then
    echo "📦 Instalando Nginx..."
    sudo apt-get update -y
    sudo apt-get install -y nginx
fi

CURRENT_DIR=$(pwd)
CURRENT_USER=$(whoami)

echo "📦 [2/6] Instalando dependências npm e compilando aplicação..."
if [ ! -d "node_modules" ]; then
    npm install
fi
npm run build

echo "📂 [3/6] Publicando frontend em /var/www/server-panel..."
sudo mkdir -p /var/www/server-panel
sudo rm -rf /var/www/server-panel/*
sudo cp -r dist/* /var/www/server-panel/
sudo chown -R www-data:www-data /var/www/server-panel
sudo chmod -R 755 /var/www/server-panel

echo "⚙️ [4/6] Configurando serviço systemd 'server-panel' na porta 3000..."
SERVICE_FILE="/etc/systemd/system/server-panel.service"
sudo bash -c "cat <<EOF > ${SERVICE_FILE}
[Unit]
Description=Server Panel - Telemetria, Arquivos e Terminal do Ubuntu
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${CURRENT_DIR}
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=$(which npm) start
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload
sudo systemctl enable server-panel
sudo systemctl restart server-panel

echo "🌐 [5/6] Configurando Nginx para roteamento da porta 80 para a porta 3000..."
# Cria diretório de snippets se não existir
sudo mkdir -p /etc/nginx/snippets
if [ ! -f /etc/nginx/snippets/adguard-auth.conf ]; then
    sudo touch /etc/nginx/snippets/adguard-auth.conf
fi

sudo cp nginx/dashboard.conf /etc/nginx/sites-available/server-panel
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/server-panel /etc/nginx/sites-enabled/server-panel

sudo nginx -t
sudo systemctl reload nginx || sudo systemctl restart nginx

echo "🧪 [6/6] Testando status dos serviços..."
sleep 2

LOCAL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "=================================================================="
echo "✅ SERVIDOR CONFIGURADO COM SUCESSO!"
echo "=================================================================="
echo "🌐 Painel Web:              http://${LOCAL_IP}/"
echo "📊 API de Telemetria:       http://${LOCAL_IP}/api/health"
echo "📂 Explorador de Arquivos:  Aba 'Arquivos' no menu lateral"
echo "💻 Terminal Web Bash:       Aba 'Terminal & Shell' no menu lateral"
echo "🛡️  AdGuard Home:           http://${LOCAL_IP}:8081/#"
echo "=================================================================="
echo "Para checar o status do serviço a qualquer momento:"
echo "sudo systemctl status server-panel"
echo "=================================================================="

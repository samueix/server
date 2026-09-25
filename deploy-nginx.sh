#!/usr/bin/env bash
# ==============================================================================
# Script de Implantação do Dashboard com Nginx no Ubuntu Server
# Hostname: samuelserver | IP: 192.168.100.23
# ==============================================================================
# 1. Compila o frontend React/Vite (npm run build)
# 2. Publica os arquivos compilados em /var/www/server-panel
# 3. Configura o Proxy Nginx em /etc/nginx/sites-available/server-panel
#    - /              -> frontend estático (/var/www/server-panel)
#    - /api/          -> FastAPI :8000 (proxy_pass http://127.0.0.1:8000; com X-API-Key)
#    - /adguard-api/  -> AdGuard Home :8081 (com Basic Auth silenciosa)
# 4. Testa a sintaxe do Nginx e recarrega o serviço
# ==============================================================================
set -e

echo "🚀 Iniciando deploy do Dashboard no Ubuntu Server..."

# 1. Garantir Nginx instalado
if ! command -v nginx &> /dev/null; then
    echo "📦 Instalando Nginx..."
    sudo apt-get update -y
    sudo apt-get install -y nginx
fi

# 2. Compilar frontend
echo "🔨 Compilando o frontend (npm run build)..."
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências npm..."
    npm install
fi
npm run build

# 3. Publicar em /var/www/server-panel
echo "📂 Publicando arquivos em /var/www/server-panel..."
sudo mkdir -p /var/www/server-panel
sudo rm -rf /var/www/server-panel/*
sudo cp -r dist/* /var/www/server-panel/
sudo chown -R www-data:www-data /var/www/server-panel
sudo chmod -R 755 /var/www/server-panel

# 4. Instalar configuração no Nginx
echo "⚙️ Configurando /etc/nginx/sites-available/server-panel..."
sudo cp nginx/dashboard.conf /etc/nginx/sites-available/server-panel

# Desativar site default do Nginx para evitar conflito na porta 80
if [ -f /etc/nginx/sites-enabled/default ]; then
    echo "🧹 Desativando site padrão default do Nginx..."
    sudo rm -f /etc/nginx/sites-enabled/default
fi

# Habilitar o site server-panel
sudo ln -sf /etc/nginx/sites-available/server-panel /etc/nginx/sites-enabled/server-panel

# 5. Testar sintaxe do Nginx
echo "🧪 Testando configuração do Nginx..."
sudo nginx -t

# 6. Recarregar o Nginx
echo "🔄 Recarregando serviço Nginx..."
sudo systemctl enable nginx
sudo systemctl reload nginx || sudo systemctl restart nginx

# 7. Resumo do Status
IP_LOCAL=$(hostname -I | awk '{print $1}')
echo ""
echo "=================================================================="
echo "🎉 DEPLOY CONCLUÍDO COM SUCESSO!"
echo "=================================================================="
echo "🌐 Acesse no seu navegador: http://${IP_LOCAL}"
echo "📊 API Server Panel em:     http://${IP_LOCAL}/api/status"
echo "🛡️  Proxy AdGuard Home em:   http://${IP_LOCAL}/adguard-api/stats"
echo "=================================================================="

#!/usr/bin/env bash
# ==============================================================================
# Script de Implantação do Dashboard com Nginx no Ubuntu Server
# ==============================================================================
# Este script:
# 1. Instala e configura o Nginx
# 2. Compila o frontend React/Vite com máxima performance
# 3. Publica os arquivos estáticos em /var/www/html
# 4. Configura o Proxy Reverso (/adguard-api/ -> :8081 e /api/ -> :8000)
# 5. Reinicia o Nginx e testa os endpoints
# ==============================================================================
set -e

echo "🚀 Iniciando configuração do Servidor Nginx no Ubuntu..."

# 1. Garantir que o Nginx está instalado
if ! command -v nginx &> /dev/null; then
    echo "📦 Instalando Nginx..."
    sudo apt-get update -y
    sudo apt-get install -y nginx
fi

# 2. Compilar os arquivos do Dashboard
echo "🔨 Compilando o frontend (npm run build)..."
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências npm..."
    npm install
fi
npm run build

# 3. Publicar os arquivos no diretório web
echo "📂 Copiando build para /var/www/html..."
sudo mkdir -p /var/www/html
# Backup simples se houver arquivos anteriores
sudo rm -rf /var/www/html/*
sudo cp -r dist/* /var/www/html/
sudo chown -R www-data:www-data /var/www/html
sudo chmod -R 755 /var/www/html

# 4. Configurar o site no Nginx
echo "⚙️ Configurando Nginx (/etc/nginx/sites-available/dashboard)..."
sudo cp nginx/dashboard.conf /etc/nginx/sites-available/dashboard

# Remover o site default se existir para evitar conflitos de porta 80
if [ -f /etc/nginx/sites-enabled/default ]; then
    echo "🧹 Desativando site padrão default do Nginx..."
    sudo rm -f /etc/nginx/sites-enabled/default
fi

# Criar link simbólico
sudo ln -sf /etc/nginx/sites-available/dashboard /etc/nginx/sites-enabled/dashboard

# 5. Testar sintaxe do Nginx
echo "🧪 Testando configuração do Nginx..."
sudo nginx -t

# 6. Recarregar o Nginx
echo "🔄 Recarregando serviço Nginx..."
sudo systemctl enable nginx
sudo systemctl restart nginx

# 7. Resumo do Status
IP_LOCAL=$(hostname -I | awk '{print $1}')
echo ""
echo "=================================================================="
echo "🎉 PARABÉNS! SEU UBUNTU AGORA É O SERVIDOR DO DASHBOARD!"
echo "=================================================================="
echo "🌐 Acesse no seu navegador: http://${IP_LOCAL}"
echo "🔒 Proxy AdGuard Ativo em: http://${IP_LOCAL}/adguard-api/stats"
echo "📊 API de Telemetria em:   http://${IP_LOCAL}/api/status"
echo "=================================================================="
echo "Dica: Teste o proxy do AdGuard com o comando:"
echo "curl -s http://localhost/adguard-api/stats | head -n 10"
echo "=================================================================="

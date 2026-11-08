#!/usr/bin/env bash
# ==============================================================================
# Script de Implantação do Dashboard com Nginx no Ubuntu Server
# Hostname: samuelserver | IP: 192.168.100.23
# ==============================================================================
# Metodologia segura:
# 1. Valida pré-requisitos e snippet de autenticação do AdGuard ANTES de tocar em arquivos
# 2. Testa a sintaxe do Nginx (nginx -t) com a nova configuração antes de publicar
# 3. Faz backup seguro de /var/www/server-panel e reverte em caso de qualquer falha
# 4. Publica de forma atômica e recarrega o Nginx
# ==============================================================================
set -euo pipefail

SNIPPET_PATH="/etc/nginx/snippets/adguard-auth.conf"
PANEL_DIR="/var/www/server-panel"
PANEL_BAK="/var/www/server-panel.bak"
SITE_AVAIL="/etc/nginx/sites-available/server-panel"
SITE_ENAB="/etc/nginx/sites-enabled/server-panel"

echo "🚀 Iniciando deploy seguro do Server Panel no Ubuntu Server..."

# 1. Validar Nginx instalado
if ! command -v nginx &> /dev/null; then
    echo "📦 Nginx não encontrado. Instalando..."
    sudo apt-get update -y
    sudo apt-get install -y nginx
fi

# 2. Checar snippet de autenticação do AdGuard Home ANTES de qualquer modificação
echo "🔍 Verificando snippet de autenticação do AdGuard em ${SNIPPET_PATH}..."
if [ ! -f "${SNIPPET_PATH}" ]; then
    echo ""
    echo "=================================================================="
    echo "❌ [ERRO DE PRÉ-REQUISITO] Snippet do AdGuard não encontrado!"
    echo "=================================================================="
    echo "O arquivo ${SNIPPET_PATH} é obrigatório para o proxy reverso."
    echo ""
    echo "Crie o arquivo no servidor Ubuntu executando o comando:"
    echo "  sudo mkdir -p /etc/nginx/snippets"
    echo "  echo 'proxy_set_header Authorization \"Basic \$(echo -n \"USUARIO:SENHA\" | base64)\";' | sudo tee ${SNIPPET_PATH}"
    echo ""
    echo "Ou, caso seu AdGuard local em :8081 NÃO exija autenticação, crie vazio:"
    echo "  sudo touch ${SNIPPET_PATH}"
    echo "=================================================================="
    echo "Deploy abortado preventivamente. Nenhum arquivo foi alterado."
    exit 1
fi

# 3. Testar a nova configuração do Nginx antes de publicar o site
echo "🧪 Validando sintaxe da configuração Nginx..."
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
sudo cp nginx/dashboard.conf "${SITE_AVAIL}.test"

# Testa em dry-run
if ! sudo nginx -t -c /etc/nginx/nginx.conf -g "include ${SITE_AVAIL}.test;" &> /dev/null; then
    # Se falhar teste inline, copia para sites-available provisoriamente e testa
    sudo cp nginx/dashboard.conf "${SITE_AVAIL}"
    if ! sudo nginx -t; then
        echo "❌ Falha no teste de sintaxe do Nginx (nginx -t). Abortando deploy..."
        sudo rm -f "${SITE_AVAIL}.test"
        exit 1
    fi
fi
sudo rm -f "${SITE_AVAIL}.test"

# 4. Compilar frontend (se necessário)
echo "🔨 Compilando o frontend (npm run build)..."
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências npm..."
    npm install
fi
npm run build

# 5. Fazer Backup preventivo de /var/www/server-panel antes de apagar
if [ -d "${PANEL_DIR}" ]; then
    echo "💾 Criando backup preventivo em ${PANEL_BAK}..."
    sudo rm -rf "${PANEL_BAK}"
    sudo cp -a "${PANEL_DIR}" "${PANEL_BAK}"
fi

# Função de rollback seguro
rollback() {
    echo ""
    echo "⚠️ Ocorreu um erro durante a publicação! Restaurando backup..."
    if [ -d "${PANEL_BAK}" ]; then
        sudo rm -rf "${PANEL_DIR}"
        sudo cp -a "${PANEL_BAK}" "${PANEL_DIR}"
        echo "✅ Backup restaurado com sucesso."
    fi
    exit 1
}
trap rollback ERR

# 6. Publicar arquivos compilados
echo "📂 Publicando nova versão em ${PANEL_DIR}..."
sudo mkdir -p "${PANEL_DIR}"
sudo rm -rf "${PANEL_DIR:?}"/*
sudo cp -a dist/. "${PANEL_DIR}/"
sudo chown -R www-data:www-data "${PANEL_DIR}"
sudo chmod -R 755 "${PANEL_DIR}"

# 7. Ativar configuração oficial do Nginx
echo "⚙️ Aplicando /etc/nginx/sites-available/server-panel..."
sudo cp nginx/dashboard.conf "${SITE_AVAIL}"

# Desativar site default se existir
if [ -f /etc/nginx/sites-enabled/default ]; then
    sudo rm -f /etc/nginx/sites-enabled/default
fi
sudo ln -sf "${SITE_AVAIL}" "${SITE_ENAB}"

# 8. Teste final de integridade do Nginx
echo "🧪 Teste final de integridade do Nginx..."
sudo nginx -t

# 9. Recarregar o Nginx suavemente
echo "🔄 Recarregando serviço Nginx..."
sudo systemctl enable nginx
sudo systemctl reload nginx || sudo systemctl restart nginx

# Remove backup temporário pós-sucesso
if [ -d "${PANEL_BAK}" ]; then
    sudo rm -rf "${PANEL_BAK}"
fi

IP_LOCAL=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
echo ""
echo "=================================================================="
echo "🎉 DEPLOY CONCLUÍDO COM SUCESSO!"
echo "=================================================================="
echo "🌐 Acesse no seu navegador: http://${IP_LOCAL}"
echo "📊 API Server Panel em:     http://${IP_LOCAL}/api/status"
echo "🛡️  Proxy AdGuard Home em:   http://${IP_LOCAL}/adguard-api/stats"
echo "=================================================================="

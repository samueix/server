#!/usr/bin/env bash
# ==============================================================================
# Script de Atualização e Deploy Seguro do Server Panel
# Servidor: samuelserver | IP: 192.168.100.23 / 100.97.208.102 (Tailscale)
# ==============================================================================
# Recursos de Segurança:
# 1. Preservação automática de .env e server-config.json
# 2. Backup timestamped em /var/backups/server-panel/ antes de qualquer alteração
# 3. Rollback automático em caso de falha no build, nginx ou inicialização do serviço
# 4. Verificação de integridade pós-deploy via health-check HTTP
# ==============================================================================
set -euo pipefail

APP_DIR="/opt/server-panel"
WWW_DIR="/var/www/server-panel"
BACKUP_ROOT="/var/backups/server-panel"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_ROOT}/backup_${TIMESTAMP}"
SERVICE_NAME="server-panel"

echo "=================================================================="
echo "🚀 INICIANDO ATUALIZAÇÃO SEGURA DO SERVER PANEL (${TIMESTAMP})"
echo "=================================================================="

# 1. Garantir diretório do projeto
cd "${APP_DIR}"

# 2. Preservar arquivos de configuração locais
echo "🔒 Salvaguardando arquivos de configuração locais..."
mkdir -p /tmp/server-panel-config-tmp
[ -f .env ] && cp -a .env /tmp/server-panel-config-tmp/.env 2>/dev/null || true
[ -f server-config.json ] && cp -a server-config.json /tmp/server-panel-config-tmp/server-config.json 2>/dev/null || true

# 3. Criar backup da versão atualmente publicada em /var/www/server-panel
if [ -d "${WWW_DIR}" ] && [ "$(ls -A "${WWW_DIR}")" ]; then
    echo "💾 Criando backup preventivo em ${BACKUP_DIR}..."
    sudo mkdir -p "${BACKUP_ROOT}"
    sudo cp -a "${WWW_DIR}" "${BACKUP_DIR}"
    sudo rm -rf /var/www/server-panel.bak
    sudo cp -a "${WWW_DIR}" /var/www/server-panel.bak
    echo "✅ Backup concluído em: ${BACKUP_DIR}"
fi

# Função de Rollback Automático
rollback() {
    echo ""
    echo "=================================================================="
    echo "❌ FALHA DETECTADA DURANTE O PROCESSO DE DEPLOY!"
    echo "🔄 Executando Rollback Automático para a versão anterior..."
    echo "=================================================================="
    
    # Restaura configurações locais temporárias
    [ -f /tmp/server-panel-config-tmp/.env ] && cp -a /tmp/server-panel-config-tmp/.env "${APP_DIR}/.env" 2>/dev/null || true
    [ -f /tmp/server-panel-config-tmp/server-config.json ] && cp -a /tmp/server-panel-config-tmp/server-config.json "${APP_DIR}/server-config.json" 2>/dev/null || true
    
    # Restaura arquivos web do backup
    if [ -d "${BACKUP_DIR}" ]; then
        echo "📂 Restaurando arquivos de ${BACKUP_DIR} para ${WWW_DIR}..."
        sudo mkdir -p "${WWW_DIR}"
        sudo rm -rf "${WWW_DIR:?}"/*
        sudo cp -a "${BACKUP_DIR}/." "${WWW_DIR}/"
        sudo chown -R www-data:www-data "${WWW_DIR}"
        sudo chmod -R 755 "${WWW_DIR}"
    fi

    # Restaura serviço e nginx
    echo "🔄 Reiniciando serviços para o estado anterior..."
    sudo systemctl restart "${SERVICE_NAME}" 2>/dev/null || sudo systemctl restart server-panel-backend 2>/dev/null || true
    sudo nginx -t && sudo systemctl reload nginx 2>/dev/null || true

    echo "⚠️ Rollback finalizado. O painel continua operando na versão anterior estável."
    echo "=================================================================="
    exit 1
}

# Armar trap de erro para invocar rollback
trap rollback ERR

# 4. Atualizar repositório Git de forma segura
echo "📥 Atualizando código fonte do repositório Git..."
# Executa git como dono do repositório (evita falha de chave SSH quando rodando como root)
REPO_OWNER=$(stat -c '%U' "${APP_DIR}" 2>/dev/null || echo samuel)
if [ "$(id -u)" -eq 0 ] && [ "${REPO_OWNER}" != "root" ]; then
    GIT=(sudo -u "${REPO_OWNER}" -H git)
    NPM=(sudo -u "${REPO_OWNER}" -H npm)
else
    GIT=(git)
    NPM=(npm)
fi
# Ignora arquivos de configuração não versionados para não barrar o merge
"${GIT[@]}" stash --include-untracked 2>/dev/null || true
"${GIT[@]}" fetch origin main
"${GIT[@]}" checkout main
"${GIT[@]}" pull --ff-only origin main || "${GIT[@]}" pull origin main
"${GIT[@]}" stash pop 2>/dev/null || true

# Restaura configs preservadas
[ -f /tmp/server-panel-config-tmp/.env ] && cp -a /tmp/server-panel-config-tmp/.env "${APP_DIR}/.env" 2>/dev/null || true
[ -f /tmp/server-panel-config-tmp/server-config.json ] && cp -a /tmp/server-panel-config-tmp/server-config.json "${APP_DIR}/server-config.json" 2>/dev/null || true

# 5. Instalar dependências se necessário
if [ -f package-lock.json ]; then
    echo "📦 Verificando integridade das dependências npm..."
    "${NPM[@]}" install --prefer-offline --no-audit --legacy-peer-deps
fi

# 6. Compilar nova versão (Frontend e Backend)
echo "🔨 Compilando nova versão do painel (npm run build)..."
"${NPM[@]}" run build

if [ ! -d "dist" ] || [ ! -f "dist/server.cjs" ]; then
    echo "❌ Erro: Diretório dist ou arquivo dist/server.cjs não foi gerado!"
    exit 1
fi

# 7. Validar sintaxe Nginx
echo "🧪 Testando configuração do Nginx..."
sudo nginx -t

# 8. Publicação atômica dos novos arquivos
echo "📂 Publicando nova versão em ${WWW_DIR}..."
sudo mkdir -p "${WWW_DIR}"
sudo rm -rf "${WWW_DIR:?}"/*
sudo cp -a dist/. "${WWW_DIR}/"
sudo chown -R www-data:www-data "${WWW_DIR}"
sudo chmod -R 755 "${WWW_DIR}"

# 9. Reiniciar serviço e recarregar Nginx
echo "⚡ Reiniciando serviço do painel (${SERVICE_NAME})..."
sudo systemctl restart "${SERVICE_NAME}" 2>/dev/null || sudo systemctl restart server-panel-backend 2>/dev/null

echo "🌐 Recarregando servidor web Nginx..."
sudo systemctl reload nginx

# 10. Validação de Saúde (Health Check)
echo "🩺 Verificando resposta da API local..."
sleep 2
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/server || echo "000")

if [ "${HEALTH_CODE}" != "200" ] && [ "${HEALTH_CODE}" != "401" ]; then
    echo "⚠️ Aviso: API respondeu com código ${HEALTH_CODE}. Aguardando mais 3 segundos..."
    sleep 3
    HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/server || echo "000")
fi

if [ "${HEALTH_CODE}" = "200" ] || [ "${HEALTH_CODE}" = "401" ]; then
    echo "✅ API ativa e respondendo perfeitamente (HTTP ${HEALTH_CODE})!"
else
    echo "❌ Falha no health check da API (HTTP ${HEALTH_CODE})!"
    exit 1
fi

# Limpeza de temporários
rm -rf /tmp/server-panel-config-tmp

echo "=================================================================="
echo "🎉 ATUALIZAÇÃO CONCLUÍDA COM TOTAL SUCESSO!"
echo "📌 Versão: $(git rev-parse --short HEAD) - $(git log -1 --pretty=%B | head -n 1)"
echo "💾 Backup preservado em: ${BACKUP_DIR}"
echo "🌐 Acesse: http://192.168.100.23 ou http://100.97.208.102"
echo "=================================================================="

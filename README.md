# 🖥️ Server Monitor - Ubuntu Server

Sistema profissional, completo e moderno de monitoramento remoto em tempo real para servidores **Ubuntu Server**, composto por um **Frontend Liquid Glass** (hospedável na Vercel, Netlify, AI Studio ou servidor web estático) e um **Backend ultraleve em Python FastAPI com psutil e WebSocket**.

---

## 📋 Sumário
1. [Arquitetura e Recursos](#-arquitetura-e-recursos)
2. [Instalação Automatizada no Ubuntu Server](#-instalação-automatizada-no-ubuntu-server)
3. [Instalação Manual Passo a Passo](#-instalação-manual-passo-a-passo)
4. [Configuração do .env](#-configuração-do-env)
5. [Configuração de CORS](#-configuração-de-cors)
6. [Como Descobrir se a Porta 8000 está Funcionando](#-como-descobrir-se-a-porta-8000-está-funcionando)
7. [Testando a API com curl](#-testando-a-api-com-curl)
8. [Configuração de HTTPS com Nginx e Certbot](#-configuração-de-https-com-nginx-e-certbot)
9. [Configuração do Frontend Externo](#-configuração-do-frontend-externo)
10. [Integração com AdGuard Home](#-integração-com-adguard-home)
11. [Comandos de Gerenciamento do systemd](#-comandos-de-gerenciamento-do-systemd)

---

## 🚀 Arquitetura e Recursos

- **Backend:** Python 3.10+, FastAPI, psutil, asyncio, WebSockets nativo, isolamento em `venv`.
- **Consumo de Memória:** ~25 MB a 40 MB de RAM no servidor (ultraleve para servidores com 20 GB de RAM).
- **Sem Banco de Dados:** Não sobrecarrega disco ou CPU com banco desnecessário.
- **Frontend:** Estética Apple-like / Liquid Glass, cards translúcidos, dark navy `#070b14`, gráficos em tempo real de 60 segundos, responsivo para desktop e celular.
- **Segurança:** Autenticação HTTP Basic ou Bearer / API-Key, Rate Limiting contra flooding, headers de segurança e sem execução arbitrária de comandos shell no servidor.

---

## ⚡ Instalação Automatizada no Ubuntu Server

No seu Ubuntu Server via terminal SSH, execute:

```bash
# 1. Clone o repositório ou faça download dos arquivos:
git clone https://github.com/seu-usuario/server-monitor.git
cd server-monitor

# 2. Conceda permissão de execução ao instalador:
chmod +x install.sh

# 3. Execute o instalador como root/sudo:
sudo ./install.sh
```

O script cuidará automaticamente de:
- Instalar dependências essenciais (`python3`, `python3-venv`, `curl`, `systemd`).
- Criar a pasta de produção em `/opt/server-monitor`.
- Criar o ambiente virtual Python isolado (`venv`) e instalar dependências.
- Gerar o arquivo `.env` com senhas e chave de API seguras.
- Registrar e iniciar o serviço systemd com inicialização automática no boot.
- Exibir seu IP de acesso e credenciais geradas.

---

## 🛠️ Instalação Manual Passo a Passo

Caso prefira configurar manualmente:

```bash
# 1. Instale dependências do sistema
sudo apt update && sudo apt install -y python3 python3-pip python3-venv curl

# 2. Crie o diretório de instalação
sudo mkdir -p /opt/server-monitor
sudo cp -r backend/* /opt/server-monitor/
cd /opt/server-monitor

# 3. Crie e ative o ambiente virtual
sudo python3 -m venv /opt/server-monitor/venv
sudo /opt/server-monitor/venv/bin/pip install --upgrade pip
sudo /opt/server-monitor/venv/bin/pip install -r requirements.txt

# 4. Crie o arquivo de ambiente
sudo cp .env.example .env
sudo nano .env # Altere ADMIN_PASSWORD e ADMIN_USERNAME

# 5. Instale o serviço systemd
sudo cp ../systemd/server-monitor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable server-monitor
sudo systemctl start server-monitor

# 6. Verifique o status
sudo systemctl status server-monitor
```

---

## ⚙️ Configuração do `.env`

O arquivo `/opt/server-monitor/.env` controla todas as variáveis do backend:

```ini
# Credenciais para login no painel
ADMIN_USERNAME=admin
ADMIN_PASSWORD=SuaSenhaForteAqui123!

# Chave de API opcional (ideal para WebSockets ou integrações diretas)
API_KEY=sua_chave_secreta_aqui

# Endereço e Porta
HOST=0.0.0.0
PORT=8000

# CORS: Permitir conexões do seu frontend externo
# Para permitir qualquer origem durante testes:
CORS_ORIGINS=*
# Para produção estrita com seu domínio:
# CORS_ORIGINS=https://monitor.seudominio.com,https://meu-app.vercel.app

# Integração AdGuard Home (opcional)
ADGUARD_URL=http://127.0.0.1:8081
ADGUARD_USERNAME=adguard_user
ADGUARD_PASSWORD=adguard_password
```

Após editar o `.env`, reinicie o serviço:
```bash
sudo systemctl restart server-monitor
```

---

## 🌐 Configuração de CORS

Como o Frontend será hospedado externamente (Vercel, Netlify, GitHub Pages, AI Studio ou outro domínio), o navegador precisa de autorização do backend (Cross-Origin Resource Sharing).

1. No arquivo `/opt/server-monitor/.env`:
   ```ini
   CORS_ORIGINS=https://seu-frontend.vercel.app,https://meu-painel.com
   ```
2. Caso esteja usando o dashboard pelo AI Studio ou em desenvolvimento:
   ```ini
   CORS_ORIGINS=*
   ```
3. Reinicie o serviço:
   ```bash
   sudo systemctl restart server-monitor
   ```

---

## 🔍 Como Descobrir se a Porta 8000 está Funcionando

Execute os seguintes comandos no terminal do Ubuntu Server:

### 1. Verificar se o processo está escutando na porta 8000:
```bash
sudo ss -tulpn | grep 8000
```
*Saída esperada:*
```text
tcp   LISTEN 0      2048         0.0.0.0:8000       0.0.0.0:*    users:(("uvicorn",pid=...,fd=...))
```

Ou usando `lsof`:
```bash
sudo lsof -i :8000
```

### 2. Verificar o Firewall UFW do Ubuntu:
Se você utiliza o firewall `ufw`, permita a porta 8000:
```bash
sudo ufw status
sudo ufw allow 8000/tcp comment 'Server Monitor API'
sudo ufw reload
```

### 3. Teste local via curl:
```bash
curl -i http://127.0.0.1:8000/api/health
```
*Deverá retornar `HTTP/1.1 200 OK` e `{"status":"ok",...}`.*

---

## 📡 Testando a API com curl

### 1. Health Check público:
```bash
curl -X GET http://SEU_IP_SERVIDOR:8000/api/health
```

### 2. Verificar Autenticação (Basic Auth):
```bash
curl -u "admin:sua_senha" http://SEU_IP_SERVIDOR:8000/api/auth/verify
```

### 3. Verificar Autenticação via Header `X-API-Key`:
```bash
curl -H "X-API-Key: sua_chave_secreta_aqui" http://SEU_IP_SERVIDOR:8000/api/auth/verify
```

### 4. Obter Resumo do Sistema Completo:
```bash
curl -u "admin:sua_senha" http://SEU_IP_SERVIDOR:8000/api/system
```

### 5. Obter Lista de Processos ordenados por CPU:
```bash
curl -u "admin:sua_senha" "http://SEU_IP_SERVIDOR:8000/api/processes?sort_by=cpu&limit=20"
```

### 6. Obter Status dos Serviços do systemd:
```bash
curl -u "admin:sua_senha" http://SEU_IP_SERVIDOR:8000/api/services
```

### 7. Obter Estatísticas do AdGuard Home:
```bash
curl -u "admin:sua_senha" http://SEU_IP_SERVIDOR:8000/api/adguard
```

---

## 🔒 Configuração de HTTPS com Nginx e Certbot (Recomendado para Produção)

Para que navegadores modernos se conectem com segurança (especialmente se o frontend estiver hospedado em HTTPS, evitando erros de *Mixed Content*):

### 1. Instalar Nginx e Certbot:
```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Criar configuração do Nginx:
Crie o arquivo `/etc/nginx/sites-available/server-monitor`:

```nginx
server {
    server_name monitor-api.seudominio.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;

        # Suporte completo para WebSockets em tempo real
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout estendido para streams persistentes
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### 3. Ativar o site e testar a sintaxe:
```bash
sudo ln -s /etc/nginx/sites-available/server-monitor /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Gerar Certificado SSL gratuito (Let's Encrypt):
```bash
sudo certbot --nginx -d monitor-api.seudominio.com
```

Agora sua API estará segura e disponível em `https://monitor-api.seudominio.com` e WebSocket em `wss://monitor-api.seudominio.com/ws`.

---

## 🖥️ Configuração do Frontend Externo

No painel web:
1. Clique no botão **⚙️ Conexão / Servidor** no canto superior direito.
2. Defina a **URL da API**:
   - Se estiver sem HTTPS: `http://SEU_IP:8000`
   - Se configurou Nginx com domínio: `https://monitor-api.seudominio.com`
3. Preencha o **Usuário** (`ADMIN_USERNAME`) e **Senha** (`ADMIN_PASSWORD`) ou **Chave de API / Token**.
4. Clique em **Salvar e Conectar**.
5. O painel conectará via WebSocket em tempo real. Se o WebSocket for bloqueado por proxies, o painel alterna automaticamente para o **HTTP Polling a cada 1.5s**.
6. Se a API estiver offline ou em manutenção, ative o **Modo Demonstração** para inspecionar a interface e os gráficos com dados simulados identificados.

---

## 🛡️ Integração com AdGuard Home

1. No servidor, certifique-se de que o serviço do AdGuard Home esteja ativo:
   ```bash
   sudo systemctl status adguard-home
   ```
2. Defina no seu arquivo `.env`:
   ```ini
   ADGUARD_URL=http://127.0.0.1:8081 # ou a porta em que o AdGuard responde
   ADGUARD_USERNAME=seu_usuario_adguard
   ADGUARD_PASSWORD=sua_senha_adguard
   ```
3. Reinicie o Server Monitor:
   ```bash
   sudo systemctl restart server-monitor
   ```
4. O painel exibirá automaticamente:
   - Consultas DNS totais e por segundo (QPS)
   - Consultas bloqueadas e porcentagem bloqueada
   - Quantidade de clientes ativos
   - Top 10 domínios consultados e bloqueados

Se o AdGuard não estiver configurado, a interface exibirá com clareza **"Indisponível"** ou **"Não configurado"** sem inventar nenhum dado!

---

## 📌 Comandos de Gerenciamento do systemd

```bash
# Iniciar o serviço
sudo systemctl start server-monitor

# Parar o serviço
sudo systemctl stop server-monitor

# Reiniciar o serviço
sudo systemctl restart server-monitor

# Ver status detalhado
sudo systemctl status server-monitor

# Visualizar logs em tempo real
sudo journalctl -u server-monitor -f

# Ver os últimos 100 registros de log
sudo journalctl -u server-monitor -n 100 --no-pager
```

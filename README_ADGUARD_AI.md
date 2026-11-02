# AdGuard Home AI - Analisador Inteligente de Bloqueios

Painel corporativo estilo NOC (Network Operations Center) integrado ao **AdGuard Home** no **Ubuntu Server**, utilizando Inteligência Artificial (**Google Gemini 3.8 Flash**) para identificar, catalogar e explicar o propósito e riscos de cada domínio bloqueado, com persistência e cache local em banco de dados **SQLite**.

---

## 🌟 Principais Funcionalidades

1. **Integração Completa com a API do AdGuard Home**:
   - Consome `/control/stats`, `/control/querylog` e `/control/status`.
   - Lê contadores de consultas, taxa de bloqueio, clientes mais ativos e latência de DNS.
   - Proxy seguro no backend em Node.js (credenciais administrativas e API keys nunca são enviadas ao navegador).

2. **Identificação e Análise com Inteligência Artificial (Gemini)**:
   - Identifica: Empresa/Organização responsável, Categoria principal, Finalidade provável, Nível de risco (`baixo`, `médio`, `alto`, `crítico`, `desconhecido`) e Explicação simples em português.
   - Matriz comportamental booleana: Rastreamento, Telemetria, Publicidade, Analytics, CDN, Serviço Legítimo, Malware/Phishing.
   - **Regras Rígidas de Precisão**: Não inventa dados; se incerto, classifica como `desconhecido` sem atribuir falsos positivos de malware.

3. **Cache Inteligente e Banco de Dados SQLite**:
   - Se o domínio já foi analisado anteriormente, o sistema recupera instantaneamente do cache local **sem chamar a IA desnecessariamente**.
   - Reduz custos de requisição e oferece resposta imediata em milissegundos.

4. **Painel NOC (Network Operations Center)**:
   - Dark theme moderno e responsivo.
   - Gráfico temporal de consultas DNS e bloqueios.
   - Gráfico de distribuição percentual por categorias.
   - Filtros instantâneos: `Todos`, `Publicidade`, `Rastreamento`, `Telemetria`, `Analytics`, `Malware`, `Phishing`, `Outros`.
   - Busca em tempo real por nome do domínio, empresa ou finalidade.
   - Dossiê detalhado em modal ao clicar em qualquer domínio.
   - Atualização automática com seletor de intervalo + botão **"ATUALIZAR AGORA"**.

---

## 🚀 Instalação Rápida no Ubuntu Server

### Opção 1: Via Script Automatizado (Recomendado)

No seu terminal do Ubuntu Server, dentro da pasta do projeto, execute:

```bash
chmod +x setup-ubuntu.sh
./setup-ubuntu.sh
```

O script irá instalar o Node.js 22 LTS (se necessário), compilar o projeto e configurar o serviço systemd para iniciar automaticamente no boot do servidor.

---

### Opção 2: Instalação Manual

1. **Instale as dependências e compile**:
   ```bash
   npm install
   npm run build
   ```

2. **Configure suas variáveis de ambiente no `.env`**:
   ```env
   PORT=3000
   ADGUARD_URL=http://127.0.0.1:8081
   ADGUARD_USERNAME=samuel
   ADGUARD_PASSWORD=sua_senha_adguard
   GEMINI_API_KEY=sua_chave_gemini
   ```

3. **Inicie o servidor**:
   ```bash
   npm start
   ```

Acesse em: `http://SEU_IP_DO_UBUNTU:3000`

---

### Opção 3: Via Docker Compose

```bash
docker compose up -d --build
```

---

## 🔒 Segurança

- O frontend se comunica exclusivamente com `/api/adguard/*`.
- Nenhuma senha, token ou chave de API é exposta nas requisições do cliente ou no código JavaScript compilado.
- Todas as chamadas à API do AdGuard Home e ao modelo Gemini são intermediadas pelo backend em Node.js.

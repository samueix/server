import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  GitBranch,
  Info,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  ZoomIn,
} from 'lucide-react';

type LayerId = 'all' | 'entry' | 'ui' | 'client' | 'server' | 'host';

interface ArchNode {
  id: string;
  label: string;
  file: string;
  layer: Exclude<LayerId, 'all'>;
  kind?: 'circle' | 'rect' | 'db';
  x: number;
  y: number;
  w: number;
  h: number;
  summary: string;
  details: string[];
  protocols?: string;
}

interface ArchEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
  path: string;
  labelX?: number;
  labelY?: number;
}

const LAYER_META: Record<
  Exclude<LayerId, 'all'>,
  {
    name: string;
    fill: string;
    headerFill: string;
    badgeBg: string;
    textColor: string;
    borderAccent: string;
  }
> = {
  entry: {
    name: 'Entrada & Proxy',
    fill: '#FFFFFF',
    headerFill: '#1A1A2E',
    badgeBg: 'bg-[#1A1A2E] text-white',
    textColor: '#1A1A2E',
    borderAccent: '#FF5A36',
  },
  ui: {
    name: 'Dashboard UI (src/)',
    fill: '#E0F4FE',
    headerFill: '#00A6FB',
    badgeBg: 'bg-[#00A6FB] text-white',
    textColor: '#026AA2',
    borderAccent: '#00A6FB',
  },
  client: {
    name: 'Serviços Client (src/services/)',
    fill: '#FFF8E7',
    headerFill: '#FFC857',
    badgeBg: 'bg-[#FFC857] text-[#1A1A2E]',
    textColor: '#9A6700',
    borderAccent: '#F79009',
  },
  server: {
    name: 'Servidor Node.js (server.ts + server/)',
    fill: '#FFEAE5',
    headerFill: '#FF5A36',
    badgeBg: 'bg-[#FF5A36] text-white',
    textColor: '#B42318',
    borderAccent: '#FF5A36',
  },
  host: {
    name: 'Host Ubuntu, Daemons & Fallback',
    fill: '#D1FADF',
    headerFill: '#12B76A',
    badgeBg: 'bg-[#12B76A] text-white',
    textColor: '#027A48',
    borderAccent: '#12B76A',
  },
};

const NODES: ArchNode[] = [
  // Entrada & Proxy
  {
    id: 'operator',
    label: 'Operador',
    file: 'Admin / Browser',
    layer: 'entry',
    kind: 'circle',
    x: 54,
    y: 18,
    w: 76,
    h: 76,
    summary: 'Administrador acessando o painel via navegador na LAN ou Tailscale.',
    details: [
      'Autentica-se com credenciais de admin/operador em LoginScreen.tsx.',
      'Pode operar telemetria, DNS, arquivos, Lux/Opencode e navegador remoto.',
    ],
    protocols: 'HTTPS / HTTP / WebSocket',
  },
  {
    id: 'nginx',
    label: 'Nginx Reverse Proxy',
    file: ':80 / :443 • /var/www/server-panel',
    layer: 'entry',
    x: 204,
    y: 22,
    w: 436,
    h: 68,
    summary: 'Publica o build estático do React/Vite e roteia APIs e WebSockets internos.',
    details: [
      'Serve a SPA compilada em /var/www/server-panel.',
      'Faz proxy de /api/* e /browser-ws para Node.js em 127.0.0.1:3000.',
      'Faz proxy de /adguard-api/* para AdGuard Home em 127.0.0.1:8081.',
    ],
    protocols: 'HTTP/1.1, Upgrade WebSocket, SSE',
  },

  // Dashboard UI (src/)
  {
    id: 'app_shell',
    label: 'Dashboard Shell',
    file: 'App.tsx • Sidebar • Header',
    layer: 'ui',
    x: 40,
    y: 164,
    w: 182,
    h: 64,
    summary: 'Estrutura principal do painel React, navegação entre as 17 abas e barra superior.',
    details: [
      'Orquestra troca de abas sem recarregar a página.',
      'Exibe hostname, status do servidor, ações rápidas e controle de sessão.',
    ],
  },
  {
    id: 'login_screen',
    label: 'Tela de Login',
    file: 'LoginScreen.tsx',
    layer: 'ui',
    x: 242,
    y: 164,
    w: 182,
    h: 64,
    summary: 'Porta de entrada autenticada com telemetria pública resumida e validação de usuário.',
    details: [
      'Envia credenciais via authService.ts para obter sessão/token.',
      'Exibe status básico do host (RAM, CPU e IP atualizado) conforme política segura.',
    ],
  },
  {
    id: 'security_vault',
    label: 'Cofre & Ajustes',
    file: 'SecurityVaultContext • SettingsModal',
    layer: 'ui',
    x: 444,
    y: 164,
    w: 182,
    h: 64,
    summary: 'Contexto de desbloqueio de cofre (PIN/senha) e configurações locais da interface.',
    details: [
      'Protege visualização e cópia de credenciais sensíveis na aba Senhas.',
      'Gerencia preferências locais como endpoint e intervalo de atualização.',
    ],
  },
  {
    id: 'tab_telemetry',
    label: 'Visão Geral & Monitor',
    file: 'OverviewTab • MonitoringTab',
    layer: 'ui',
    x: 40,
    y: 252,
    w: 182,
    h: 64,
    summary: 'Painéis de saúde do servidor, carga por núcleo, temperatura, RAM, disco e gráficos.',
    details: [
      'Consome /api/system, /api/metrics e histórico via api.ts.',
      'Renderiza Sparklines e leitura por núcleo de CPU e sensores térmicos.',
    ],
  },
  {
    id: 'tab_network',
    label: 'Rede, Ping & Trace',
    file: 'NetworkTab • PingTab',
    layer: 'ui',
    x: 242,
    y: 252,
    w: 182,
    h: 64,
    summary: 'Interfaces IPv4/IPv6, Wi-Fi, vendor MAC, ping contínuo e traceroute em tempo real.',
    details: [
      'PingTab recebe saltos ao vivo via SSE (/api/trace/stream).',
      'NetworkTab gerencia interfaces, clientes conectados e consulta MAC vendor.',
    ],
  },
  {
    id: 'tab_system',
    label: 'Sistema, Serviços & Procs',
    file: 'SystemTab • ServicesTab • ProcessesTab',
    layer: 'ui',
    x: 444,
    y: 252,
    w: 182,
    h: 64,
    summary: 'Inventário de daemons systemd, processos ativos e informações de kernel/hardware.',
    details: [
      'Controla reinício/status de serviços autorizados no host.',
      'Lista processos ordenados por CPU/memória com busca rápida.',
    ],
  },
  {
    id: 'tab_adguard',
    label: 'AdGuard DNS & IA',
    file: 'AdGuardHomeTab • AdGuardAiDashboard',
    layer: 'ui',
    x: 40,
    y: 340,
    w: 182,
    h: 64,
    summary: 'Estatísticas de DNS, query log, bloqueios, classificação e detalhes de domínios.',
    details: [
      'Combina adguardService.ts, cliente direto e análises persistidas no backend.',
      'Inclui DualQueryChart e DomainDetailModal para inspeção de tráfego.',
    ],
  },
  {
    id: 'tab_logs_n8n',
    label: 'Logs & Workflows',
    file: 'LogsTab • N8nTab',
    layer: 'ui',
    x: 242,
    y: 340,
    w: 182,
    h: 64,
    summary: 'Leitura de logs do sistema/journalctl e monitoramento de fluxos n8n em Docker.',
    details: [
      'LogsTab filtra eventos por serviço/nível com busca textual.',
      'N8nTab acompanha execuções e status de automações na porta 5678.',
    ],
  },
  {
    id: 'tab_opencode',
    label: 'Lux e Opencode',
    file: 'OpencodeTab.tsx',
    layer: 'ui',
    x: 444,
    y: 340,
    w: 182,
    h: 64,
    summary: 'Chat operacional com seleção dinâmica de modelos, histórico de sessões e métricas de tokens.',
    details: [
      'Lista modelos via GET /api/opencode/models e salva modelo por sessão.',
      'Exibe prompt/resposta/total de tokens por mensagem, sessão e cota diária.',
    ],
  },
  {
    id: 'tab_browser',
    label: 'Navegador Remoto',
    file: 'RemoteBrowserTab.tsx',
    layer: 'ui',
    x: 40,
    y: 428,
    w: 182,
    h: 64,
    summary: 'Viewport interativo com streaming ao vivo de uma sessão Chromium controlada no servidor.',
    details: [
      'Usa browserApi.ts para abrir sessão REST e conectar ao stream WS (/browser-ws).',
      'Encaminha cliques, teclado, scroll e navegação de URLs.',
    ],
  },
  {
    id: 'tab_sec_files',
    label: 'Arquivos, Seg. & Senhas',
    file: 'FilesTab • SecurityTab • CredentialsTab',
    layer: 'ui',
    x: 242,
    y: 428,
    w: 182,
    h: 64,
    summary: 'Gerenciador de arquivos do host, auditoria/UFW/Fail2ban e cofre de credenciais.',
    details: [
      'FilesTab navega e lê/edita caminhos permitidos via fileService.ts.',
      'SecurityTab exibe alertas de invasão e permite limpar histórico autorizado.',
    ],
  },
  {
    id: 'tab_local',
    label: 'Ferramentas Web & Docs',
    file: 'CommandsTab • DocumentationTab',
    layer: 'ui',
    x: 444,
    y: 428,
    w: 182,
    h: 64,
    summary: 'Utilitários locais no navegador (sem chamada de shell/API) e manual técnico interativo.',
    details: [
      'CommandsTab ("Ferramentas Web") executa cálculos/conversões 100% no cliente.',
      'DocumentationTab consolida arquitetura, manual das 17 abas e runbooks.',
    ],
  },

  // Serviços Frontend (src/services/)
  {
    id: 'svc_auth',
    label: 'Auth Client',
    file: 'authService.ts',
    layer: 'client',
    x: 40,
    y: 618,
    w: 182,
    h: 64,
    summary: 'Gerencia login, token de sessão (TTL 10 min) e cabeçalhos de autorização.',
    details: [
      'Anexa Bearer / Basic / X-API-Key nas requisições autenticadas.',
      'Dispara renovação ou logout seguro quando a sessão expira.',
    ],
  },
  {
    id: 'svc_api',
    label: 'API Telemetria & Rede',
    file: 'api.ts',
    layer: 'client',
    x: 242,
    y: 618,
    w: 182,
    h: 64,
    summary: 'Cliente central para métricas do host, ping, traceroute SSE, Wi-Fi e serviços.',
    details: [
      'Consome /api/system, /api/ping, /api/trace/stream, /api/wifi e /api/mac-vendor.',
      'Normaliza payloads e trata timeouts/erros de conectividade.',
    ],
  },
  {
    id: 'svc_adguard',
    label: 'Clientes AdGuard',
    file: 'adguardService • Direct • Ai • Classifier',
    layer: 'client',
    x: 444,
    y: 618,
    w: 182,
    h: 64,
    summary: 'Camada especializada para consulta de DNS, classificação local e integração AI API.',
    details: [
      'Integra adguardService.ts, adguardDirectClient.ts, adguardApi.ts e adguardAiApi.ts.',
      'Usa adguardClassifier.ts para categorizar domínios consultados.',
    ],
  },
  {
    id: 'svc_browser',
    label: 'Browser Remoto Client',
    file: 'browserApi.ts',
    layer: 'client',
    x: 40,
    y: 698,
    w: 284,
    h: 64,
    summary: 'Controla criação/encerramento de sessões e ticket WebSocket do Playwright.',
    details: [
      'Chama /api/browser/* com auth headers e abre socket em /browser-ws.',
      'Transporta frames JPEG/CDP e eventos de mouse/teclado.',
    ],
    protocols: 'REST + WebSocket',
  },
  {
    id: 'svc_files_logs',
    label: 'Arquivos & Logs Client',
    file: 'fileService.ts • logsService.ts',
    layer: 'client',
    x: 342,
    y: 698,
    w: 284,
    h: 64,
    summary: 'Comunicação com endpoints de sistema de arquivos e leitura de logs do servidor.',
    details: [
      'fileService.ts envia listagem, leitura, escrita e upload/download.',
      'logsService.ts consulta journalctl e logs de acesso/segurança.',
    ],
  },

  // Servidor Node.js (server.ts + server/)
  {
    id: 'ts_server',
    label: 'HTTP / SSE / WS Server (:3000)',
    file: 'server.ts • requireAdminAuth • /api/* • /browser-ws',
    layer: 'server',
    x: 754,
    y: 164,
    w: 480,
    h: 64,
    summary: 'Núcleo Express em TypeScript rodando na porta 3000 (systemd server-panel.service).',
    details: [
      'Aplica middleware requireAdminAuth em todas as rotas administrativas (/api/*).',
      'Expõe REST API, SSE (/api/trace/stream), WebSocket (/browser-ws) e proxy fallback :8000.',
    ],
    protocols: 'Express + ws + SSE',
  },
  {
    id: 'ts_sys',
    label: 'Sistema, Procs & Wi-Fi',
    file: 'systemMonitor • servicesMonitor • wifiMonitor',
    layer: 'server',
    x: 708,
    y: 252,
    w: 180,
    h: 64,
    summary: 'Coleta CPU por núcleo, temperaturas, memória, interfaces Wi-Fi e estado systemd.',
    details: [
      'Lê /proc/*, sensores térmicos, systemctl e wpa_cli/netplan.',
      'Alimenta OverviewTab, MonitoringTab, ServicesTab e NetworkTab.',
    ],
  },
  {
    id: 'ts_net_logs',
    label: 'Ping, Trace & Histórico',
    file: 'pingMonitor • metricsHistory • logsMonitor',
    layer: 'server',
    x: 904,
    y: 252,
    w: 180,
    h: 64,
    summary: 'Executa ICMP/MTR streaming, mantém série temporal de métricas e lê logs.',
    details: [
      'pingMonitor.ts transmite saltos progressivos via SSE.',
      'metricsHistory.ts e logsMonitor.ts fornecem histórico e journalctl.',
    ],
  },
  {
    id: 'ts_sec',
    label: 'Cofre, Audit & Segurança',
    file: 'credentialsManager • auditLog • securityMonitor',
    layer: 'server',
    x: 1100,
    y: 252,
    w: 180,
    h: 64,
    summary: 'Monitora tentativas de invasão, firewall UFW, trilha de auditoria e cofre.',
    details: [
      'securityMonitor.ts lê auth.log/SSH/UFW e suporta limpeza do histórico.',
      'credentialsManager.ts protege segredos armazenados no servidor.',
    ],
  },
  {
    id: 'ts_files',
    label: 'Explorador de Arquivos',
    file: 'fileExplorer.ts',
    layer: 'server',
    x: 708,
    y: 340,
    w: 180,
    h: 64,
    summary: 'Operações seguras de leitura, listagem e edição no sistema de arquivos do host.',
    details: [
      'Valida caminhos permitidos e metadados (tamanho, permissões, timestamps).',
      'Atende requisições autenticadas de fileService.ts.',
    ],
  },
  {
    id: 'ts_opencode',
    label: 'Agente Lux / Opencode',
    file: 'opencode.ts',
    layer: 'server',
    x: 904,
    y: 340,
    w: 180,
    h: 64,
    summary: 'Orquestra a CLI opencode via spawn, descobre modelos e contabiliza tokens.',
    details: [
      'Executa `opencode models` com cache de 60s e sanitização de IDs.',
      'Persiste sessões e cotas de tokens em data/opencode_sessions.json e data/opencode_tokens.json.',
    ],
  },
  {
    id: 'ts_db',
    label: 'Banco Análises DNS',
    file: 'db.ts',
    layer: 'server',
    kind: 'db',
    x: 1100,
    y: 340,
    w: 180,
    h: 64,
    summary: 'Armazena cache e resultados de classificação/análise de domínios DNS.',
    details: [
      'Evita reanálises repetidas de domínios já inspecionados.',
      'Consultado por rotas de análise AdGuard e enriquecimento de logs.',
    ],
  },
  {
    id: 'ts_adguard_n8n',
    label: 'Clientes AdGuard & n8n',
    file: 'adguardClient.ts • n8nClient.ts',
    layer: 'server',
    x: 708,
    y: 428,
    w: 280,
    h: 64,
    summary: 'Conectores server-side para a API do AdGuard Home e workflows Docker do n8n.',
    details: [
      'adguardClient.ts consulta querylog, filtros e estatísticas em :8081.',
      'n8nClient.ts monitora fluxos e status do container em :5678.',
    ],
  },
  {
    id: 'ts_browser',
    label: 'Motor Playwright CDP',
    file: 'browserSession.ts',
    layer: 'server',
    x: 1000,
    y: 428,
    w: 280,
    h: 64,
    summary: 'Gerencia instâncias Chromium headless via Playwright e streaming screencast CDP.',
    details: [
      'Emite frames em tempo real pelo WebSocket /browser-ws.',
      'Traduz eventos de mouse/teclado da UI para a página remota.',
    ],
  },

  // Host Ubuntu, Daemons & Fallback Python
  {
    id: 'host_linux',
    label: 'Kernel & Daemons Linux',
    file: '/proc • systemctl • journalctl • ufw • ss',
    layer: 'host',
    x: 708,
    y: 618,
    w: 280,
    h: 64,
    summary: 'Camada base do Ubuntu 26.04.1 LTS (samuelserver, kernel 7.0.0) lida pelo backend.',
    details: [
      'Fornece telemetria de CPU, sensores térmicos, sockets, Wi-Fi e logs do sistema.',
      'Gerencia serviços via systemd (server-panel, AdGuardHome, nginx, tailscaled).',
    ],
  },
  {
    id: 'host_daemons',
    label: 'AdGuard Home & n8n Docker',
    file: 'AdGuard :53/:8081 • n8n :5678',
    layer: 'host',
    x: 1000,
    y: 618,
    w: 280,
    h: 64,
    summary: 'Serviços locais de filtragem DNS da rede e automação de workflows.',
    details: [
      'AdGuard Home resolve DNS (:53) e expõe painel/API (:8081).',
      'n8n roda em container Docker na porta :5678.',
    ],
  },
  {
    id: 'host_ai_browser',
    label: 'Opencode CLI & Chromium',
    file: 'binário opencode • Playwright Chromium',
    layer: 'host',
    x: 708,
    y: 702,
    w: 280,
    h: 64,
    summary: 'Executáveis locais acionados sob demanda pelo servidor Node.js.',
    details: [
      'CLI `opencode` processa prompts e lista modelos disponíveis.',
      'Chromium headless rende páginas remotas controladas pela aba Navegador Remoto.',
    ],
  },
  {
    id: 'host_external',
    label: 'Persistência & API Externa',
    file: 'data/*.json • api.macvendors.com',
    layer: 'host',
    x: 1000,
    y: 702,
    w: 280,
    h: 64,
    summary: 'Armazenamento local em disco e consulta externa de fabricantes MAC.',
    details: [
      'data/ guarda sessões Opencode, tokens e análises persistidas.',
      'api.macvendors.com resolve OUI de dispositivos na rede LAN.',
    ],
  },
  {
    id: 'py_fallback',
    label: 'FastAPI Backend Opcional (Fallback :8000)',
    file: 'backend/ [main.py • auth • monitor • services • logs • adguard • n8n]',
    layer: 'host',
    x: 708,
    y: 790,
    w: 572,
    h: 82,
    summary: 'Servidor Python FastAPI mantido como backend alternativo/fallback quando habilitado.',
    details: [
      'Módulos: main.py, auth.py, monitor.py, services.py, logs.py, adguard.py, n8n.py.',
      'server.ts encaminha rotas selecionadas para :8000 apenas quando o fallback Python está ativo.',
    ],
    protocols: 'FastAPI / Uvicorn (:8000)',
  },
];

const EDGES: ArchEdge[] = [
  // Entry -> Proxy -> UI & Server
  {
    id: 'e-op-nginx',
    from: 'operator',
    to: 'nginx',
    label: 'HTTPS',
    path: 'M 130 56 L 204 56',
    labelX: 167,
    labelY: 46,
  },
  {
    id: 'e-nginx-app',
    from: 'nginx',
    to: 'app_shell',
    label: 'SPA estática',
    path: 'M 280 90 L 280 105 L 131 105 L 131 164',
    labelX: 205,
    labelY: 102,
  },
  {
    id: 'e-nginx-server',
    from: 'nginx',
    to: 'ts_server',
    label: 'proxy /api/* & /browser-ws',
    path: 'M 640 56 L 994 56 L 994 164',
    labelX: 816,
    labelY: 46,
  },
  {
    id: 'e-nginx-adguard',
    from: 'nginx',
    to: 'host_daemons',
    label: 'proxy /adguard-api/*',
    dashed: true,
    path: 'M 640 38 L 1304 38 L 1304 650 L 1280 650',
    labelX: 1185,
    labelY: 28,
  },

  // UI internal flow
  {
    id: 'e-app-login',
    from: 'app_shell',
    to: 'login_screen',
    label: 'autentica',
    path: 'M 222 196 L 242 196',
  },
  {
    id: 'e-app-vault',
    from: 'app_shell',
    to: 'security_vault',
    label: 'cofre',
    path: 'M 176 164 L 176 155 L 535 155 L 535 164',
    labelX: 356,
    labelY: 152,
  },
  {
    id: 'e-app-tabs',
    from: 'app_shell',
    to: 'tab_telemetry',
    path: 'M 131 228 L 131 252',
  },
  {
    id: 'e-app-net',
    from: 'app_shell',
    to: 'tab_network',
    path: 'M 131 238 L 333 238 L 333 252',
  },
  {
    id: 'e-app-sys',
    from: 'app_shell',
    to: 'tab_system',
    path: 'M 333 238 L 535 238 L 535 252',
  },
  {
    id: 'e-tabs-row3',
    from: 'tab_telemetry',
    to: 'tab_adguard',
    path: 'M 131 316 L 131 340',
  },
  {
    id: 'e-tabs-row4',
    from: 'tab_adguard',
    to: 'tab_browser',
    path: 'M 131 404 L 131 428',
  },

  // UI -> Client services
  {
    id: 'e-login-auth',
    from: 'login_screen',
    to: 'svc_auth',
    label: 'credenciais',
    path: 'M 256 228 L 232 228 L 232 596 L 131 596 L 131 618',
    labelX: 185,
    labelY: 560,
  },
  {
    id: 'e-telemetry-api',
    from: 'tab_telemetry',
    to: 'svc_api',
    label: 'telemetria',
    path: 'M 222 284 L 232 284 L 232 560 L 333 560 L 333 618',
    labelX: 333,
    labelY: 560,
  },
  {
    id: 'e-adguard-svc',
    from: 'tab_adguard',
    to: 'svc_adguard',
    label: 'DNS & IA',
    path: 'M 222 372 L 434 372 L 434 596 L 535 596 L 535 618',
    labelX: 486,
    labelY: 560,
  },
  {
    id: 'e-browser-client',
    from: 'tab_browser',
    to: 'svc_browser',
    label: 'stream CDP',
    path: 'M 131 492 L 131 552 L 32 552 L 32 730 L 40 730',
    labelX: 82,
    labelY: 552,
  },
  {
    id: 'e-secfiles-client',
    from: 'tab_sec_files',
    to: 'svc_files_logs',
    label: 'arquivos/logs',
    path: 'M 333 492 L 333 582 L 484 582 L 484 698',
  },
  {
    id: 'e-auth-api',
    from: 'svc_auth',
    to: 'svc_api',
    label: 'Bearer',
    path: 'M 222 650 L 242 650',
  },

  // Client services -> Node.js server & FastAPI fallback
  {
    id: 'e-api-ts',
    from: 'svc_api',
    to: 'ts_server',
    label: 'REST /api/* & SSE',
    path: 'M 424 650 L 664 650 L 664 196 L 754 196',
    labelX: 664,
    labelY: 422,
  },
  {
    id: 'e-browser-ts',
    from: 'svc_browser',
    to: 'ts_browser',
    label: 'WS /browser-ws',
    path: 'M 324 730 L 676 730 L 676 558 L 1140 558 L 1140 492',
    labelX: 676,
    labelY: 668,
  },
  {
    id: 'e-api-py',
    from: 'svc_api',
    to: 'py_fallback',
    label: 'fallback :8000',
    dashed: true,
    path: 'M 664 650 L 664 831 L 708 831',
    labelX: 664,
    labelY: 790,
  },

  // Node.js Server internal fan-out
  {
    id: 'e-ts-sys',
    from: 'ts_server',
    to: 'ts_sys',
    path: 'M 994 228 L 994 240 L 798 240 L 798 252',
  },
  {
    id: 'e-ts-net',
    from: 'ts_server',
    to: 'ts_net_logs',
    path: 'M 994 228 L 994 252',
  },
  {
    id: 'e-ts-sec',
    from: 'ts_server',
    to: 'ts_sec',
    path: 'M 994 240 L 1190 240 L 1190 252',
  },
  {
    id: 'e-ts-files',
    from: 'ts_server',
    to: 'ts_files',
    path: 'M 896 240 L 896 328 L 798 328 L 798 340',
  },
  {
    id: 'e-ts-opencode',
    from: 'ts_server',
    to: 'ts_opencode',
    path: 'M 994 316 L 994 340',
  },
  {
    id: 'e-ts-db',
    from: 'ts_server',
    to: 'ts_db',
    path: 'M 1092 240 L 1092 328 L 1190 328 L 1190 340',
  },
  {
    id: 'e-opencode-db',
    from: 'ts_opencode',
    to: 'ts_db',
    label: 'DNS',
    dashed: true,
    path: 'M 1084 372 L 1100 372',
  },
  {
    id: 'e-ts-adguard',
    from: 'ts_server',
    to: 'ts_adguard_n8n',
    path: 'M 896 328 L 896 416 L 848 416 L 848 428',
  },
  {
    id: 'e-ts-browser',
    from: 'ts_server',
    to: 'ts_browser',
    path: 'M 1092 328 L 1092 416 L 1140 416 L 1140 428',
  },

  // Node.js Server -> Host & Daemons
  {
    id: 'e-sys-linux',
    from: 'ts_sys',
    to: 'host_linux',
    label: '/proc & systemd',
    path: 'M 708 284 L 698 284 L 698 650 L 708 650',
  },
  {
    id: 'e-adguard-daemons',
    from: 'ts_adguard_n8n',
    to: 'host_daemons',
    label: ':8081 / :5678',
    path: 'M 848 492 L 848 552 L 1042 552 L 1042 618',
    labelX: 952,
    labelY: 552,
  },
  {
    id: 'e-opencode-cli',
    from: 'ts_opencode',
    to: 'host_ai_browser',
    label: 'spawn CLI',
    path: 'M 994 404 L 994 606 L 848 606 L 848 702',
    labelX: 922,
    labelY: 552,
  },
  {
    id: 'e-browser-chromium',
    from: 'ts_browser',
    to: 'host_ai_browser',
    dashed: true,
    path: 'M 1140 492 L 1140 692 L 896 692 L 896 702',
  },
  {
    id: 'e-db-ext',
    from: 'ts_db',
    to: 'host_external',
    label: 'data/*.json',
    dashed: true,
    path: 'M 1280 372 L 1290 372 L 1290 734 L 1280 734',
  },
];

const MERMAID_SOURCE = `flowchart TD
  operator(("Operador / Admin"))
  nginx["Nginx Reverse Proxy\\n[:80 / :443 • /var/www/server-panel]"]

  subgraph group_ui["Dashboard UI (src/)"]
    app["Dashboard Shell\\n[App.tsx • Sidebar • Header]"]
    login["Tela de Login\\n[LoginScreen.tsx]"]
    vault["Cofre & Ajustes\\n[SecurityVaultContext • SettingsModal]"]
    overview["Visão Geral & Monitor\\n[OverviewTab • MonitoringTab]"]
    network["Rede, Ping & Trace\\n[NetworkTab • PingTab]"]
    system["Sistema, Serviços & Procs\\n[SystemTab • ServicesTab • ProcessesTab]"]
    adguard_ui["AdGuard DNS & IA\\n[AdGuardHomeTab • AdGuardAiDashboard]"]
    logs_n8n["Logs & Workflows\\n[LogsTab • N8nTab]"]
    opencode_ui["Lux e Opencode\\n[OpencodeTab.tsx]"]
    browser_ui["Navegador Remoto\\n[RemoteBrowserTab.tsx]"]
    sec_files["Arquivos, Seg. & Senhas\\n[FilesTab • SecurityTab • CredentialsTab]"]
    local_ui["Ferramentas Web & Docs\\n[CommandsTab • DocumentationTab]"]
  end

  subgraph group_client["Serviços Frontend (src/services/)"]
    auth_cli["Auth Client\\n[authService.ts]"]
    api_cli["API Telemetria & Rede\\n[api.ts]"]
    adguard_cli["Clientes AdGuard\\n[adguardService • Direct • Ai • Classifier]"]
    browser_cli["Browser Remoto Client\\n[browserApi.ts]"]
    files_cli["Arquivos & Logs Client\\n[fileService.ts • logsService.ts]"]
  end

  subgraph group_server["Servidor Node.js / Express (server.ts + server/)"]
    ts_api["HTTP / SSE / WS Server (:3000)\\n[server.ts • requireAdminAuth]"]
    ts_sys["Sistema, Procs & Wi-Fi\\n[systemMonitor • servicesMonitor • wifiMonitor]"]
    ts_net["Ping, Trace & Histórico\\n[pingMonitor • metricsHistory • logsMonitor]"]
    ts_sec["Cofre, Audit & Segurança\\n[credentialsManager • auditLog • securityMonitor]"]
    ts_files["Explorador de Arquivos\\n[fileExplorer.ts]"]
    ts_opencode["Agente Lux / Opencode\\n[opencode.ts]"]
    ts_db[("Banco Análises DNS\\n[db.ts]")]
    ts_integ["Clientes AdGuard & n8n\\n[adguardClient.ts • n8nClient.ts]"]
    ts_browser["Motor Playwright CDP\\n[browserSession.ts]"]
  end

  subgraph group_host["Host Ubuntu (samuelserver), Daemons & Fallback"]
    linux["Kernel & Daemons Linux\\n[/proc • systemctl • journalctl • ufw • ss]"]
    daemons["AdGuard Home & n8n Docker\\n[AdGuard :53/:8081 • n8n :5678]"]
    cli_bin["Opencode CLI & Chromium\\n[binário opencode • Playwright]"]
    ext[("Persistência & API Externa\\n[data/*.json • api.macvendors.com]")]
    py_api["FastAPI Fallback Opcional (:8000)\\n[backend/ main.py • auth • monitor • adguard • n8n]"]
  end

  operator -->|"HTTPS"| nginx
  nginx -->|"SPA estática"| app
  nginx -->|"proxy /api/* & /browser-ws"| ts_api
  nginx -.->|"proxy /adguard-api/*"| daemons
  app -->|"autentica"| login
  app -->|"cofre"| vault
  login -->|"credenciais"| auth_cli
  overview & network & system -->|"telemetria"| api_cli
  adguard_ui -->|"DNS & IA"| adguard_cli
  browser_ui -->|"stream CDP"| browser_cli
  sec_files -->|"arquivos/logs"| files_cli
  auth_cli -->|"Bearer"| api_cli
  api_cli -->|"REST /api/* & SSE"| ts_api
  browser_cli -->|"WS /browser-ws"| ts_browser
  api_cli -.->|"fallback :8000"| py_api
  ts_api --> ts_sys & ts_net & ts_sec & ts_files & ts_opencode & ts_db & ts_integ & ts_browser
  ts_opencode -.->|"análises DNS"| ts_db
  ts_sys --> linux
  ts_integ --> daemons
  ts_opencode -->|"spawn CLI"| cli_bin
  ts_browser -.-> cli_bin
  ts_db -.-> ext`;

export const ArchitectureDiagram: React.FC = () => {
  const [activeLayer, setActiveLayer] = useState<LayerId>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('ts_server');
  const [zoom, setZoom] = useState(1);
  const [copiedMermaid, setCopiedMermaid] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, moved: false });
  const didDragRef = useRef(false);
  const hasInteractedRef = useRef(false);

  const selectedNode = useMemo(
    () => NODES.find((n) => n.id === selectedNodeId) ?? NODES[0],
    [selectedNodeId]
  );

  const nodeById = useMemo(() => {
    const map = new Map<string, ArchNode>();
    for (const node of NODES) map.set(node.id, node);
    return map;
  }, []);

  const connectedEdges = useMemo(() => {
    const incoming = EDGES.filter((e) => e.to === selectedNode.id);
    const outgoing = EDGES.filter((e) => e.from === selectedNode.id);
    return { incoming, outgoing };
  }, [selectedNode.id]);

  const isNodeHighlighted = (node: ArchNode) =>
    activeLayer === 'all' || node.layer === activeLayer || node.id === selectedNodeId;

  const focusNodeId = hoveredNodeId || selectedNodeId;
  const isEdgeHighlighted = (edge: ArchEdge) => {
    if (activeLayer === 'all') {
      return edge.from === focusNodeId || edge.to === focusNodeId;
    }
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    return fromNode?.layer === activeLayer || toNode?.layer === activeLayer;
  };

  const copyTextSafe = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch {}
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.focus(); ta.select(); const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
    } catch { return false; }
  };

  const handleCopyMermaid = async () => {
    try {
      await void copyTextSafe(MERMAID_SOURCE);
      setCopiedMermaid(true);
      setTimeout(() => setCopiedMermaid(false), 1800);
    } catch {
      // Clipboard indisponível em contextos sem permissão
    }
  };

  const clampZoom = (z: number) => Math.min(2.8, Math.max(0.35, z));

  const fitToWidth = () => {
    const el = canvasRef.current;
    if (!el) {
      setZoom(1);
      return;
    }
    const available = Math.max(320, el.clientWidth - 24);
    setZoom(clampZoom(available / 1320));
  };

  useEffect(() => {
    fitToWidth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left + el.scrollLeft;
      const mouseY = e.clientY - rect.top + el.scrollTop;
      const prev = zoom;
      const factor = e.deltaY < 0 ? 1.12 : 0.9;
      const next = clampZoom(prev * factor);
      if (Math.abs(next - prev) < 0.0005) return;
      const ratio = next / prev;
      setZoom(next);
      requestAnimationFrame(() => {
        el.scrollLeft = mouseX * ratio - (e.clientX - rect.left);
        el.scrollTop = mouseY * ratio - (e.clientY - rect.top);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom]);

  useEffect(() => {
    if (!hasInteractedRef.current) return;
    inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedNodeId]);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-node-id]') || target.closest('button, a, input, textarea, select, summary, details')) return;
    const el = canvasRef.current;
    if (!el) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      moved: false,
    };
    didDragRef.current = false;
    try { el.setPointerCapture(e.pointerId); } catch {}
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = canvasRef.current;
    const drag = dragRef.current;
    if (!el || !drag.active) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      didDragRef.current = true;
    }
    if (drag.moved) {
      el.scrollLeft = drag.scrollLeft - dx;
      el.scrollTop = drag.scrollTop - dy;
      e.preventDefault();
    }
  };

  const endPan = (e?: React.PointerEvent<HTMLDivElement>) => {
    const el = canvasRef.current;
    if (e && el) {
      try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch {}
    }
    dragRef.current.active = false;
    window.setTimeout(() => { didDragRef.current = false; }, 0);
  };

  const selectNode = (id: string) => {
    if (didDragRef.current) return;
    hasInteractedRef.current = true;
    setSelectedNodeId(id);
  };

  const svgWidth = Math.round(1320 * zoom);
  const svgHeight = Math.round(916 * zoom);

  return (
    <div className="p-4 sm:p-5 rounded-xl bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] space-y-4">
      {/* Cabeçalho e controles */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b-2 border-[#1A1A2E]">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#FF5A36] text-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center shrink-0">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-sm sm:text-base font-title text-[#1A1A2E]">
              Diagrama de Arquitetura do Painel (samuelserver)
            </h3>
            <p className="text-xs text-[#4A4A68] font-medium">
              Mapeamento fiel do código atual: Proxy Nginx, 17 abas React, serviços client, servidor Node.js (:3000) e daemons Ubuntu.
            </p>
          </div>
        </div>

        {/* Controles de zoom */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-[#4A4A68] mr-1 flex items-center gap-1">
            <ZoomIn className="w-3.5 h-3.5" /> Zoom:
          </span>
          {(
            [
              { id: 'fit', label: 'Ajustar', icon: Minimize2, onClick: fitToWidth, active: false },
              { id: 'out', label: '−', icon: null, onClick: () => setZoom((z) => clampZoom(z / 1.15)), active: false },
              { id: 'in', label: '+', icon: null, onClick: () => setZoom((z) => clampZoom(z * 1.15)), active: false },
              { id: 'reset', label: '100%', icon: Layers, onClick: () => setZoom(1), active: Math.abs(zoom - 1) < 0.04 },
            ] as const
          ).map((z) => {
            const Icon = z.icon as any;
            return (
              <button
                key={z.id}
                type="button"
                onClick={z.onClick}
                className={`px-2.5 py-1 rounded-md border-2 border-[#1A1A2E] text-xs font-bold flex items-center gap-1 shadow-[2px_2px_0px_#1A1A2E] cursor-pointer transition-colors ${
                  z.active ? 'bg-[#1A1A2E] text-white' : 'bg-white text-[#1A1A2E] hover:bg-[#FFC857]/30'
                }`}
                title={z.label === '+' ? 'Ampliar' : z.label === '−' ? 'Reduzir' : z.label}
              >
                {Icon ? <Icon className="w-3 h-3" /> : null}
                {z.label}
              </button>
            );
          })}
          <span className="ml-1 text-[11px] font-mono font-bold text-[#4A4A68] min-w-[3.5rem] text-right">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* Filtros por camada */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-bold text-[#4A4A68]">Camada:</span>
          {(
            [
              { id: 'all', label: 'Visão Completa', activeClass: 'bg-[#1A1A2E] text-white' },
              { id: 'entry', label: 'Entrada & Proxy', activeClass: 'bg-[#1A1A2E] text-white' },
              { id: 'ui', label: 'Dashboard UI', activeClass: 'bg-[#00A6FB] text-white' },
              { id: 'client', label: 'Serviços Client', activeClass: 'bg-[#FFC857] text-[#1A1A2E]' },
              { id: 'server', label: 'Servidor Node.js', activeClass: 'bg-[#FF5A36] text-white' },
              { id: 'host', label: 'Host & Daemons', activeClass: 'bg-[#12B76A] text-white' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveLayer(f.id)}
              className={`px-2.5 py-1 rounded-md border-2 border-[#1A1A2E] font-bold shadow-[2px_2px_0px_#1A1A2E] cursor-pointer transition-colors ${
                activeLayer === f.id
                  ? f.activeClass
                  : 'bg-white text-[#4A4A68] hover:text-[#1A1A2E]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {activeLayer !== 'all' && (
          <button
            type="button"
            onClick={() => setActiveLayer('all')}
            className="px-2.5 py-1 rounded-md border-2 border-[#1A1A2E] bg-white text-xs font-bold flex items-center gap-1 shadow-[2px_2px_0px_#1A1A2E] hover:bg-[#FFF8E7] cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> Mostrar tudo
          </button>
        )}
      </div>

      {/* Canvas SVG Interativo */}
      <div
        ref={canvasRef}
        className="rounded-xl border-2 border-[#1A1A2E] bg-white shadow-[3px_3px_0px_#1A1A2E] overflow-auto p-2 max-h-[75vh] relative cursor-grab active:cursor-grabbing"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onPointerLeave={endPan}
      >
        <svg
          viewBox="0 0 1320 916"
          width={svgWidth}
          height={svgHeight}
          className="block select-none"
          style={{ minWidth: svgWidth, minHeight: svgHeight }}
          role="img"
          aria-label="Diagrama de arquitetura completo do servidor e painel samuelserver"
        >
          <defs>
            <pattern id="neo-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="#1A1A2E" fillOpacity="0.08" />
            </pattern>
            <marker
              id="arrow-dark"
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#1A1A2E" />
            </marker>
            <marker
              id="arrow-accent"
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#FF5A36" />
            </marker>
          </defs>

          {/* Fundo pontilhado */}
          <rect x="0" y="0" width="1320" height="916" rx="10" fill="#FFFDF8" />
          <rect x="0" y="0" width="1320" height="916" rx="10" fill="url(#neo-grid)" />

          {/* Containers de Camadas (Subgrafos Neo-Brutalistas) */}
          {/* Grupo 1: Dashboard UI */}
          <g opacity={activeLayer === 'all' || activeLayer === 'ui' ? 1 : 0.45}>
            <rect x="28" y="124" width="616" height="424" rx="12" fill="#1A1A2E" />
            <rect
              x="24"
              y="120"
              width="616"
              height="424"
              rx="12"
              fill="#F3FAFF"
              stroke="#1A1A2E"
              strokeWidth="2.5"
            />
            <path
              d="M 24 132 Q 24 120 36 120 L 628 120 Q 640 120 640 132 L 640 148 L 24 148 Z"
              fill="#00A6FB"
              stroke="#1A1A2E"
              strokeWidth="2"
            />
            <text x="40" y="139" fill="#FFFFFF" fontSize="12" fontWeight="800" fontFamily="Bricolage Grotesque, sans-serif">
              DASHBOARD UI — 17 ABAS REAIS [src/]
            </text>
            <rect x="40" y="506" width="584" height="24" rx="6" fill="#E0F4FE" stroke="#1A1A2E" strokeWidth="1.5" />
            <text x="332" y="522" textAnchor="middle" fill="#026AA2" fontSize="10.5" fontWeight="700" fontFamily="IBM Plex Sans, sans-serif">
              Nota: CommandsTab ("Ferramentas Web") executa 100% local no navegador sem chamada de API/shell
            </text>
          </g>

          {/* Grupo 2: Serviços Frontend */}
          <g opacity={activeLayer === 'all' || activeLayer === 'client' ? 1 : 0.45}>
            <rect x="28" y="578" width="616" height="202" rx="12" fill="#1A1A2E" />
            <rect
              x="24"
              y="574"
              width="616"
              height="202"
              rx="12"
              fill="#FFFCF2"
              stroke="#1A1A2E"
              strokeWidth="2.5"
            />
            <path
              d="M 24 586 Q 24 574 36 574 L 628 574 Q 640 574 640 586 L 640 602 L 24 602 Z"
              fill="#FFC857"
              stroke="#1A1A2E"
              strokeWidth="2"
            />
            <text x="40" y="593" fill="#1A1A2E" fontSize="12" fontWeight="800" fontFamily="Bricolage Grotesque, sans-serif">
              SERVIÇOS FRONTEND [src/services/]
            </text>
          </g>

          {/* Grupo 3: Servidor TypeScript / Node.js */}
          <g opacity={activeLayer === 'all' || activeLayer === 'server' ? 1 : 0.45}>
            <rect x="696" y="124" width="604" height="424" rx="12" fill="#1A1A2E" />
            <rect
              x="692"
              y="120"
              width="604"
              height="424"
              rx="12"
              fill="#FFF5F2"
              stroke="#1A1A2E"
              strokeWidth="2.5"
            />
            <path
              d="M 692 132 Q 692 120 704 120 L 1284 120 Q 1296 120 1296 132 L 1296 148 L 692 148 Z"
              fill="#FF5A36"
              stroke="#1A1A2E"
              strokeWidth="2"
            />
            <text x="708" y="139" fill="#FFFFFF" fontSize="12" fontWeight="800" fontFamily="Bricolage Grotesque, sans-serif">
              SERVIDOR TYPESCRIPT / NODE.JS (:3000) [server.ts + server/]
            </text>
            <rect x="708" y="506" width="572" height="24" rx="6" fill="#FFEAE5" stroke="#1A1A2E" strokeWidth="1.5" />
            <text x="994" y="522" textAnchor="middle" fill="#B42318" fontSize="10.5" fontWeight="700" fontFamily="IBM Plex Sans, sans-serif">
              systemd: server-panel.service (dist/server.cjs) • Todas as rotas /api/* protegidas por requireAdminAuth
            </text>
          </g>

          {/* Grupo 4: Host Ubuntu, Daemons & Fallback Python */}
          <g opacity={activeLayer === 'all' || activeLayer === 'host' ? 1 : 0.45}>
            <rect x="696" y="578" width="604" height="318" rx="12" fill="#1A1A2E" />
            <rect
              x="692"
              y="574"
              width="604"
              height="318"
              rx="12"
              fill="#F2FBF6"
              stroke="#1A1A2E"
              strokeWidth="2.5"
            />
            <path
              d="M 692 586 Q 692 574 704 574 L 1284 574 Q 1296 574 1296 586 L 1296 602 L 692 602 Z"
              fill="#12B76A"
              stroke="#1A1A2E"
              strokeWidth="2"
            />
            <text x="708" y="593" fill="#FFFFFF" fontSize="12" fontWeight="800" fontFamily="Bricolage Grotesque, sans-serif">
              HOST UBUNTU (samuelserver), DAEMONS & FALLBACK PYTHON [backend/]
            </text>
          </g>

          {/* Caixa de Legenda (Inferior Esquerda) */}
          <g>
            <rect x="28" y="804" width="616" height="92" rx="12" fill="#1A1A2E" />
            <rect
              x="24"
              y="800"
              width="616"
              height="92"
              rx="12"
              fill="#FFFFFF"
              stroke="#1A1A2E"
              strokeWidth="2.5"
            />
            <text x="42" y="823" fill="#1A1A2E" fontSize="11.5" fontWeight="800" fontFamily="Bricolage Grotesque, sans-serif">
              LEGENDA & INTERAÇÃO (clique em qualquer bloco para inspecionar rotas e arquivos)
            </text>

            {/* Chips de cores */}
            {[
              { x: 42, color: '#00A6FB', label: 'Dashboard UI' },
              { x: 162, color: '#FFC857', label: 'Serviços Client' },
              { x: 294, color: '#FF5A36', label: 'Servidor Node.js' },
              { x: 434, color: '#12B76A', label: 'Host & Daemons' },
            ].map((item) => (
              <g key={item.label}>
                <rect
                  x={item.x}
                  y="836"
                  width="14"
                  height="14"
                  rx="3"
                  fill={item.color}
                  stroke="#1A1A2E"
                  strokeWidth="1.5"
                />
                <text x={item.x + 20} y="847" fill="#1A1A2E" fontSize="10.5" fontWeight="700" fontFamily="IBM Plex Sans, sans-serif">
                  {item.label}
                </text>
              </g>
            ))}

            {/* Tipos de seta */}
            <line
              x1="42"
              y1="871"
              x2="84"
              y2="871"
              stroke="#1A1A2E"
              strokeWidth="2"
              markerEnd="url(#arrow-dark)"
            />
            <text x="92" y="875" fill="#4A4A68" fontSize="10.5" fontWeight="600" fontFamily="IBM Plex Sans, sans-serif">
              Fluxo principal (HTTP / REST / SSE / WebSocket)
            </text>

            <line
              x1="348"
              y1="871"
              x2="390"
              y2="871"
              stroke="#1A1A2E"
              strokeWidth="2"
              strokeDasharray="5 4"
              markerEnd="url(#arrow-dark)"
            />
            <text x="398" y="875" fill="#4A4A68" fontSize="10.5" fontWeight="600" fontFamily="IBM Plex Sans, sans-serif">
              Fallback opcional / sob demanda / cache
            </text>
          </g>

          {/* Arestas / Conexões */}
          <g>
            {EDGES.map((edge) => {
              const highlighted = isEdgeHighlighted(edge);
              const isSelectedEdge =
                edge.from === selectedNodeId || edge.to === selectedNodeId;
              const isFocusEdge =
                edge.from === focusNodeId || edge.to === focusNodeId;
              const strokeColor = isSelectedEdge ? '#FF5A36' : isFocusEdge ? '#F79009' : '#1A1A2E';
              const opacity =
                activeLayer === 'all'
                  ? isSelectedEdge
                    ? 1
                    : isFocusEdge
                    ? 0.92
                    : 0.45
                  : highlighted
                  ? 0.95
                  : 0.2;

              return (
                <g key={edge.id} opacity={opacity}>
                  <path
                    d={edge.path}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isSelectedEdge ? 2.4 : isFocusEdge ? 2.1 : 1.6}
                    strokeDasharray={edge.dashed ? '5 4' : undefined}
                    strokeLinejoin="round"
                    markerEnd={isSelectedEdge || isFocusEdge ? 'url(#arrow-accent)' : 'url(#arrow-dark)'}
                  />
                  {edge.label && edge.labelX !== undefined && edge.labelY !== undefined && (
                    <g>
                      <rect
                        x={edge.labelX - (edge.label.length * 3.2 + 8)}
                        y={edge.labelY - 9}
                        width={edge.label.length * 6.4 + 16}
                        height={17}
                        rx="4"
                        fill={isSelectedEdge ? '#FFF8E7' : isFocusEdge ? '#FFF8E7' : '#FFFFFF'}
                        stroke={isSelectedEdge ? '#FF5A36' : isFocusEdge ? '#F79009' : '#1A1A2E'}
                        strokeWidth="1.2"
                      />
                      <text
                        x={edge.labelX}
                        y={edge.labelY + 3}
                        textAnchor="middle"
                        fill={isSelectedEdge ? '#B42318' : isFocusEdge ? '#9A3412' : '#1A1A2E'}
                        fontSize="9.5"
                        fontWeight="700"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {edge.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* Nós */}
          <g>
            {NODES.map((node) => {
              const meta = LAYER_META[node.layer];
              const isSelected = node.id === selectedNodeId;
              const highlighted = isNodeHighlighted(node);
              const opacity = highlighted ? 1 : 0.35;

              if (node.kind === 'circle') {
                const cx = node.x + node.w / 2;
                const cy = node.y + node.h / 2;
                const r = node.w / 2;
                const isHovered = hoveredNodeId === node.id;
                return (
                  <g
                    key={node.id}
                    data-node-id={node.id}
                    opacity={opacity}
                    className="cursor-pointer"
                    onClick={() => selectNode(node.id)}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                  >
                    <title>{`${node.label} — ${node.file}\n${node.summary}`}</title>
                    <circle cx={cx + 3} cy={cy + 3} r={r} fill="#1A1A2E" />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={isSelected ? '#FFC857' : isHovered ? '#FFF3D6' : '#FFFFFF'}
                      stroke={isSelected ? '#FF5A36' : isHovered ? '#F79009' : '#1A1A2E'}
                      strokeWidth={isSelected ? 3 : isHovered ? 2.6 : 2.2}
                    />
                    <text
                      x={cx}
                      y={cy - 2}
                      textAnchor="middle"
                      fill="#1A1A2E"
                      fontSize="11.5"
                      fontWeight="800"
                      fontFamily="Bricolage Grotesque, sans-serif"
                    >
                      {node.label}
                    </text>
                    <text
                      x={cx}
                      y={cy + 12}
                      textAnchor="middle"
                      fill="#4A4A68"
                      fontSize="8.8"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {node.file}
                    </text>
                  </g>
                );
              }

              const isHovered = hoveredNodeId === node.id;
              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  opacity={opacity}
                  className="cursor-pointer"
                  onClick={() => selectNode(node.id)}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                >
                  <title>{`${node.label} — ${node.file}\n${node.summary}`}</title>
                  {/* Sombra dura Neo-Brutalista */}
                  <rect
                    x={node.x + 3}
                    y={node.y + 3}
                    width={node.w}
                    height={node.h}
                    rx={node.kind === 'db' ? 14 : 8}
                    fill="#1A1A2E"
                  />
                  {/* Corpo do nó */}
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.w}
                    height={node.h}
                    rx={node.kind === 'db' ? 14 : 8}
                    fill={isSelected ? '#FFFFFF' : isHovered ? '#FFFFFF' : meta.fill}
                    stroke={isSelected ? '#FF5A36' : isHovered ? '#F79009' : '#1A1A2E'}
                    strokeWidth={isSelected ? 3 : isHovered ? 2.6 : 2}
                  />
                  {/* Faixa lateral colorida */}
                  <rect
                    x={node.x + 5}
                    y={node.y + 7}
                    width="4"
                    height={node.h - 14}
                    rx="2"
                    fill={isSelected ? '#FF5A36' : meta.headerFill}
                  />
                  {/* Ícone de banco para DB */}
                  {node.kind === 'db' && (
                    <ellipse
                      cx={node.x + node.w - 18}
                      cy={node.y + 15}
                      rx="8"
                      ry="3.5"
                      fill="#FFFFFF"
                      stroke="#1A1A2E"
                      strokeWidth="1.4"
                    />
                  )}
                  <text
                    x={node.x + 16}
                    y={node.y + (node.h > 70 ? 31 : 27)}
                    fill="#1A1A2E"
                    fontSize="11.5"
                    fontWeight="800"
                    fontFamily="Bricolage Grotesque, sans-serif"
                  >
                    {node.label}
                  </text>
                  <text
                    x={node.x + 16}
                    y={node.y + (node.h > 70 ? 50 : 45)}
                    fill={meta.textColor}
                    fontSize="9.2"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {node.file.length > 34 && node.w < 200
                      ? `${node.file.slice(0, 32)}…`
                      : node.file}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="text-[11px] font-mono text-[#4A4A68] -mt-1">Dica: <b>clique</b> em um bloco para ver a explicação • <b>arraste</b> para mover • segure <kbd className="px-1 py-0.5 border border-[#1A1A2E] rounded bg-white font-bold">Ctrl</kbd> e role o mouse para ampliar/reduzir.</p>

      {/* Painel Inspetor do Bloco Selecionado */}
      <div ref={inspectorRef} className="p-4 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] space-y-3 scroll-mt-4 ring-2 ring-transparent focus-within:ring-[#FF5A36]/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className={`px-2.5 py-1 rounded-md border-2 border-[#1A1A2E] text-[11px] font-bold ${
                LAYER_META[selectedNode.layer].badgeBg
              }`}
            >
              {LAYER_META[selectedNode.layer].name}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-black font-title text-[#1A1A2E]">{selectedNode.label}</h4>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ECFDF3] border border-[#12B76A] text-[10px] font-bold text-[#027A48]"><Info className="w-3 h-3" /> Explicação</span>
            </div>
            <code className="px-2 py-0.5 rounded bg-[#FFF7E8] border border-[#1A1A2E] text-[11px] font-mono font-bold text-[#1A1A2E]">
              {selectedNode.file}
            </code>
          </div>
          {selectedNode.protocols && (
            <span className="text-[11px] font-mono font-bold text-[#026AA2] bg-[#E0F4FE] border border-[#1A1A2E] px-2 py-0.5 rounded">
              {selectedNode.protocols}
            </span>
          )}
        </div>

        <p className="text-xs text-[#1A1A2E] font-medium leading-relaxed flex items-start gap-2">
          <Info className="w-4 h-4 text-[#00A6FB] shrink-0 mt-0.5" />
          <span>{selectedNode.summary}</span>
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] space-y-1.5">
            <span className="font-bold uppercase tracking-wider text-[10px] text-[#4A4A68] block">
              Responsabilidades no código
            </span>
            <ul className="list-disc pl-4 space-y-1 text-[#1A1A2E]">
              {selectedNode.details.map((detail, idx) => (
                <li key={idx}>{detail}</li>
              ))}
            </ul>
          </div>

          <div className="p-3 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] space-y-1.5">
            <span className="font-bold uppercase tracking-wider text-[10px] text-[#4A4A68] block">
              Recebe de ({connectedEdges.incoming.length})
            </span>
            {connectedEdges.incoming.length === 0 ? (
              <p className="text-[#4A4A68] italic">Ponto inicial do fluxo.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {connectedEdges.incoming.map((edge) => {
                  const source = nodeById.get(edge.from);
                  if (!source) return null;
                  return (
                    <button
                      key={edge.id}
                      type="button"
                      onClick={() => setSelectedNodeId(source.id)}
                      className="px-2 py-1 rounded bg-white border border-[#1A1A2E] hover:bg-[#FFC857]/40 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <span>{source.label}</span>
                      {edge.label && (
                        <span className="font-mono text-[10px] text-[#4A4A68]">
                          ({edge.label})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-3 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] space-y-1.5">
            <span className="font-bold uppercase tracking-wider text-[10px] text-[#4A4A68] block">
              Envia / aciona ({connectedEdges.outgoing.length})
            </span>
            {connectedEdges.outgoing.length === 0 ? (
              <p className="text-[#4A4A68] italic">Camada final de execução / persistência.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {connectedEdges.outgoing.map((edge) => {
                  const target = nodeById.get(edge.to);
                  if (!target) return null;
                  return (
                    <button
                      key={edge.id}
                      type="button"
                      onClick={() => setSelectedNodeId(target.id)}
                      className="px-2 py-1 rounded bg-white border border-[#1A1A2E] hover:bg-[#00A6FB]/20 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowRight className="w-3 h-3 text-[#FF5A36]" />
                      <span>{target.label}</span>
                      {edge.label && (
                        <span className="font-mono text-[10px] text-[#4A4A68]">
                          ({edge.label})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Código Mermaid atualizado (colapsável) */}
      <details className="text-xs rounded-xl bg-white border-2 border-[#1A1A2E] p-3">
        <summary className="cursor-pointer font-bold text-[#1A1A2E] flex items-center justify-between gap-2">
          <span>Código Mermaid atualizado (baseado no repositório real)</span>
        </summary>
        <div className="mt-3 space-y-2">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCopyMermaid}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-[#FF5A36] text-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:bg-[#E04522] cursor-pointer"
            >
              {copiedMermaid ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Mermaid</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-3 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] overflow-x-auto text-[11px] font-mono whitespace-pre">
            {MERMAID_SOURCE}
          </pre>
        </div>
      </details>
    </div>
  );
};

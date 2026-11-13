import React, { useState } from 'react';
import {
  Activity, BookOpen, Bot, Check, Copy, Cpu, Folder, GitBranch, Globe, Key, Layers,
  Lock, Monitor, Network, Radio, RotateCcw, ScrollText, Server, Shield, ShieldAlert,
  ShieldCheck, Terminal
} from 'lucide-react';

type DocTab = {
  id: string;
  name: string;
  icon: React.ElementType;
  summary: string;
  purpose: string;
  whatYouCanDo: string[];
  indicators: { label: string; desc: string }[];
  apis: string;
  permissions: string;
  troubleshooting: string;
};

const TABS_DOCUMENTATION: DocTab[] = [
  {
    id: 'overview',
    name: '1. Visão Geral',
    icon: Layers,
    summary: 'Resumo consolidado de saúde do servidor, recursos e status principal.',
    purpose: 'Apresentar rapidamente o estado geral do samuelserver (CPU, memória, disco, rede, serviços e alertas) em uma única tela.',
    whatYouCanDo: [
      'Conferir se o painel/backend está online e há quanto tempo o sistema está ativo.',
      'Visualizar uso atual de CPU, RAM, disco e tráfego/rede.',
      'Identificar rapidamente serviços críticos e sinais de degradação.'
    ],
    indicators: [
      { label: 'Online / Offline', desc: 'Indica se o backend do painel responde às consultas de telemetria.' },
      { label: 'Uso de CPU/RAM/Disco', desc: 'Percentuais atuais de consumo dos principais recursos do host.' },
      { label: 'Uptime', desc: 'Tempo desde a última inicialização do sistema operacional.' }
    ],
    apis: 'Telemetria agregada do backend (ex.: status/saúde, sistema, serviços e rede conforme endpoints disponíveis).',
    permissions: 'Visível para usuários autenticados (admin e operador, conforme política da UI).',
    troubleshooting: 'Se ficar offline, verifique: sudo systemctl status server-panel e sudo journalctl -u server-panel -n 80.'
  },
  {
    id: 'monitoring',
    name: '2. Monitoramento',
    icon: Activity,
    summary: 'Telemetria detalhada de hardware, temperatura, memória e rede.',
    purpose: 'Acompanhar métricas em tempo real e histórico recente para diagnosticar gargalos de desempenho.',
    whatYouCanDo: [
      'Observar variação de CPU, RAM, swap e carga do sistema.',
      'Ver temperatura/sensores (quando disponíveis no hardware).',
      'Acompanhar uso de disco e interfaces de rede.'
    ],
    indicators: [
      { label: 'Load Average', desc: 'Carga média do sistema em janelas de tempo (processos em espera/execução).' },
      { label: 'Memória disponível x usada', desc: 'Disponível considera cache/buffers reaproveitáveis; usada é o consumo efetivo.' },
      { label: 'Temperatura', desc: 'Leitura dos sensores térmicos expostos pelo sistema (se suportado).' }
    ],
    apis: 'Rotas de telemetria do backend/monitor de sistema (status, métricas e sensores expostos pelo painel).',
    permissions: 'Visível para usuários autenticados.',
    troubleshooting: 'Sem dados de temperatura: confirme sensores no host (ex.: lm-sensors) e permissões de leitura.'
  },
  {
    id: 'adguard',
    name: '3. AdGuard Home',
    icon: Shield,
    summary: 'DNS, bloqueios, consultas e painel nativo integrado do AdGuard.',
    purpose: 'Gerenciar e monitorar o AdGuard Home (DNS/bloqueio) e consultar estatísticas/logs/domínios.',
    whatYouCanDo: [
      'Ver status, estatísticas e consultas DNS recentes.',
      'Abrir/ocultar o painel nativo integrado do AdGuard dentro da aba.',
      'Sincronizar/consultar domínios analisados e acionar análises suportadas pela API do painel.'
    ],
    indicators: [
      { label: 'Consultas / Bloqueios', desc: 'Volume de requisições DNS e quantas foram bloqueadas.' },
      { label: 'Top domínios', desc: 'Domínios mais consultados ou bloqueados no período.' },
      { label: 'Upstreams', desc: 'Resolvedores DNS externos configurados e seu comportamento.' }
    ],
    apis: 'GET /api/adguard/status, /api/adguard/stats, /api/adguard/querylog, /api/adguard/domains, POST /api/adguard/analyze, /api/adguard/analyze-batch, /api/adguard/sync, /api/adguard/clear-history (admin), GET/POST /api/adguard/config (admin), proxy /adguard-api/*.',
    permissions: 'Consulta para usuários autenticados; ações administrativas exigem perfil admin.',
    troubleshooting: 'Se indisponível: sudo systemctl status AdGuardHome e teste http://127.0.0.1:8081/. UFW deve permitir 8081/tcp se acesso LAN for necessário.'
  },
  {
    id: 'ping',
    name: '4. Ping / Latência',
    icon: Radio,
    summary: 'Medição de latência e disponibilidade de destinos de rede.',
    purpose: 'Avaliar conectividade e qualidade do enlace com gateway e provedores externos.',
    whatYouCanDo: [
      'Executar/acompanhar medições de latência (RTT) e perda.',
      'Comparar destinos comuns (gateway, DNS públicos, etc.) conforme implementado na aba.'
    ],
    indicators: [
      { label: 'RTT (mín/méd/máx)', desc: 'Tempo de ida e volta das sondas de rede.' },
      { label: 'Perda (%)', desc: 'Percentual de sondas sem resposta no intervalo medido.' }
    ],
    apis: 'GET /api/ping.',
    permissions: 'Visível para usuários autenticados.',
    troubleshooting: 'Perda no gateway pode indicar bloqueio de ICMP/porta no roteador; valide rede local e firewall.'
  },
  {
    id: 'opencode',
    name: '5. Lux e Opencode',
    icon: Bot,
    summary: 'Assistente IA integrado ao servidor via CLI/modelos Opencode.',
    purpose: 'Auxiliar administração, diagnóstico e automações com contexto do host (quando autorizado).',
    whatYouCanDo: [
      'Conversar com o agente e solicitar diagnósticos/comandos orientados.',
      'Listar modelos/sessões e retomar conversas (conforme API).',
      'Acompanhar uso de tokens/sessões.'
    ],
    indicators: [
      { label: 'Modelo ativo', desc: 'Modelo Opencode selecionado para a sessão.' },
      { label: 'Sessões/Tokens', desc: 'Histórico de sessões e consumo reportado pelo backend.' }
    ],
    apis: 'GET /api/opencode/models, /api/opencode/tokens, /api/opencode/sessions, /api/opencode/sessions/:id; POST /api/opencode/sessions/new, /api/opencode/chat; DELETE /api/opencode/sessions/:id (admin).',
    permissions: 'Restrito a administrador.',
    troubleshooting: 'Se falhar, confira OPENCODE_BIN/OPENCODE_MODEL e configuração em /opt/server-panel/.env e server-config.json (não versionados).'
  },
  {
    id: 'browser',
    name: '6. Navegador Remoto',
    icon: Monitor,
    summary: 'Sessão de navegador headless controlada pelo painel (Chromium/Playwright).',
    purpose: 'Permitir navegação/automação remota controlada para tarefas autorizadas no ambiente do servidor.',
    whatYouCanDo: [
      'Iniciar/parar/pausar/retomar sessão e navegar por URL.',
      'Visualizar stream/screenshot e histórico de navegação (conforme UI).',
      'Interagir com páginas quando a sessão estiver ativa.'
    ],
    indicators: [
      { label: 'Status da sessão', desc: 'Running/stopped, URL/título atuais, clientes conectados e FPS/pausa.' },
      { label: 'Timeout/recursos', desc: 'Sessão única e sujeita a limites (ex.: inatividade sem clientes) para economizar recursos.' }
    ],
    apis: 'GET /api/browser/status, /api/browser/screenshot, /api/browser/history; POST /api/browser/start, /api/browser/stop, /api/browser/pause, /api/browser/resume, /api/browser/navigate, /api/browser/ws-ticket (admin).',
    permissions: 'Restrito a administrador.',
    troubleshooting: 'Se não iniciar, valide Chromium/Playwright no host, perfil em /opt/server-panel/data/browser e logs: sudo journalctl -u server-panel -n 120.'
  },
  {
    id: 'files',
    name: '7. Arquivos',
    icon: Folder,
    summary: 'Gerenciador de arquivos do servidor com leitura/edição controlada.',
    purpose: 'Navegar e manipular arquivos de forma administrativa sem SSH direto, dentro das regras de segurança do backend.',
    whatYouCanDo: [
      'Listar diretórios, ler/visualizar arquivos (texto/imagem/raw conforme suporte).',
      'Criar e salvar arquivos quando permitido.'
    ],
    indicators: [
      { label: 'Permissões e tamanho', desc: 'Metadados básicos do item no sistema de arquivos.' },
      { label: 'Tipo', desc: 'Pasta, texto/código, imagem ou binário conforme detecção.' }
    ],
    apis: 'GET /api/files/list, /api/files/read, /api/files/raw; POST /api/files/create, /api/files/save (admin).',
    permissions: 'Restrito a administrador.',
    troubleshooting: 'Falhas de escrita/ leitura geralmente são permissão do usuário do serviço ou caminho inválido/protegido.'
  },
  {
    id: 'security',
    name: '8. Segurança & Ataques',
    icon: ShieldAlert,
    summary: 'Monitoramento de tentativas de acesso, eventos e regras de bloqueio.',
    purpose: 'Auditar atividade suspeita (ex.: SSH/web), classificar risco e apoiar resposta com firewall.',
    whatYouCanDo: [
      'Visualizar eventos/ataques detectados e indicadores de ameaça.',
      'Bloquear/desbloquear IPs e limpar histórico (ações admin, conforme disponível).',
      'Consultar estado relacionado ao UFW/regras.'
    ],
    indicators: [
      { label: 'Nível de ameaça', desc: 'Classificação baseada em eventos recentes detectados.' },
      { label: 'IP/Origem/Motivo', desc: 'Origem geográfica estimada e tipo de tentativa registrada.' }
    ],
    apis: 'GET /api/security, /api/security/status, /api/security/attack-monitor; POST /api/security/block-ip, /api/security/unblock-ip, /api/security/clear-history (admin).',
    permissions: 'Visualização autenticada; ações de bloqueio/limpeza restritas a admin.',
    troubleshooting: 'Confirme UFW ativo (sudo ufw status) e fontes de log; alguns eventos dependem de permissões de leitura do backend.'
  },
  {
    id: 'credentials',
    name: '9. Credenciais & APIs',
    icon: Key,
    summary: 'Configuração de credenciais e integrações do painel.',
    purpose: 'Centralizar parâmetros de autenticação e chaves de integração usadas pelo servidor/painel.',
    whatYouCanDo: [
      'Consultar e atualizar credenciais/configurações suportadas (admin).',
      'Ajustar integrações como AdGuard/n8n/Opencode conforme campos disponíveis.'
    ],
    indicators: [
      { label: 'Estado de configuração', desc: 'Presença/validade aparente das credenciais configuradas.' }
    ],
    apis: 'GET /api/credentials, POST /api/credentials (admin).',
    permissions: 'Restrito a administrador.',
    troubleshooting: 'Alterações persistem em arquivos locais não versionados (ex.: server-config.json/.env). Nunca exponha segredos em commits/logs.'
  },
  {
    id: 'processes',
    name: '10. Processos',
    icon: Cpu,
    summary: 'Lista de processos em execução e consumo de recursos.',
    purpose: 'Identificar processos com alto uso de CPU/RAM e apoiar diagnóstico operacional.',
    whatYouCanDo: [
      'Listar e filtrar processos por nome/usuário/PID.',
      'Ordenar por consumo de recursos (conforme UI).'
    ],
    indicators: [
      { label: 'PID / Usuário', desc: 'Identificador e dono do processo.' },
      { label: 'CPU / Memória', desc: 'Consumo relativo/absoluto reportado pelo sistema.' }
    ],
    apis: 'Monitoramento de processos via backend do painel (consulta em tempo real).',
    permissions: 'Restrito a administrador (conforme sidebar/UI).',
    troubleshooting: 'Dados ausentes podem indicar restrição de leitura em /proc ou falha temporária do coletor.'
  },
  {
    id: 'services',
    name: '11. Serviços',
    icon: ShieldCheck,
    summary: 'Status dos serviços/daemons realmente monitorados neste servidor.',
    purpose: 'Exibir estado operacional dos serviços relevantes instalados no samuelserver.',
    whatYouCanDo: [
      'Ver status (online/offline/erro), boot, porta e infos básicas.',
      'Copiar comandos systemctl de status/restart para uso no terminal.'
    ],
    indicators: [
      { label: 'ONLINE / OFFLINE', desc: 'Estado atual detectado via systemd/porta/processo conforme heurística do monitor.' },
      { label: 'Habilitado no boot', desc: 'Se a unidade está configurada para iniciar automaticamente.' }
    ],
    apis: 'GET de status de serviços via backend (services monitor). Monitorados: OpenSSH (22), AdGuardHome (53,8081), Server Panel (3000), Nginx (80,443), Cron, systemd-resolved (53), UFW, Docker, Tailscale, n8n (5678, container Docker).',
    permissions: 'Restrito a administrador (conforme sidebar/UI).',
    troubleshooting: 'Para investigar: sudo systemctl status <unidade> --no-pager e sudo journalctl -u <unidade> -n 80. n8n roda em Docker (container "n8n").'
  },
  {
    id: 'network',
    name: '12. Rede & MAC',
    icon: Network,
    summary: 'Interfaces, conexões e identificação de fabricantes por MAC.',
    purpose: 'Inspecionar configuração de rede do host e resolver fabricante de endereços MAC.',
    whatYouCanDo: [
      'Ver interfaces/endereços (IPv4/IPv6), gateway e portas/conexões conforme dados disponíveis.',
      'Consultar fabricante via lookup de MAC (OUI).'
    ],
    indicators: [
      { label: 'Interfaces ativas', desc: 'Links e endereços em uso (ex.: wlo1, tailscale0, docker bridges).' },
      { label: 'Fabricante (OUI)', desc: 'Identificação do vendor pelo prefixo do MAC; aleatórios/privados podem não ter vendor.' }
    ],
    apis: 'Telemetria de rede do backend; GET /api/mac-vendor/:mac (consulta externa api.macvendors.com com cache/fallback local, rate-limit ~1 req/s).',
    permissions: 'Acesso conforme política da UI (módulo administrativo).',
    troubleshooting: 'MAC aleatório (locally administered) não possui fabricante público. Em 429 aguarde Retry-After/1s; offline externo usa cache/fallback OUI quando disponível.'
  },
  {
    id: 'logs',
    name: '13. Logs do Sistema',
    icon: ScrollText,
    summary: 'Visualização de logs/journal de componentes do servidor.',
    purpose: 'Apoiar diagnóstico de falhas e auditoria operacional.',
    whatYouCanDo: [
      'Consultar registros recentes por origem/serviço (conforme filtros da UI).',
      'Buscar mensagens e acompanhar eventos em tempo de atualização.'
    ],
    indicators: [
      { label: 'Severidade', desc: 'Nível do evento (info/warn/error) quando fornecido pela fonte.' },
      { label: 'Origem', desc: 'Unidade/serviço que gerou o registro (systemd, nginx, etc.).' }
    ],
    apis: 'Consulta de logs via backend do painel (leitura de journal/fontes configuradas).',
    permissions: 'Restrito a administrador.',
    troubleshooting: 'Se vazio, verifique permissões de leitura do journal e se o serviço/arquivo de log existe.'
  },
  {
    id: 'n8n',
    name: '14. n8n Workflows',
    icon: GitBranch,
    summary: 'Status e controle básico da integração com n8n.',
    purpose: 'Monitorar o n8n (container Docker) e acionar operações suportadas pela API do painel.',
    whatYouCanDo: [
      'Ver status/conectividade e informações do n8n.',
      'Atualizar configuração e alternar estado de workflows (quando suportado).'
    ],
    indicators: [
      { label: 'Online/API conectada', desc: 'Disponibilidade do serviço n8n e validade da chave de API configurada.' },
      { label: 'Workflows', desc: 'Estado/execução conforme dados retornados pela integração.' }
    ],
    apis: 'GET /api/n8n/status; POST /api/n8n/config, POST /api/n8n/workflows/:id/toggle (admin). n8n em http://127.0.0.1:5678 (container Docker "n8n").',
    permissions: 'Restrito a administrador.',
    troubleshooting: 'Confira container: docker ps (n8n Up) e chave API em server-config.json (não versionado).'
  },
  {
    id: 'commands',
    name: '15. Terminal & Shell',
    icon: Terminal,
    summary: 'Execução controlada de comandos no host via allowlist do backend.',
    purpose: 'Permitir operações administrativas rápidas sem expor shell irrestrita.',
    whatYouCanDo: [
      'Executar comandos/predefinições permitidos pela política do servidor.',
      'Visualizar saída/erros retornados pela execução.'
    ],
    indicators: [
      { label: 'Allowlist/Política', desc: 'Apenas comandos autorizados pelo backend podem ser executados.' },
      { label: 'Código de saída', desc: 'Resultado da execução (sucesso/falha) e stdout/stderr.' }
    ],
    apis: 'POST /api/terminal/exec (admin).',
    permissions: 'Exclusivo para administrador.',
    troubleshooting: 'Comando negado = fora da allowlist; falhas podem ser permissão, binário ausente ou timeout.'
  },
  {
    id: 'system',
    name: '16. Sistema',
    icon: Server,
    summary: 'Informações do sistema operacional, host e ambiente.',
    purpose: 'Consultar detalhes do Ubuntu/kernel/host e estado geral do sistema.',
    whatYouCanDo: [
      'Ver versão do SO, kernel, hostname e dados básicos de hardware/ambiente expostos.'
    ],
    indicators: [
      { label: 'OS / Kernel', desc: 'Distribuição e versão do kernel em execução.' },
      { label: 'Hostname', desc: 'Identidade do host na rede (samuelserver).' }
    ],
    apis: 'Informações de sistema expostas pelo backend de telemetria/saúde do painel.',
    permissions: 'Restrito a administrador (conforme sidebar/UI).',
    troubleshooting: 'Dados inconsistentes: reinicie o painel (sudo systemctl restart server-panel) e verifique coletores.'
  },
  {
    id: 'documentation',
    name: '17. Documentação',
    icon: BookOpen,
    summary: 'Manual técnico-operacional do painel e do servidor.',
    purpose: 'Centralizar referência confiável de abas, APIs, acessos, serviços e procedimentos.',
    whatYouCanDo: [
      'Consultar função de cada aba, permissões e pontos de diagnóstico.',
      'Copiar comandos de atualização, verificação e recuperação.'
    ],
    indicators: [
      { label: 'Base de referência', desc: 'Conteúdo estático versionado com o frontend; valide contra o estado real do host quando houver mudanças.' }
    ],
    apis: 'N/A (conteúdo estático no frontend).',
    permissions: 'Disponível para usuários autenticados.',
    troubleshooting: 'Após atualizar o painel, faça hard refresh (Ctrl+F5) para carregar a versão mais recente.'
  }
];

export const DocumentationTab: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('all');
  const [expandedTab, setExpandedTab] = useState<string | null>('overview');

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const updateCmd = 'cd /opt/server-panel && git fetch origin main && git checkout main && git pull origin main && chmod +x deploy-update.sh && ./deploy-update.sh';

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-[#1A1A2E] gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#FF5A36]/15 border-2 border-[#1A1A2E] flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-[#FF5A36]" />
            </div>
            <div>
              <h1 className="text-base font-black font-title">Manual Operacional & Documentação Técnica</h1>
              <p className="text-xs text-[#4A4A68] font-medium">samuelserver • Ubuntu 26.04.1 LTS (kernel 7.0.0) • Nginx • AdGuard Home • Docker/n8n • Tailscale • Opencode</p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-[#FF5A36] bg-[#FFF7E8] border-2 border-[#1A1A2E] px-3 py-1.5 rounded-lg shadow-[2px_2px_0px_#1A1A2E] self-start sm:self-auto">Revisão: 2026-11-12</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap pt-3 text-xs">
          <span className="text-[#4A4A68] font-bold mr-1">Seções:</span>
          {[
            { id: 'all', label: 'Tudo' },
            { id: 'overview', label: 'Visão Geral' },
            { id: 'tabs', label: 'Abas (1-17)' },
            { id: 'ops', label: 'Operação & Recuperação' },
            { id: 'update', label: 'Atualização' }
          ].map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} className={`px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E] font-bold shadow-[2px_2px_0px_#1A1A2E] ${activeSection === s.id ? 'bg-[#FF5A36] text-white' : 'bg-[#FFF7E8] text-[#4A4A68] hover:text-[#1A1A2E]'}`}>{s.label}</button>
          ))}
        </div>
      </div>

      {(activeSection === 'all' || activeSection === 'update') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center justify-between pb-2.5 border-b-2 border-[#1A1A2E] flex-wrap gap-2">
            <div className="flex items-center gap-2"><Terminal className="w-4 h-4 text-[#FF5A36]" /><h2 className="text-xs font-black font-title uppercase tracking-wider">Atualização Segura (backup, build, deploy, health-check, rollback)</h2></div>
            <button onClick={() => copy(updateCmd, 'update')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-bold bg-[#FF5A36] text-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:bg-[#E04522]">
              {copiedKey === 'update' ? <><Check className="w-3.5 h-3.5" /><span>Copiado</span></> : <><Copy className="w-3.5 h-3.5" /><span>Copiar comando</span></>}
            </button>
          </div>
          <p className="text-xs text-[#4A4A68]">Execute em <code className="font-mono font-bold text-[#1A1A2E]">samuelserver</code> como usuário com sudo. O script preserva configs locais (.env/server-config.json), cria backup em <code className="font-mono font-bold text-[#1A1A2E]">/var/backups/server-panel</code>, compila e publica em <code className="font-mono font-bold text-[#1A1A2E]">/var/www/server-panel</code>, valida nginx/API e faz rollback em falha.</p>
          <pre className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs font-mono font-bold overflow-x-auto shadow-[2px_2px_0px_#1A1A2E]">{updateCmd}</pre>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            {[['1. Backup','Snapshot em /var/backups/server-panel e .bak'],['2. Sync & Build','git pull + npm install/build (frontend e dist/server.cjs)'],['3. Publicação','Copia dist para /var/www/server-panel, nginx -t, restart/reload'],['4. Validação','Health-check API e rollback automático em erro']].map(([t,d])=> (
              <div key={t} className="p-3 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E]"><span className="font-bold block">{t}</span><p className="text-[#4A4A68] mt-0.5 font-sans">{d}</p></div>
            ))}
          </div>
        </div>
      )}

      {(activeSection === 'all' || activeSection === 'overview') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]"><Layers className="w-5 h-5 text-[#00A6FB]" /><h2 className="text-xs font-black font-title uppercase tracking-wider">Visão Geral da Arquitetura</h2></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-[#FFF7E8] border-2 border-[#1A1A2E] space-y-2">
              <h3 className="font-bold text-sm flex items-center gap-2"><Server className="w-4 h-4 text-[#FF5A36]" />Stack e execução</h3>
              <p className="text-[#4A4A68] leading-relaxed">Frontend React + Vite (SPA) servido pelo Nginx a partir de <code className="font-mono text-[#1A1A2E]">/var/www/server-panel</code>. Backend Node.js/Express (<code className="font-mono text-[#1A1A2E]">node dist/server.cjs</code>) na porta <b>3000</b>, gerido pelo systemd (<code className="font-mono text-[#1A1A2E]">server-panel.service</code>, usuário root, <code className="font-mono text-[#1A1A2E]">NODE_ENV=production</code>).</p>
            </div>
            <div className="p-4 rounded-xl bg-[#FFF7E8] border-2 border-[#1A1A2E] space-y-2">
              <h3 className="font-bold text-sm flex items-center gap-2"><Network className="w-4 h-4 text-[#12B76A]" />Proxy e integrações</h3>
              <p className="text-[#4A4A68] leading-relaxed">Nginx publica o painel e faz proxy de <code className="font-mono text-[#1A1A2E]">/api/</code>, <code className="font-mono text-[#1A1A2E]">/ws</code>, <code className="font-mono text-[#1A1A2E]">/browser-ws</code> para <code className="font-mono text-[#1A1A2E]">127.0.0.1:3000</code> e <code className="font-mono text-[#1A1A2E]">/adguard-api/</code> para <code className="font-mono text-[#1A1A2E]">127.0.0.1:8081</code>. AdGuard Home em :53/:8081; n8n em container Docker (host :5678).</p>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white border-2 border-[#1A1A2E] space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider">Identidade e conectividade do host</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
              <div className="p-3 rounded-lg bg-[#FFF7E8] border border-[#1A1A2E]"><span className="text-[#4A4A68] text-[10px] block font-bold">Hostname</span><span className="font-bold text-sm">samuelserver</span></div>
              <div className="p-3 rounded-lg bg-[#FFF7E8] border border-[#1A1A2E]"><span className="text-[#4A4A68] text-[10px] block font-bold">IPv4 LAN (wlo1)</span><span className="font-bold text-sm">192.168.100.23/24</span></div>
              <div className="p-3 rounded-lg bg-[#FFF7E8] border border-[#1A1A2E]"><span className="text-[#4A4A68] text-[10px] block font-bold">Tailscale</span><span className="text-[#00A6FB] font-bold text-sm">100.97.208.102</span></div>
              <div className="p-3 rounded-lg bg-[#FFF7E8] border border-[#1A1A2E]"><span className="text-[#4A4A68] text-[10px] block font-bold">SO / Kernel</span><span className="text-[#12B76A] font-bold text-[11px]">Ubuntu 26.04.1 • 7.0.0-43</span></div>
            </div>
            <p className="text-xs text-[#4A4A68]"><b>Serviços monitorados:</b> OpenSSH (22), AdGuard Home (53,8081), Server Panel (3000), Nginx (80,443), Cron, systemd-resolved (53), UFW, Docker, Tailscale, n8n (5678, Docker). Itens não instalados não devem aparecer como ativos.</p>
          </div>
        </div>
      )}

      {(activeSection === 'all' || activeSection === 'tabs') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center justify-between pb-2.5 border-b-2 border-[#1A1A2E] flex-wrap gap-2">
            <div className="flex items-center gap-2"><BookOpen className="w-5 h-5 text-[#FF5A36]" /><h2 className="text-xs font-black font-title uppercase tracking-wider">Manual das Abas (1–17, ordem real do painel)</h2></div>
            <span className="text-xs font-mono font-bold text-[#4A4A68]">Clique para expandir</span>
          </div>
          <div className="space-y-3">
            {TABS_DOCUMENTATION.map((tab) => {
              const Icon = tab.icon; const open = expandedTab === tab.id;
              return (
                <div key={tab.id} className="rounded-xl border-2 border-[#1A1A2E] bg-white overflow-hidden shadow-[2px_2px_0px_#1A1A2E]">
                  <button onClick={() => setExpandedTab(open ? null : tab.id)} className="w-full p-3.5 bg-[#FFF7E8] hover:bg-[#FFEECB] text-left flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md bg-white border border-[#1A1A2E] flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-[#FF5A36]" /></div>
                      <div><span className="font-bold font-title text-sm block">{tab.name}</span><span className="text-xs text-[#4A4A68] font-medium">{tab.summary}</span></div>
                    </div>
                    <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border border-[#1A1A2E]">{open ? 'Recolher ▲' : 'Detalhes ▼'}</span>
                  </button>
                  {open && (
                    <div className="p-4 space-y-3.5 text-xs border-t-2 border-[#1A1A2E]">
                      <div><strong className="text-[#4A4A68] uppercase tracking-wider block mb-1">Finalidade</strong><p className="leading-relaxed bg-[#FFF7E8]/50 p-2.5 rounded-lg border border-[#1A1A2E]/20">{tab.purpose}</p></div>
                      <div><strong className="text-[#4A4A68] uppercase tracking-wider block mb-1">O que você pode fazer</strong><ul className="list-disc pl-5 space-y-1">{tab.whatYouCanDo.map((i, idx) => <li key={idx}>{i}</li>)}</ul></div>
                      <div><strong className="text-[#4A4A68] uppercase tracking-wider block mb-1">Indicadores</strong><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{tab.indicators.map((ind, idx) => (<div key={idx} className="p-2 rounded bg-[#FFF7E8] border border-[#1A1A2E]/30"><span className="font-bold text-[#FF5A36] block">{ind.label}</span><span className="text-[#4A4A68]">{ind.desc}</span></div>))}</div></div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[#1A1A2E]/20 font-mono text-[11px]">
                        <div className="p-2.5 rounded bg-[#E0F2FE] border border-[#00A6FB] text-[#026AA2]"><strong className="block text-[10px] uppercase">APIs / Fonte</strong><span className="text-[#1A1A2E] font-medium break-words">{tab.apis}</span></div>
                        <div className="p-2.5 rounded bg-[#D1FADF] border border-[#12B76A] text-[#027A48]"><strong className="block text-[10px] uppercase">Permissões</strong><span className="text-[#1A1A2E] font-medium">{tab.permissions}</span></div>
                        <div className="p-2.5 rounded bg-[#FEE4E2] border border-[#F04438] text-[#B42318]"><strong className="block text-[10px] uppercase">Diagnóstico</strong><span className="text-[#1A1A2E] font-medium">{tab.troubleshooting}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(activeSection === 'all' || activeSection === 'ops') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]"><Terminal className="w-5 h-5 text-[#12B76A]" /><h2 className="text-xs font-black font-title uppercase tracking-wider">Operação & Recuperação</h2></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs font-mono">
            <div className="p-4 rounded-xl border-2 border-[#1A1A2E] space-y-2"><span className="font-bold text-sm font-sans flex items-center gap-1.5"><Shield className="w-4 h-4 text-[#FF5A36]" />AdGuard Home</span><pre className="p-2.5 rounded bg-[#FFF7E8] border border-[#1A1A2E] text-[11px] overflow-x-auto">{`sudo systemctl status AdGuardHome --no-pager\nsudo systemctl restart AdGuardHome\ncurl -I http://127.0.0.1:8081/`}</pre></div>
            <div className="p-4 rounded-xl border-2 border-[#1A1A2E] space-y-2"><span className="font-bold text-sm font-sans flex items-center gap-1.5"><Globe className="w-4 h-4 text-[#00A6FB]" />Nginx & Painel</span><pre className="p-2.5 rounded bg-[#FFF7E8] border border-[#1A1A2E] text-[11px] overflow-x-auto">{`sudo nginx -t && sudo systemctl reload nginx\nsudo systemctl status server-panel --no-pager\ncurl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:3000/api/health`}</pre></div>
            <div className="p-4 rounded-xl border-2 border-[#1A1A2E] space-y-2"><span className="font-bold text-sm font-sans flex items-center gap-1.5"><GitBranch className="w-4 h-4 text-[#F79009]" />n8n (Docker)</span><pre className="p-2.5 rounded bg-[#FFF7E8] border border-[#1A1A2E] text-[11px] overflow-x-auto">{`docker ps --filter name=n8n\ncd /home/samuel/n8n && docker compose ps\n# reinício: docker compose restart n8n`}</pre></div>
            <div className="p-4 rounded-xl border-2 border-[#1A1A2E] space-y-2"><span className="font-bold text-sm font-sans flex items-center gap-1.5"><RotateCcw className="w-4 h-4 text-[#F04438]" />Deploy manual / rollback</span><pre className="p-2.5 rounded bg-[#FFF7E8] border border-[#1A1A2E] text-[11px] overflow-x-auto">{`# publicar dist já compilada\nsudo cp -a dist/. /var/www/server-panel/ && sudo chown -R www-data:www-data /var/www/server-panel\nsudo nginx -t && sudo systemctl restart server-panel && sudo systemctl reload nginx\n# rollback: restaurar backup em /var/backups/server-panel`}</pre></div>
          </div>
          <div className="p-3 rounded-lg bg-[#FEF0C7] border-2 border-[#F79009] text-xs text-[#7A2E0E] flex gap-2"><Lock className="w-4 h-4 shrink-0 mt-0.5" /><p><b>Segurança:</b> <code className="font-mono">.env</code> e <code className="font-mono">server-config.json</code> contêm segredos e não devem ser commitados. Não exponha senhas/tokens/cookies em logs. Acesso SSH: usuário <code className="font-mono">samuel</code> (LAN 192.168.100.23, Tailscale 100.97.208.102).</p></div>
        </div>
      )}
    </div>
  );
};

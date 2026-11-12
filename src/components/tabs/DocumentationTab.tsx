import React, { useState } from 'react';
import { 
  BookOpen, 
  Terminal, 
  Globe, 
  Server, 
  Shield, 
  Network, 
  Cpu, 
  Copy, 
  Check, 
  Layers, 
  Workflow, 
  Lock,
  ExternalLink,
  ChevronRight,
  Info,
  Activity,
  Radio,
  Bot,
  Folder,
  ShieldAlert,
  Key,
  ScrollText,
  GitBranch,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Zap,
  HelpCircle,
  Clock
} from 'lucide-react';
import { SERVER_IPV4, SERVER_IPV6, SSH_USER, getDynamicSshCommand } from '../../config';

export const DocumentationTab: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('all');
  const [expandedTab, setExpandedTab] = useState<string | null>('overview');

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const dynamicIpv6Ssh = getDynamicSshCommand(SERVER_IPV6);

  const TABS_DOCUMENTATION = [
    {
      id: 'overview',
      name: '1. Visão Geral',
      icon: Layers,
      summary: 'Dashboard consolidado de telemetria, integridade de serviços e métricas vitais.',
      purpose: 'Apresentar em uma única tela o pulso em tempo real do Ubuntu Server, consolidando status de CPU, RAM, disco, rede, segurança e uptime.',
      whatYouCanDo: [
        'Visualizar medidores rápidos de saúde (CPU, RAM, disco raiz e rede).',
        'Conferir o resumo de serviços críticos (Nginx, AdGuard, Docker, SSH, Tailscale).',
        'Checar conexões ativas e histórico recente de tráfego de dados.'
      ],
      indicators: [
        { label: 'Servidor Online / Offline', desc: 'Indica se o backend Node.js está respondendo ao polling HTTP/WebSocket.' },
        { label: 'Uptime', desc: 'Tempo contínuo em dias/horas desde a última reinicialização do kernel do Ubuntu.' },
        { label: 'Carga da CPU (Load Average)', desc: 'Média de processos aguardando tempo de execução nos últimos 1, 5 e 15 minutos.' }
      ],
      apis: 'GET /api/server, GET /api/status, GET /api/services/status',
      permissions: 'Disponível para usuários comuns e administradores.',
      troubleshooting: 'Se a tela exibir "Desconectado", verifique se o serviço server-panel está ativo via: sudo systemctl status server-panel.'
    },
    {
      id: 'monitoring',
      name: '2. Monitoramento',
      icon: Activity,
      summary: 'Telemetria profunda de hardware, sensores de temperatura de núcleos e partições.',
      purpose: 'Acompanhar curvas históricas de consumo de recursos físicos, uso detalhado de memória (disponível, livre, cache/buffers e swap) e saúde térmica.',
      whatYouCanDo: [
        'Acompanhar oscilação de CPU e RAM nos últimos 60 segundos com sparklines.',
        'Auditar temperatura por núcleo com sensores Intel Core i5 (Package, Core 0 a 5).',
        'Verificar taxa de transferência de download e upload por interface de rede ativa.'
      ],
      indicators: [
        { label: 'Disponível vs Livre', desc: 'Disponível é a memória real que novos processos podem alocar; Livre é a RAM intocada.' },
        { label: 'Cache e Buffers', desc: 'RAM utilizada pelo kernel Linux para acelerar leitura de disco, liberada dinamicamente quando requisitada.' },
        { label: 'Swap', desc: 'Espaço em disco reservado para paginação virtual de memória.' }
      ],
      apis: 'GET /api/server (parse direto de /proc/meminfo e /sys/class/thermal)',
      permissions: 'Público/Operador.',
      troubleshooting: 'Temperaturas acima de 75°C geram alerta automático. Verifique poeira ou rotação de cooler do processador.'
    },
    {
      id: 'adguard',
      name: '3. AdGuard Home',
      icon: Shield,
      summary: 'Central de controle de DNS, bloqueio de telemetria e dossiê com inteligência artificial.',
      purpose: 'Proteger toda a rede doméstica contra anúncios, rastreadores e malwares, resolvendo DNS localmente na porta 53.',
      whatYouCanDo: [
        'Verificar consultas totais, permitidas e bloqueadas em 24h ou 2h com tooltip sincronizado.',
        'Consultar servidores upstream ativos (Cloudflare DNS, Quad9, Google) e seus tempos de resposta.',
        'Ativar Dossiê Inteligente com IA Opencode para explicar a finalidade de qualquer domínio bloqueado.'
      ],
      indicators: [
        { label: 'Taxa de Bloqueio (%)', desc: 'Percentual de requisições de DNS que foram retidas por listas de bloqueio.' },
        { label: 'Upstream Latency', desc: 'Tempo em milissegundos que os provedores DNS externos levam para responder ao servidor.' }
      ],
      apis: 'Proxy reverso local em http://127.0.0.1:8081/control (rotas /stats, /querylog, /status)',
      permissions: 'Operador visualiza consultas; Administrador limpa histórico e configura regras.',
      troubleshooting: 'Se o AdGuard estiver inativo, execute: sudo systemctl restart AdGuardHome. Cheque logs em /opt/AdGuardHome/data/AdGuardHome.yaml.'
    },
    {
      id: 'ping',
      name: '4. Ping / Latência',
      icon: Radio,
      summary: 'Medição contínua de latência (RTT) e perda de pacotes via socket e ICMP.',
      purpose: 'Monitorar a qualidade da conexão com o gateway local e os maiores backbones da internet sem consumir recursos pesados.',
      whatYouCanDo: [
        'Acompanhar oscilação de latência em tempo real com gráfico SVG contínuo.',
        'Auditar múltiplos destinos: Cloudflare (1.1.1.1), Google (8.8.8.8), Quad9 (9.9.9.9), NIC.br e Gateway (192.168.100.1).',
        'Identificar perda de pacotes e diferenciar latência elevada de indisponibilidade de rota.'
      ],
      indicators: [
        { label: 'Mín / Média / Máx', desc: 'Distribuição estatística das últimas 25 amostras de ida e volta (RTT).' },
        { label: 'Taxa de Descarte (%)', desc: 'Percentual de falhas completas de comunicação nas amostras coletadas.' }
      ],
      apis: 'GET /api/ping (camada híbrida TCP/IP + fallback ICMP /bin/ping)',
      permissions: 'Público/Operador.',
      troubleshooting: 'Se o gateway local aparecer como inativo, confirme se o roteador aceita ICMP ping ou responde na porta 53/80.'
    },
    {
      id: 'opencode',
      name: '5. Opencode & IA (Ubuntu)',
      icon: Bot,
      summary: 'Agente inteligente oficial do Ubuntu Server impulsionado pela CLI local do opencode.',
      purpose: 'Auxiliar na administração, geração de scripts e diagnóstico avançado do host samuelserver com raciocínio DevOps.',
      whatYouCanDo: [
        'Conversar com o Opencode sobre diagnósticos de rede, firewall, Nginx e automações.',
        'Acompanhar cota de tokens consumidos, histórico diário e limites de requisição por minuto (RPM/TPM).',
        'Salvar e alternar entre múltiplas sessões de auditoria com histórico persistido em disco.'
      ],
      indicators: [
        { label: 'Tokens Usados Hoje', desc: 'Total acumulado de tokens de entrada e saída consumidos na data atual.' },
        { label: 'Quota Diária', desc: 'Percentual de uso da quota de tokens processados pelo agente opencode.' }
      ],
      apis: 'POST /api/opencode/chat, GET /api/opencode/tokens, GET /api/opencode/sessions',
      permissions: 'Restrito para Administradores.',
      troubleshooting: 'Certifique-se de configurar OPENCODE_BIN e OPENCODE_MODEL no arquivo /opt/server-panel/.env para ativar o agente em produção.'
    },
    {
      id: 'files',
      name: '6. Gerenciador de Arquivos',
      icon: Folder,
      summary: 'Navegação segura na árvore de diretórios do Ubuntu, editor de texto e visualizador de imagens.',
      purpose: 'Permitir inspeção, criação e edição rápida de arquivos de configuração sem exigir conexão SSH com nano/vim.',
      whatYouCanDo: [
        'Navegar por pastas do sistema, inclusive links simbólicos (/lib, /bin, /sbin).',
        'Visualizar fotos e imagens em modo nativo.',
        'Criar novos arquivos de texto/bloco de notas e salvar alterações diretamente no servidor.'
      ],
      indicators: [
        { label: 'Permissões (rwxr-xr-x)', desc: 'Privilégios de leitura, escrita e execução do usuário do sistema.' },
        { label: 'Bloqueio de Path Traversal', desc: 'Proteção de segurança que bloqueia acesso a arquivos confidenciais (/etc/shadow).' }
      ],
      apis: 'GET /api/files/list, GET /api/files/read, POST /api/files/create, POST /api/files/save',
      permissions: 'Restrito para Administradores autenticados com token Bearer.',
      troubleshooting: 'Caso não consiga salvar um arquivo, verifique se o usuário do processo tem permissão de escrita no diretório alvo.'
    },
    {
      id: 'security',
      name: '7. Segurança & Ataques',
      icon: ShieldAlert,
      summary: 'Auditoria de força bruta SSH, varreduras web e gerenciamento do firewall UFW.',
      purpose: 'Detectar e neutralizar invasores externos, diferenciando acessos locais legítimos de ataques maliciosos de força bruta.',
      whatYouCanDo: [
        'Visualizar IPs hostis com geolocalização GeoIP (País, Cidade, Provedor e Bandeira).',
        'Identificar o motivo do erro (Senha Incorreta vs Usuário Inexistente vs Scan HTTP).',
        'Banir ou desbanir IPs hostis no firewall UFW com 1 clique e limpar o histórico de auditoria.'
      ],
      indicators: [
        { label: 'Nível de Ameaça (Normal / Moderado / Sob Ataque)', desc: 'Classificação calculada baseada em ameaças externas reais.' },
        { label: 'Regras do UFW', desc: 'Listagem numerada de regras de firewall ativas em tempo real no kernel do Ubuntu.' }
      ],
      apis: 'GET /api/security/attack-monitor, POST /api/security/block-ip, POST /api/security/unblock-ip, POST /api/security/clear-history',
      permissions: 'Restrito para Administradores.',
      troubleshooting: 'Para inspecionar regras diretamente no terminal, execute: sudo ufw status numbered.'
    },
    {
      id: 'credentials',
      name: '8. Credenciais & APIs',
      icon: Key,
      summary: 'Central de chaves de API, variáveis de ambiente e gerenciamento de senhas de acesso.',
      purpose: 'Centralizar e atualizar parâmetros de conexão (AdGuard, n8n, Opencode) e senhas do painel sem editar arquivos manualmente.',
      whatYouCanDo: [
        'Alterar as credenciais de login do Administrador e Operador.',
        'Configurar credenciais da API do AdGuard Home e tokens do n8n.',
        'Cadastrar variáveis de ambiente personalizadas armazenadas com segurança.'
      ],
      indicators: [
        { label: 'Cofre Protegido', desc: 'Camada de proteção que exige senha mestra para revelar segredos na tela.' }
      ],
      apis: 'GET /api/credentials, POST /api/credentials',
      permissions: 'Exclusivo para Administrador.',
      troubleshooting: 'As credenciais alteradas são gravadas no arquivo server-config.json e no ambiente local.'
    },
    {
      id: 'processes',
      name: '9. Processos',
      icon: Cpu,
      summary: 'Inspetor de processos em tempo real do kernel Linux com PID, consumo de CPU e memória.',
      purpose: 'Identificar gargalos de processamento, processos zumbis ou serviços consumindo recursos excessivos.',
      whatYouCanDo: [
        'Filtrar processos por nome, usuário ou comando.',
        'Ordenar por maior consumo de CPU ou memória RAM.',
        'Finalizar processos com sinal SIGTERM/SIGKILL (botão de encerramento).'
      ],
      indicators: [
        { label: 'PID', desc: 'Identificador único do processo no sistema operacional.' },
        { label: 'Estado (R, S, Z)', desc: 'R (Executando), S (Dormindo/Aguardando), Z (Zumbi).' }
      ],
      apis: 'GET /api/processes, POST /api/processes/kill',
      permissions: 'Restrito para Administrador.',
      troubleshooting: 'Tenha cautela ao finalizar processos do sistema como sshd, systemd-journald ou nginx.'
    },
    {
      id: 'services',
      name: '10. Serviços',
      icon: ShieldCheck,
      summary: 'Painel de controle do systemd para daemons e serviços do Ubuntu.',
      purpose: 'Verificar status de execução, reiniciar, iniciar ou parar serviços essenciais de infraestrutura.',
      whatYouCanDo: [
        'Conferir o estado real de serviços: Nginx, AdGuard Home, Docker, OpenSSH, Tailscale, Fail2Ban, Server Panel.',
        'Reiniciar ou parar serviços diretamente pelo painel.',
        'Copiar comandos canônicos do systemctl com 1 clique.'
      ],
      indicators: [
        { label: 'Ativo (Running)', desc: 'O serviço está em execução normal no systemd.' },
        { label: 'Inativo (Dead/Exited)', desc: 'O serviço está parado ou foi desabilitado intencionalmente.' }
      ],
      apis: 'GET /api/services/status, POST /api/services/action',
      permissions: 'Restrito para Administradores.',
      troubleshooting: 'Se um serviço falhar ao iniciar, consulte seus logs com: sudo journalctl -u NOME_DO_SERVICO -n 50.'
    },
    {
      id: 'network',
      name: '11. Rede & MAC',
      icon: Network,
      summary: 'Auditoria de interfaces físicas e virtuais, endereçamento IPv4/IPv6 e tabela ARP.',
      purpose: 'Mapear todos os dispositivos conectados à rede local, interfaces ativas e portas de escuta.',
      whatYouCanDo: [
        'Inspecionar IPs locais, máscaras de sub-rede, gateway e endereços MAC.',
        'Consultar tabela ARP com identificação de fabricantes de dispositivos na LAN.',
        'Verificar portas TCP/UDP em escuta (LISTEN) no servidor.'
      ],
      indicators: [
        { label: 'Dual-Stack IPv4/IPv6', desc: 'Indica disponibilidade simultânea de IPv4 estático e IPv6 global.' },
        { label: 'Interface UP/DOWN', desc: 'Estado físico do link de rede ethernet ou Wi-Fi.' }
      ],
      apis: 'GET /api/network, GET /api/network/interfaces',
      permissions: 'Público/Operador.',
      troubleshooting: 'O endereço IPv6 global é dinâmico e sincronizado automaticamente pela interface wlo1.'
    },
    {
      id: 'logs',
      name: '12. Logs do Sistema',
      icon: ScrollText,
      summary: 'Visualizador unificado de logs do journald, Nginx, autenticação e kernel.',
      purpose: 'Acelerar a investigação de falhas de software, erros de proxy e eventos de segurança.',
      whatYouCanDo: [
        'Filtrar logs por serviço específico (Nginx, SSH, AdGuard, Kernel, Server Panel).',
        'Pesquisar por palavras-chave com busca em tempo real.',
        'Exportar e copiar registros de log selecionados.'
      ],
      indicators: [
        { label: 'Severidade (Info, Warning, Error)', desc: 'Classificação do nível de criticidade da mensagem registrada.' }
      ],
      apis: 'GET /api/logs/query',
      permissions: 'Restrito para Administradores.',
      troubleshooting: 'Para visualizar logs brutos contínuos no terminal: sudo journalctl -f.'
    },
    {
      id: 'n8n',
      name: '13. n8n Workflows',
      icon: GitBranch,
      summary: 'Integração com a plataforma de automação de fluxos de trabalho e webhooks.',
      purpose: 'Supervisionar execuções de automações, alertas de infraestrutura e rotinas agendadas.',
      whatYouCanDo: [
        'Conferir status do serviço n8n local na porta 5678.',
        'Monitorar workflows ativos e taxas de sucesso/falha de execução.',
        'Acessar diretamente o editor visual do n8n.'
      ],
      indicators: [
        { label: 'Workflow Ativo', desc: 'Fluxo em execução aguardando gatilhos ou cron schedules.' }
      ],
      apis: 'GET /api/n8n/status, GET /api/n8n/workflows',
      permissions: 'Restrito para Administradores.',
      troubleshooting: 'Se o n8n estiver offline, execute: sudo systemctl start n8n ou verifique seu contêiner Docker.'
    },
    {
      id: 'commands',
      name: '14. Terminal & Shell',
      icon: Terminal,
      summary: 'Console interativo para execução segura de comandos administrativos no Ubuntu.',
      purpose: 'Executar tarefas de manutenção sem necessidade de abrir um cliente SSH externo.',
      whatYouCanDo: [
        'Executar diagnósticos rápidos pré-formatados com 1 clique.',
        'Digitar comandos manuais no terminal embutido com suporte a histórico.',
        'Acompanhar a saída completa (stdout/stderr) em tempo real.'
      ],
      indicators: [
        { label: 'Allowlist Policy', desc: 'Camada de proteção que bloqueia comandos destrutivos não autorizados.' }
      ],
      apis: 'POST /api/terminal/exec',
      permissions: 'Exclusivo para Administrador autenticado.',
      troubleshooting: 'Comandos de longa duração possuem timeout de segurança de 30 segundos.'
    },
    {
      id: 'system',
      name: '15. Sistema',
      icon: Server,
      summary: 'Informações de distribuição Linux, kernel, arquitetura e controle de energia.',
      purpose: 'Consultar detalhes de release do sistema operacional e executar ações de reboot/shutdown quando necessário.',
      whatYouCanDo: [
        'Visualizar versão detalhada do Ubuntu 24.04 LTS e versão do kernel Linux.',
        'Conferir hostname oficial, arquitetura x86_64 e tipo de virtualização/bare-metal.',
        'Executar reinicialização controlada do host.'
      ],
      indicators: [
        { label: 'Kernel Version', desc: 'Versão do núcleo Linux em execução.' },
        { label: 'Hostname', desc: 'Nome de rede da máquina (samuelserver).' }
      ],
      apis: 'GET /api/system/info, POST /api/system/reboot',
      permissions: 'Restrito para Administradores.',
      troubleshooting: 'Após reiniciar o servidor, o painel restabelece a conexão automaticamente em ~45 segundos.'
    },
    {
      id: 'documentation',
      name: '16. Documentação',
      icon: BookOpen,
      summary: 'Manual operacional completo de infraestrutura, arquitetura e procedimentos de recuperação.',
      purpose: 'Servir como fonte definitiva de consulta técnica para operar, atualizar e recuperar o servidor doméstico.',
      whatYouCanDo: [
        'Copiar comandos operacionais em linha única com backup automático.',
        'Consultar o manual específico de cada uma das 16 abas do sistema.',
        'Seguir guias de resolução passo a passo para emergências e incidentes.'
      ],
      indicators: [
        { label: 'Versão de Infraestrutura', desc: 'Versão do pacote de scripts e automações em vigor.' }
      ],
      apis: 'Integrada estaticamente no frontend.',
      permissions: 'Acessível para todos os perfis.',
      troubleshooting: 'Mantenha este manual atualizado sempre que novas integrações forem adicionadas.'
    }
  ];

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* Top Banner Neo-brutalist */}
      <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-[#1A1A2E] gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#FF5A36]/15 border-2 border-[#1A1A2E] flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-[#FF5A36]" />
            </div>
            <div>
              <h1 className="text-base font-black text-[#1A1A2E] font-title">
                Manual Operacional & Documentação Técnica do Sistema
              </h1>
              <p className="text-xs text-[#4A4A68] font-medium">
                Ubuntu Server 24.04 LTS (samuelserver) • Nginx • AdGuard Home • Tailscale • Opencode AI
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-[#FF5A36] bg-[#FFF7E8] border-2 border-[#1A1A2E] px-3 py-1.5 rounded-lg shadow-[2px_2px_0px_#1A1A2E] self-start sm:self-auto">
            Versão v2.6 (Dual-Stack & Opencode AI)
          </span>
        </div>

        {/* Navegação Rápida de Seções */}
        <div className="flex items-center gap-2 flex-wrap pt-3 text-xs">
          <span className="text-[#4A4A68] font-bold mr-1 text-xs">Seções:</span>
          {[
            { id: 'all', label: 'Tudo' },
            { id: 'overview', label: '1. Visão Geral da Arquitetura' },
            { id: 'tabs', label: '2. Manual das 16 Abas' },
            { id: 'ops', label: '3. Procedimentos Operacionais' },
            { id: 'update', label: '⚡ Script de Atualização' }
          ].map(sec => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E] transition text-xs font-bold shadow-[2px_2px_0px_#1A1A2E] ${
                activeSection === sec.id 
                  ? 'bg-[#FF5A36] text-white' 
                  : 'bg-[#FFF7E8] text-[#4A4A68] hover:text-[#1A1A2E]'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>
      </div>

      {/* SCRIPT DE ATUALIZAÇÃO SEGURA (DESTAQUE PRIORITÁRIO) */}
      {(activeSection === 'all' || activeSection === 'update') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center justify-between pb-2.5 border-b-2 border-[#1A1A2E] flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#FF5A36]" />
              <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
                Procedimento de Atualização Segura do Painel (com Backup & Rollback)
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => copyToClipboard(`cd /opt/server-panel && git fetch origin main && git checkout main && git pull origin main && chmod +x deploy-update.sh && ./deploy-update.sh`, 'update-script')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-bold bg-[#FF5A36] text-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:bg-[#E04522] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
                title="Copiar comando em linha única para o shell"
              >
                {copiedKey === 'update-script' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>Copiado com Sucesso!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Comando em Linha Única</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="text-xs text-[#4A4A68] font-medium leading-relaxed">
            Execute o script em linha única abaixo no terminal do Ubuntu (<code className="text-[#1A1A2E] font-mono font-bold">samuelserver</code>). Ele realiza: (1) salvaguarda de configurações locais; (2) backup automático timestamped em <code className="text-[#1A1A2E] font-mono font-bold">/var/backups/server-panel</code>; (3) sincronização via git pull; (4) compilação de produção com Vite/esbuild; (5) rollback automático em caso de qualquer falha; (6) reload sem queda no Nginx e validação por health check.
          </p>

          <div className="relative">
            <pre className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs text-[#1A1A2E] font-mono font-bold overflow-x-auto shadow-[2px_2px_0px_#1A1A2E] leading-relaxed selection:bg-[#FFEECB]">
{`cd /opt/server-panel && git fetch origin main && git checkout main && git pull origin main && chmod +x deploy-update.sh && ./deploy-update.sh`}
            </pre>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-[#D1FADF] border-2 border-[#12B76A] text-[#12B76A] font-bold">
              <span>1. Backup Preventivo</span>
              <p className="text-xs text-[#1A1A2E] font-normal font-sans mt-0.5">Cria snapshot em /var/backups antes de tocar nos arquivos.</p>
            </div>
            <div className="p-3 rounded-lg bg-[#E0F2FE] border-2 border-[#00A6FB] text-[#026AA2] font-bold">
              <span>2. Git Pull & Build</span>
              <p className="text-xs text-[#1A1A2E] font-normal font-sans mt-0.5">Sincroniza o repositório e compila frontend e backend.</p>
            </div>
            <div className="p-3 rounded-lg bg-[#FEF0C7] border-2 border-[#F79009] text-[#B54708] font-bold">
              <span>3. Deploy Nginx</span>
              <p className="text-xs text-[#1A1A2E] font-normal font-sans mt-0.5">Substitui arquivos em /var/www/server-panel como www-data.</p>
            </div>
            <div className="p-3 rounded-lg bg-[#FEE4E2] border-2 border-[#F04438] text-[#D92D20] font-bold">
              <span>4. Rollback Automático</span>
              <p className="text-xs text-[#1A1A2E] font-normal font-sans mt-0.5">Restaura a versão anterior caso o build ou API falhem.</p>
            </div>
          </div>
        </div>
      )}

      {/* SEÇÃO 1: VISÃO GERAL DA ARQUITETURA */}
      {(activeSection === 'all' || activeSection === 'overview') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
            <Layers className="w-5 h-5 text-[#00A6FB]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              1. Visão Geral da Arquitetura do Sistema
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-[#FFF7E8] border-2 border-[#1A1A2E] space-y-2">
              <h3 className="font-bold text-sm text-[#1A1A2E] flex items-center gap-2">
                <Server className="w-4 h-4 text-[#FF5A36]" />
                O que é o Ubuntu Server Panel?
              </h3>
              <p className="text-[#4A4A68] leading-relaxed">
                É um painel operacional completo e soberano desenvolvido especificamente para o servidor doméstico <code className="font-bold text-[#1A1A2E]">samuelserver</code>. Ele resolve o problema de fragmentação administrativa, unificando em uma única interface responsiva a telemetria do sistema, o bloqueador de DNS AdGuard Home, o firewall UFW, o terminal, o explorador de arquivos e o agente inteligente Opencode.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#FFF7E8] border-2 border-[#1A1A2E] space-y-2">
              <h3 className="font-bold text-sm text-[#1A1A2E] flex items-center gap-2">
                <Network className="w-4 h-4 text-[#12B76A]" />
                Comunicação Frontend & Backend
              </h3>
              <p className="text-[#4A4A68] leading-relaxed">
                O frontend é uma SPA React moderna com Vite e Tailwind CSS, servida pelo Nginx. O backend é um serviço Node.js Express rodando na porta local 3000 (<code className="font-bold text-[#1A1A2E]">server.cjs</code>). As requisições à API (<code className="font-bold text-[#1A1A2E]">/api/*</code>) são protegidas por autenticação via headers e consultam diretamente arquivos do kernel (<code className="font-mono">/proc/meminfo</code>, <code className="font-mono">journalctl</code>, <code className="font-mono">ufw</code>).
              </p>
            </div>
          </div>

          {/* Dados de Identificação do Host */}
          <div className="p-4 rounded-xl bg-white border-2 border-[#1A1A2E] space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A1A2E]">
              Identificação de Conectividade do Servidor
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
              <div className="p-3 rounded-lg bg-[#FFF7E8] border border-[#1A1A2E]">
                <span className="text-[#4A4A68] text-[10px] block font-bold">IPv4 Wi-Fi (LAN Doméstica)</span>
                <span className="text-[#1A1A2E] font-bold text-sm">192.168.100.23</span>
              </div>
              <div className="p-3 rounded-lg bg-[#FFF7E8] border border-[#1A1A2E]">
                <span className="text-[#4A4A68] text-[10px] block font-bold">Tailscale IP (VPN Global)</span>
                <span className="text-[#00A6FB] font-bold text-sm">100.97.208.102</span>
              </div>
              <div className="p-3 rounded-lg bg-[#FFF7E8] border border-[#1A1A2E]">
                <span className="text-[#4A4A68] text-[10px] block font-bold">Usuário Administrativo</span>
                <span className="text-[#12B76A] font-bold text-sm">samuel (sudoer)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEÇÃO 2: DOCUMENTAÇÃO INDIVIDUAL DAS 16 ABAS */}
      {(activeSection === 'all' || activeSection === 'tabs') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center justify-between pb-2.5 border-b-2 border-[#1A1A2E] flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#FF5A36]" />
              <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
                2. Manual Individual das 16 Abas do Painel
              </h2>
            </div>
            <span className="text-xs font-mono font-bold text-[#4A4A68]">
              Clique em qualquer aba para expandir os detalhes
            </span>
          </div>

          <div className="space-y-3">
            {TABS_DOCUMENTATION.map((tab) => {
              const Icon = tab.icon;
              const isExpanded = expandedTab === tab.id;

              return (
                <div 
                  key={tab.id}
                  className="rounded-xl border-2 border-[#1A1A2E] bg-white overflow-hidden shadow-[2px_2px_0px_#1A1A2E] transition"
                >
                  <button
                    onClick={() => setExpandedTab(isExpanded ? null : tab.id)}
                    className="w-full p-3.5 bg-[#FFF7E8] hover:bg-[#FFEECB] text-left flex items-center justify-between gap-3 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md bg-white border border-[#1A1A2E] flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-[#FF5A36]" />
                      </div>
                      <div>
                        <span className="font-bold font-title text-sm text-[#1A1A2E] block">{tab.name}</span>
                        <span className="text-xs text-[#4A4A68] font-medium">{tab.summary}</span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#1A1A2E] bg-white px-2 py-1 rounded border border-[#1A1A2E]">
                      {isExpanded ? 'Recolher ▲' : 'Ver Detalhes ▼'}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="p-4 space-y-3.5 text-xs text-[#1A1A2E] bg-white border-t-2 border-[#1A1A2E]">
                      {/* Finalidade */}
                      <div>
                        <strong className="text-xs font-bold text-[#4A4A68] uppercase tracking-wider block mb-1">
                          Finalidade do Módulo:
                        </strong>
                        <p className="text-[#1A1A2E] leading-relaxed bg-[#FFF7E8]/50 p-2.5 rounded-lg border border-[#1A1A2E]/20">
                          {tab.purpose}
                        </p>
                      </div>

                      {/* O que você consegue fazer */}
                      <div>
                        <strong className="text-xs font-bold text-[#4A4A68] uppercase tracking-wider block mb-1">
                          Ações e Recursos Disponíveis:
                        </strong>
                        <ul className="list-disc pl-5 space-y-1 text-[#1A1A2E]">
                          {tab.whatYouCanDo.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>

                      {/* Indicadores */}
                      <div>
                        <strong className="text-xs font-bold text-[#4A4A68] uppercase tracking-wider block mb-1">
                          Significado dos Indicadores:
                        </strong>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {tab.indicators.map((ind, idx) => (
                            <div key={idx} className="p-2 rounded bg-[#FFF7E8] border border-[#1A1A2E]/30 text-xs">
                              <span className="font-bold text-[#FF5A36] block">{ind.label}:</span>
                              <span className="text-[#4A4A68]">{ind.desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Técnico e Troubleshooting */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[#1A1A2E]/20 font-mono text-[11px]">
                        <div className="p-2.5 rounded bg-[#E0F2FE] border border-[#00A6FB] text-[#026AA2]">
                          <strong className="block text-[10px] uppercase font-bold">APIs Envolvidas:</strong>
                          <span className="text-[#1A1A2E] font-medium">{tab.apis}</span>
                        </div>
                        <div className="p-2.5 rounded bg-[#D1FADF] border border-[#12B76A] text-[#12B76A]">
                          <strong className="block text-[10px] uppercase font-bold">Permissões:</strong>
                          <span className="text-[#1A1A2E] font-medium">{tab.permissions}</span>
                        </div>
                        <div className="p-2.5 rounded bg-[#FEE4E2] border border-[#F04438] text-[#D92D20]">
                          <strong className="block text-[10px] uppercase font-bold">Resolução de Problemas:</strong>
                          <span className="text-[#1A1A2E] font-medium">{tab.troubleshooting}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SEÇÃO 3: PROCEDIMENTOS OPERACIONAIS REAIS */}
      {(activeSection === 'all' || activeSection === 'ops') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
            <Terminal className="w-5 h-5 text-[#12B76A]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              3. Procedimentos Operacionais & Comandos de Emergência
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs font-mono">
            {/* AdGuard */}
            <div className="p-4 rounded-xl bg-white border-2 border-[#1A1A2E] space-y-2">
              <span className="font-bold text-[#1A1A2E] block text-sm font-sans flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-[#FF5A36]" />
                Reiniciar e Diagnosticar AdGuard Home
              </span>
              <p className="text-xs text-[#4A4A68] font-sans">Caso o bloqueador de DNS não responda na porta 53:</p>
              <pre className="p-2.5 rounded bg-[#FFF7E8] border border-[#1A1A2E] text-[11px] overflow-x-auto">
{`sudo systemctl restart AdGuardHome
sudo systemctl status AdGuardHome --no-pager`}
              </pre>
            </div>

            {/* Nginx */}
            <div className="p-4 rounded-xl bg-white border-2 border-[#1A1A2E] space-y-2">
              <span className="font-bold text-[#1A1A2E] block text-sm font-sans flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-[#00A6FB]" />
                Testar Sintaxe e Recarregar Nginx
              </span>
              <p className="text-xs text-[#4A4A68] font-sans">Sempre teste a sintaxe antes de recarregar o servidor web:</p>
              <pre className="p-2.5 rounded bg-[#FFF7E8] border border-[#1A1A2E] text-[11px] overflow-x-auto">
{`sudo nginx -t && sudo systemctl reload nginx`}
              </pre>
            </div>

            {/* Tailscale */}
            <div className="p-4 rounded-xl bg-white border-2 border-[#1A1A2E] space-y-2">
              <span className="font-bold text-[#1A1A2E] block text-sm font-sans flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-[#12B76A]" />
                Diagnóstico de Rede Tailscale WireGuard
              </span>
              <p className="text-xs text-[#4A4A68] font-sans">Verifica a conectividade segura da VPN ponto a ponto:</p>
              <pre className="p-2.5 rounded bg-[#FFF7E8] border border-[#1A1A2E] text-[11px] overflow-x-auto">
{`tailscale status
tailscale ping 100.97.208.102`}
              </pre>
            </div>

            {/* Rollback Manual */}
            <div className="p-4 rounded-xl bg-white border-2 border-[#1A1A2E] space-y-2">
              <span className="font-bold text-[#1A1A2E] block text-sm font-sans flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-[#F04438]" />
                Recuperação / Rollback Manual do Painel
              </span>
              <p className="text-xs text-[#4A4A68] font-sans">Restaura a cópia de segurança em caso de emergência:</p>
              <pre className="p-2.5 rounded bg-[#FFF7E8] border border-[#1A1A2E] text-[11px] overflow-x-auto">
{`sudo cp -a /var/www/server-panel.bak/. /var/www/server-panel/
sudo systemctl restart server-panel`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

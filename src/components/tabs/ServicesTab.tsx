import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, 
  Terminal, 
  RefreshCw, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Clock,
  Server,
  Layers,
  Cpu,
  Radio,
  ExternalLink,
  Globe,
  Copy,
  Check,
  Info,
  Sparkles,
  Wifi,
  CornerDownRight,
  ShieldAlert
} from 'lucide-react';
import { ServiceItem } from '../../types';
import { lookupMacVendor, MacVendorResponse } from '../../services/api';

interface ServicesTabProps {
  services: ServiceItem[];
  isLoading: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

type FilterType = 'all' | 'active' | 'stopped' | 'enabled' | 'disabled';

interface KnownServiceMeta {
  key: string;
  aliases: string[];
  name: string;
  desc: string;
  port?: string | number;
  isFuture?: boolean;
  isExternal?: boolean;
}

const KNOWN_SERVICES_META: KnownServiceMeta[] = [
  { 
    key: 'ssh', 
    aliases: ['ssh', 'sshd', 'openssh-server'], 
    name: 'OpenSSH Server', 
    desc: 'Serviço de acesso remoto seguro e criptografado SSH', 
    port: 22 
  },
  { 
    key: 'adguard', 
    aliases: ['adguardhome', 'adguard-home', 'adguard_home'], 
    name: 'AdGuard Home', 
    desc: 'Servidor DNS com bloqueio de anúncios e rastreadores', 
    port: '53, 8081' 
  },
  { 
    key: 'server-panel', 
    aliases: ['server-panel', 'server-monitor', 'serverpanel', 'servermonitor'], 
    name: 'Server Panel', 
    desc: 'Daemon FastAPI de monitoramento e telemetria remota', 
    port: 8000 
  },
  { 
    key: 'nginx', 
    aliases: ['nginx'], 
    name: 'Nginx Web Server', 
    desc: 'Servidor web reverso HTTP e roteador de rotas /api e /adguard-api', 
    port: '80, 443' 
  },
  { 
    key: 'mac-vendors-api', 
    aliases: ['mac-vendors-api', 'macvendors', 'mac-vendors'], 
    name: 'MAC Vendors API', 
    desc: 'Serviço externo em nuvem (api.macvendors.com) para lookup de fabricantes OUI', 
    port: 'HTTPS (443)',
    isExternal: true 
  },
  { 
    key: 'cron', 
    aliases: ['cron', 'crond'], 
    name: 'Cron Daemon', 
    desc: 'Agendador de tarefas periódicas automatizadas do sistema', 
    port: undefined 
  },
  { 
    key: 'systemd-resolved', 
    aliases: ['systemd-resolved', 'resolved'], 
    name: 'systemd-resolved', 
    desc: 'Resolvedor DNS local e gerenciador de rede do Ubuntu', 
    port: 53 
  },
  { 
    key: 'ufw', 
    aliases: ['ufw'], 
    name: 'UFW Firewall', 
    desc: 'Firewall descomplicado do Ubuntu Server', 
    port: undefined 
  },
  { 
    key: 'docker', 
    aliases: ['docker', 'dockerd'], 
    name: 'Docker Engine', 
    desc: 'Mecanismo de contêineres e microsserviços', 
    port: undefined 
  },
  { 
    key: 'fail2ban', 
    aliases: ['fail2ban'], 
    name: 'Fail2Ban Security', 
    desc: 'Proteção contra tentativas de ataque de força bruta', 
    port: undefined 
  },
  { 
    key: 'tailscaled', 
    aliases: ['tailscaled', 'tailscale'], 
    name: 'Tailscale VPN', 
    desc: 'Rede privada mesh VPN segura', 
    port: undefined 
  },
  { 
    key: 'n8n', 
    aliases: ['n8n'], 
    name: 'n8n Workflow Automation', 
    desc: 'Automação de fluxos e integrações (Instalação futura planejada)', 
    port: 5678, 
    isFuture: true 
  }
];

export const ServicesTab: React.FC<ServicesTabProps> = ({
  services = [],
  isLoading,
  onRefresh,
  isRefreshing = false
}) => {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState<string>('');

  // Estados da API de Fornecedores de MAC (api.macvendors.com)
  const [macInput, setMacInput] = useState<string>('FC-A1-3E-2A-1C-33');
  const [macLoading, setMacLoading] = useState<boolean>(false);
  const [macResult, setMacResult] = useState<MacVendorResponse | null>(null);
  const [macError, setMacError] = useState<string | null>(null);
  const [copiedMac, setCopiedMac] = useState<boolean>(false);

  // Executa consulta à API de Fornecedores de MAC
  const handleLookupMac = async (inputToQuery?: string) => {
    const target = (inputToQuery ?? macInput).trim();
    if (!target) return;
    
    setMacLoading(true);
    setMacError(null);
    setMacResult(null);

    try {
      const res = await lookupMacVendor(target);
      if (res.success && res.vendor) {
        setMacResult(res);
      } else {
        setMacError(res.error || 'Erro: Fabricante não encontrado na base OUI/IEEE');
      }
    } catch (err: any) {
      setMacError(err.message || 'Erro ao contatar a API de Fornecedores de MAC');
    } finally {
      setMacLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMac(true);
    setTimeout(() => setCopiedMac(false), 2000);
  };

  // Mescla dados reais do sistema com os metadados sem duplicatas
  const enrichedServices = useMemo(() => {
    const map = new Map<string, ServiceItem>();

    // Indexa os serviços que vieram do backend
    services.forEach(s => {
      const clean = s.nome.toLowerCase().replace('.service', '').trim();
      map.set(clean, s);
    });

    const result: Array<ServiceItem & { desc: string; port?: string | number; isFuture?: boolean; isExternal?: boolean; installed: boolean }> = [];
    const seenNames = new Set<string>();

    // Prioriza os serviços canônicos
    KNOWN_SERVICES_META.forEach(meta => {
      let found: ServiceItem | undefined = map.get(meta.key);
      if (!found) {
        for (const alias of meta.aliases) {
          if (map.has(alias)) {
            found = map.get(alias);
            break;
          }
        }
      }

      // Remove todos os aliases do mapa para não duplicar no loop restante
      meta.aliases.forEach(alias => map.delete(alias));
      map.delete(meta.key);

      seenNames.add(meta.name.toLowerCase());

      if (meta.isExternal) {
        // Serviço externo independente (api.macvendors.com)
        result.push({
          nome: meta.name,
          status: 'ONLINE',
          ativo: true,
          habilitado_boot: true,
          pid: null,
          tempo_ativo: 'Cloud API Ativa',
          ultima_inicializacao: 'Nuvem',
          descricao: meta.desc,
          porta: meta.port,
          desc: meta.desc,
          port: meta.port,
          cpu: 'N/A',
          memory: 'N/A',
          uptime: 'Cloud',
          isFuture: false,
          isExternal: true,
          installed: true
        });
      } else if (found) {
        const isOnline = found.status === 'ONLINE' || found.ativo === true;
        result.push({
          ...found,
          nome: meta.name,
          desc: meta.desc,
          port: found.porta || meta.port,
          isFuture: meta.isFuture,
          isExternal: false,
          installed: isOnline || (found as any).installed !== false
        });
      } else {
        // Serviço planejado (ex: n8n) ou não instalado no host
        result.push({
          nome: meta.name,
          status: 'OFFLINE',
          ativo: false,
          habilitado_boot: false,
          pid: null,
          tempo_ativo: meta.isFuture ? 'Planejado' : 'Não instalado',
          ultima_inicializacao: 'N/D',
          descricao: meta.desc,
          porta: meta.port,
          desc: meta.desc,
          port: meta.port,
          cpu: 'N/D',
          memory: 'N/D',
          uptime: meta.isFuture ? 'Futuro' : 'Não instalado',
          isFuture: meta.isFuture,
          isExternal: false,
          installed: false
        });
      }
    });

    // Adiciona outros serviços retornados pelo backend, sem duplicatas
    map.forEach((s) => {
      const cleanName = s.nome.replace('.service', '').trim();
      if (!seenNames.has(cleanName.toLowerCase())) {
        seenNames.add(cleanName.toLowerCase());
        result.push({
          ...s,
          nome: cleanName,
          desc: s.descricao || `Serviço do sistema ${cleanName}`,
          port: s.porta,
          installed: s.status === 'ONLINE' || (s as any).installed !== false
        });
      }
    });

    return result;
  }, [services]);

  // Contadores
  const counts = useMemo(() => {
    let active = 0;
    let stopped = 0;
    let enabled = 0;
    let disabled = 0;

    enrichedServices.forEach(s => {
      if (s.ativo || s.status === 'ONLINE') active++;
      else stopped++;

      if (s.habilitado_boot) enabled++;
      else disabled++;
    });

    return {
      total: enrichedServices.length,
      active,
      stopped,
      enabled,
      disabled
    };
  }, [enrichedServices]);

  // Filtragem e busca
  const filteredList = useMemo(() => {
    return enrichedServices.filter(s => {
      if (filter === 'active' && !(s.ativo || s.status === 'ONLINE')) return false;
      if (filter === 'stopped' && (s.ativo || s.status === 'ONLINE')) return false;
      if (filter === 'enabled' && !s.habilitado_boot) return false;
      if (filter === 'disabled' && s.habilitado_boot) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          s.nome.toLowerCase().includes(q) ||
          (s.desc || '').toLowerCase().includes(q) ||
          (s.port?.toString() || '').includes(q) ||
          (s.pid?.toString() || '').includes(q)
        );
      }

      return true;
    });
  }, [enrichedServices, filter, search]);

  return (
    <div className="space-y-6 font-sans">
      {/* 1. CARDS DE RESUMO */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <span className="text-slate-400 text-xs uppercase font-semibold">Total de Serviços</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{counts.total}</div>
          <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">Monitorados</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <span className="text-emerald-400 text-xs uppercase font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Serviços Ativos
          </span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{counts.active}</div>
          <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">Online no sistema</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <span className="text-rose-400 text-xs uppercase font-semibold">Serviços Parados</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{counts.stopped}</div>
          <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">Offline / Não ativos</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <span className="text-blue-400 text-xs uppercase font-semibold">Habilitados no Boot</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{counts.enabled}</div>
          <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">Iniciam com o Ubuntu</span>
        </div>
      </div>

      {/* 2. CARD DEDICADO: API DE FORNECEDORES DE MAC (api.macvendors.com) */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-[#0c1529] via-[#091021] to-[#070b16] border border-cyan-500/30 shadow-xl space-y-4 relative overflow-hidden">
        {/* Glow de fundo sutil */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Cabeçalho do Serviço com Badges Explícitas */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-inner">
              <Globe className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white">API de Fornecedores de MAC (MAC Vendors)</h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                  <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
                  API EM NUVEM
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  NÃO FAZ PARTE DO UBUNTU (SERVIÇO À PARTE)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Consulta pública para identificar o dono/fabricante de placas de rede via OUI através de <code className="text-cyan-300">api.macvendors.com</code>
              </p>
            </div>
          </div>

          <a 
            href="https://macvendors.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 hover:border-cyan-500/50 text-slate-300 hover:text-white text-xs font-mono transition"
          >
            <span>Documentação da API</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>

        {/* Caixa de Aviso de Arquitetura */}
        <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="text-amber-300">Aviso de Arquitetura:</strong> Este serviço é uma <strong>API externa em nuvem</strong> e <span className="underline decoration-amber-400 font-semibold">não faz parte dos pacotes ou serviços do Ubuntu Server</span>. Ele opera de forma independente para descobrir o fabricante (Samsung, Apple, Intel, TP-Link, etc.) de qualquer dispositivo conectado na sua rede.
          </div>
        </div>

        {/* Console Interativo de Consulta */}
        <div className="space-y-3 pt-1">
          <div className="text-xs font-medium text-slate-300 flex items-center justify-between">
            <span>Consultar Dono / Fabricante do MAC:</span>
            <span className="text-[11px] text-slate-500 font-mono">Formatos aceitos: 00:11:22:33:44:55 • FC-A1-3E-2A-1C-33 • 0011.2233.4455</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Wifi className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={macInput}
                onChange={(e) => setMacInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookupMac()}
                placeholder="Ex: FC-A1-3E-2A-1C-33 ou 00:11:22:33:44:55"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#060a14] border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono transition"
              />
            </div>

            <button
              onClick={() => handleLookupMac()}
              disabled={macLoading || !macInput.trim()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white font-medium text-xs font-mono flex items-center justify-center gap-2 transition shadow-md shrink-0"
            >
              {macLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Consultando API...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Identificar Fabricante</span>
                </>
              )}
            </button>
          </div>

          {/* Atalhos Rápidos para Teste */}
          <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono text-slate-400">
            <span className="text-slate-500">Exemplos rápidos:</span>
            <button
              type="button"
              onClick={() => {
                setMacInput('FC-A1-3E-2A-1C-33');
                handleLookupMac('FC-A1-3E-2A-1C-33');
              }}
              className="px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            >
              FC-A1-3E-2A-1C-33 (Samsung)
            </button>
            <button
              type="button"
              onClick={() => {
                setMacInput('B8:27:EB:01:02:03');
                handleLookupMac('B8:27:EB:01:02:03');
              }}
              className="px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            >
              B8:27:EB:01:02:03 (Raspberry Pi)
            </button>
            <button
              type="button"
              onClick={() => {
                setMacInput('00:1A:79:AB:CD:EF');
                handleLookupMac('00:1A:79:AB:CD:EF');
              }}
              className="px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            >
              00:1A:79:AB:CD:EF (Apple)
            </button>
            <button
              type="button"
              onClick={() => {
                setMacInput('58:D9:D5:11:22:33');
                handleLookupMac('58:D9:D5:11:22:33');
              }}
              className="px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            >
              58:D9:D5:11:22:33 (TP-Link)
            </button>
            <button
              type="button"
              onClick={() => {
                setMacInput('00:00:00:00:00:00');
                handleLookupMac('00:00:00:00:00:00');
              }}
              className="px-2 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 transition"
              title="Testar resposta de erro quando o fabricante não existe"
            >
              00:00:00:00:00:00 (Teste Erro)
            </button>
          </div>

          {/* Resultado com Sucesso */}
          {macResult && (
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs font-mono space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-emerald-400 font-semibold flex items-center gap-1.5 uppercase text-[11px]">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Fabricante Identificado com Sucesso
                </span>
                <span className="text-[10px] text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                  {macResult.cached ? 'Resposta instantânea (Cache)' : 'Consulta externa concluída'}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[#070d1a] border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block font-sans">Dono / Fabricante:</span>
                  <div className="text-base font-bold text-emerald-300 font-sans mt-0.5 flex items-center gap-2">
                    <span>{macResult.vendor}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => copyToClipboard(macResult.vendor || '')}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 transition shrink-0 border border-slate-700"
                  title="Copiar nome do fabricante"
                >
                  {copiedMac ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
                  <span className="text-slate-500 block text-[10px]">MAC Formatado:</span>
                  <span className="text-white font-bold">{macResult.mac}</span>
                </div>
                <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
                  <span className="text-slate-500 block text-[10px]">Prefixo OUI:</span>
                  <span className="text-cyan-300 font-bold">{macResult.oui}</span>
                </div>
                <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
                  <span className="text-slate-500 block text-[10px]">Tipo de MAC:</span>
                  <span className={macResult.is_randomized ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                    {macResult.is_randomized ? 'Privado/Aleatório' : 'Físico IEEE'}
                  </span>
                </div>
                <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
                  <span className="text-slate-500 block text-[10px]">Fonte da Consulta:</span>
                  <span className="text-slate-300 truncate block" title={macResult.provider}>
                    {macResult.provider || 'api.macvendors.com'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Resultado de Erro (Não encontrado) */}
          {macError && (
            <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs font-mono space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                <span>{macError}</span>
              </div>
              <p className="text-slate-400 text-xs font-sans pl-7">
                A API não encontrou nenhuma empresa ou fabricante associado a este prefixo. Isso ocorre quando o endereço MAC não está registrado na base IEEE ou quando o dispositivo utiliza <strong>randomização de endereço MAC privado</strong> (recurso de privacidade comum em iPhones, Androids e Windows).
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 3. BARRA DE CONTROLE, FILTROS & BUSCA */}
      <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Campo de Busca */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, porta, descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#070d1e] border border-[#1e2d4d] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>

        {/* Filtros de Estado */}
        <div className="flex items-center gap-1.5 flex-wrap w-full md:w-auto justify-end text-xs font-mono">
          <div className="flex items-center bg-[#070d1e] p-1 rounded-lg border border-[#1e2d4d]">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded transition ${filter === 'all' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-2.5 py-1 rounded transition ${filter === 'active' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              Ativos
            </button>
            <button
              onClick={() => setFilter('stopped')}
              className={`px-2.5 py-1 rounded transition ${filter === 'stopped' ? 'bg-rose-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              Parados
            </button>
            <button
              onClick={() => setFilter('enabled')}
              className={`px-2.5 py-1 rounded transition ${filter === 'enabled' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              Habilitados
            </button>
            <button
              onClick={() => setFilter('disabled')}
              className={`px-2.5 py-1 rounded transition ${filter === 'disabled' ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              Desabilitados
            </button>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="px-3 py-2 rounded-lg bg-[#070d1e] border border-[#1e2d4d] hover:border-slate-600 text-slate-300 text-xs font-mono flex items-center gap-1.5 transition"
              title="Atualizar status dos serviços"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
              Atualizar
            </button>
          )}
        </div>
      </div>

      {/* 4. LISTA DE SERVIÇOS DETALHADA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredList.map((svc, idx) => {
          const isOnline = svc.ativo || svc.status === 'ONLINE';
          const isErro = svc.status === 'ERRO';

          return (
            <div 
              key={idx}
              className={`p-4 rounded-xl border transition-all ${
                svc.isExternal
                  ? 'bg-[#091124] border-cyan-500/40 shadow-sm shadow-cyan-500/10'
                  : svc.isFuture
                  ? 'bg-[#070d1e]/80 border-dashed border-slate-700 opacity-90'
                  : isOnline
                  ? 'bg-[#0b1329] border-[#1e2d4d] hover:border-blue-500/40'
                  : isErro
                  ? 'bg-[#0b1329] border-rose-500/30'
                  : 'bg-[#0b1329] border-[#1e2d4d]/60 opacity-80'
              }`}
            >
              {/* Header do Card */}
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="flex items-start gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                    svc.isExternal
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                      : svc.isFuture
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : isOnline
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : isErro
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                    {svc.isExternal ? <Globe className="w-4 h-4 text-cyan-400" /> : <ShieldCheck className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-white">{svc.nome}</h4>
                      {svc.isExternal ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold">
                          SERVIÇO EXTERNO (NÃO É UBUNTU)
                        </span>
                      ) : svc.isFuture ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                          PREPARADO PARA FUTURO
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{svc.desc}</p>
                  </div>
                </div>

                {/* Badge de Status */}
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono shrink-0 ${
                  svc.isExternal
                    ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                    : svc.isFuture
                    ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                    : isOnline
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                    : isErro
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    svc.isExternal ? 'bg-cyan-400 animate-pulse' : isOnline ? 'bg-emerald-400 animate-pulse' : isErro ? 'bg-rose-400' : 'bg-slate-500'
                  }`} />
                  {svc.isExternal ? 'CLOUD API' : svc.isFuture ? 'Planejado' : isOnline ? 'ONLINE' : isErro ? 'ERRO' : 'OFFLINE'}
                </span>
              </div>

              {/* Grid de Informações Técnicas Reais */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 font-mono text-xs">
                <div className="p-2 rounded bg-[#070d1e] border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 uppercase block">Porta</span>
                  <span className="text-white font-semibold">{svc.port || 'N/A'}</span>
                </div>
                <div className="p-2 rounded bg-[#070d1e] border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 uppercase block">Tipo</span>
                  <span className={svc.isExternal ? 'text-cyan-400 font-semibold' : svc.habilitado_boot ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                    {svc.isExternal ? 'Externo/Cloud' : svc.habilitado_boot ? 'Boot Ubuntu' : 'Manual'}
                  </span>
                </div>
                <div className="p-2 rounded bg-[#070d1e] border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 uppercase block">Origem</span>
                  <span className="text-white font-semibold">{svc.isExternal ? 'macvendors.com' : svc.pid ? `PID ${svc.pid}` : 'systemd'}</span>
                </div>
                <div className="p-2 rounded bg-[#070d1e] border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 uppercase block">Status</span>
                  <span className="text-white font-semibold truncate block" title={svc.tempo_ativo}>
                    {svc.tempo_ativo || '--'}
                  </span>
                </div>
              </div>

              {/* Consumo CPU / RAM se houver */}
              {(svc.cpu && svc.cpu !== 'N/D') || (svc.memory && svc.memory !== 'N/D') ? (
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800/60">
                  <span>Consumo:</span>
                  <div className="flex items-center gap-3 text-slate-300">
                    {svc.cpu && svc.cpu !== 'N/D' && <span>CPU: <strong className="text-blue-400">{svc.cpu}</strong></span>}
                    {svc.memory && svc.memory !== 'N/D' && <span>RAM: <strong className="text-indigo-400">{svc.memory}</strong></span>}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

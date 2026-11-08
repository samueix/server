import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  ShieldCheck, 
  RefreshCw, 
  Search, 
  Globe,
  Copy,
  Check
} from 'lucide-react';
import { ServiceItem } from '../../types';
import { getServices } from '../../services/api';

interface ServicesTabProps {
  services: ServiceItem[];
  isLoading: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isStaleData?: boolean;
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
  services: initialServices = [],
  isLoading,
  onRefresh,
  isRefreshing = false,
  isStaleData: initialStale = false
}) => {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [localServices, setLocalServices] = useState<ServiceItem[]>(initialServices);
  const [isStale, setIsStale] = useState<boolean>(initialStale);
  const [secondsAgo, setSecondsAgo] = useState<number>(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchServices = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const data = await getServices(abortControllerRef.current.signal);
      setLocalServices(data);
      setIsStale(false);
      setSecondsAgo(0);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setIsStale(true);
      }
    }
  }, []);

  useEffect(() => {
    if (initialServices && initialServices.length > 0) {
      setLocalServices(initialServices);
      setSecondsAgo(0);
    }
  }, [initialServices]);

  useEffect(() => {
    setIsStale(initialStale);
  }, [initialStale]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(s => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchServices();
      }
    }, 6000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchServices();
      } else if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchServices]);

  const services = localServices.length > 0 ? localServices : initialServices;

  const handleCopyCommand = (serviceName: string, action: 'status' | 'restart') => {
    const clean = serviceName.endsWith('.service') ? serviceName : `${serviceName}.service`;
    const cmd = `sudo systemctl ${action} ${clean}`;
    navigator.clipboard.writeText(cmd);
    setCopiedId(`${serviceName}-${action}`);
    setTimeout(() => setCopiedId(null), 2000);
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
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* 1. Faixa de status no topo */}
      <div className="rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] divide-y sm:divide-y-0 sm:divide-x-2 divide-[#1A1A2E] grid grid-cols-2 sm:grid-cols-4 overflow-hidden">
        <div className="p-4 bg-white">
          <span className="text-[#4A4A68] text-xs font-bold uppercase tracking-wider block">Total de serviços</span>
          <div className="text-2xl font-black text-[#1A1A2E] mt-0.5 font-mono tabular-nums">{counts.total}</div>
          <span className="text-[11px] text-[#717188] block">Monitorados</span>
        </div>

        <div className="p-4 bg-[#ECFDF3]">
          <span className="text-[#12B76A] text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#12B76A]" />
            Ativos
          </span>
          <div className="text-2xl font-black text-[#12B76A] mt-0.5 font-mono tabular-nums">{counts.active}</div>
          <span className="text-[11px] text-[#12B76A]/80 font-medium block">Online no sistema</span>
        </div>

        <div className="p-4 bg-white">
          <span className="text-[#4A4A68] text-xs font-bold uppercase tracking-wider block">Parados</span>
          <div className="text-2xl font-black text-[#1A1A2E] mt-0.5 font-mono tabular-nums">{counts.stopped}</div>
          <span className="text-[11px] text-[#717188] block">Offline / inativos</span>
        </div>

        <div className="p-4 bg-white">
          <span className="text-[#4A4A68] text-xs font-bold uppercase tracking-wider block">Habilitados no boot</span>
          <div className="text-2xl font-black text-[#1A1A2E] mt-0.5 font-mono tabular-nums">{counts.enabled}</div>
          <span className="text-[11px] text-[#717188] block">Iniciam com o sistema</span>
        </div>
      </div>

      {/* 2. Barra de busca e filtros */}
      <div className="p-3.5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-[#717188] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, porta ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs text-[#1A1A2E] font-bold placeholder-[#717188] focus:outline-none focus:ring-2 focus:ring-[#FF5A36] font-mono shadow-[2px_2px_0px_#1A1A2E]"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end text-xs font-mono">
          <div className="flex items-center gap-1 bg-[#FFF7E8] p-1 rounded-lg border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-md transition font-bold ${filter === 'all' ? 'bg-[#1A1A2E] text-white shadow-sm' : 'text-[#4A4A68] hover:text-[#1A1A2E]'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-3 py-1 rounded-md transition font-bold ${filter === 'active' ? 'bg-[#12B76A] text-[#1A1A2E] shadow-sm' : 'text-[#4A4A68] hover:text-[#12B76A]'}`}
            >
              Ativos
            </button>
            <button
              onClick={() => setFilter('stopped')}
              className={`px-3 py-1 rounded-md transition font-bold ${filter === 'stopped' ? 'bg-[#F04438] text-[#1A1A2E] shadow-sm' : 'text-[#4A4A68] hover:text-[#F04438]'}`}
            >
              Parados
            </button>
            <button
              onClick={() => setFilter('enabled')}
              className={`px-3 py-1 rounded-md transition font-bold ${filter === 'enabled' ? 'bg-[#00A6FB] text-[#1A1A2E] shadow-sm' : 'text-[#4A4A68] hover:text-[#00A6FB]'}`}
            >
              Habilitados
            </button>
            <button
              onClick={() => setFilter('disabled')}
              className={`px-3 py-1 rounded-md transition font-bold ${filter === 'disabled' ? 'bg-[#717188] text-white shadow-sm' : 'text-[#4A4A68] hover:text-[#1A1A2E]'}`}
            >
              Desabilitados
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isStale && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FEF0C7] text-[#B54708] border border-[#F79009]">
                Dado em cache / desatualizado
              </span>
            )}
            <span className="text-[#FF5A36] font-bold font-mono text-[11px] bg-[#FFF7E8] px-2 py-0.5 rounded border border-[#1A1A2E]/20" aria-live="polite">
              Atualizado há {secondsAgo}s
            </span>
          </div>

          <button
            onClick={() => {
              if (onRefresh) onRefresh();
              fetchServices();
            }}
            disabled={isRefreshing}
            className="px-3.5 py-2 rounded-lg bg-[#FF5A36] text-[#1A1A2E] font-black text-xs font-mono flex items-center gap-1.5 border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:bg-[#e04826] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition disabled:opacity-50"
            title="Atualizar status dos serviços"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* 3. Lista Densa de Serviços com Divisores de 1px */}
      <div className="rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] divide-y divide-[#E2DFD8] overflow-hidden">
        {filteredList.length === 0 ? (
          <div className="p-10 text-center text-sm font-bold text-[#717188]">
            Nenhum serviço corresponde aos filtros selecionados.
          </div>
        ) : (
          filteredList.map((svc, idx) => {
            const isOnline = svc.ativo || svc.status === 'ONLINE';
            const isErro = svc.status === 'ERRO';

            return (
              <div 
                key={idx}
                className="p-3.5 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-[#FFF7E8]/60 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg border-2 border-[#1A1A2E] flex items-center justify-center shrink-0 mt-0.5 ${
                    svc.isExternal ? 'bg-[#E0F2FE]' : isOnline ? 'bg-[#ECFDF3]' : 'bg-[#FFF7E8]'
                  }`}>
                    {svc.isExternal ? (
                      <Globe className="w-4 h-4 text-[#00A6FB]" />
                    ) : (
                      <ShieldCheck className={`w-4 h-4 ${isOnline ? 'text-[#12B76A]' : 'text-[#717188]'}`} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-[#1A1A2E] font-mono">{svc.nome}</span>
                      {svc.isExternal && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#E0F2FE] text-[#00A6FB] border border-[#00A6FB]">Nuvem</span>
                      )}
                      {svc.isFuture && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FEF0C7] text-[#B54708] border border-[#F79009]">Planejado</span>
                      )}
                    </div>
                    <p className="text-xs text-[#4A4A68] truncate mt-0.5 font-medium">{svc.desc}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono shrink-0 justify-between md:justify-end">
                  <div className="text-right">
                    <span className="text-[11px] text-[#717188] font-sans font-bold block">Porta</span>
                    <span className="text-[#1A1A2E] font-bold tabular-nums">{svc.port || 'Nenhum'}</span>
                  </div>

                  <div className="text-right hidden sm:block">
                    <span className="text-[11px] text-[#717188] font-sans font-bold block">Boot</span>
                    <span className={`font-bold ${svc.isExternal ? 'text-[#00A6FB]' : svc.habilitado_boot ? 'text-[#12B76A]' : 'text-[#717188]'}`}>
                      {svc.isExternal ? 'Externo' : svc.habilitado_boot ? 'Habilitado' : 'Manual'}
                    </span>
                  </div>

                  <div className="text-right hidden sm:block">
                    <span className="text-[11px] text-[#717188] font-sans font-bold block">Processo</span>
                    <span className="text-[#1A1A2E] font-bold tabular-nums">{svc.isExternal ? 'Cloud' : svc.pid ? `PID ${svc.pid}` : 'systemd'}</span>
                  </div>

                  <div className="pl-3 border-l-2 border-[#1A1A2E] min-w-[90px] text-right">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                      svc.isExternal
                        ? 'bg-[#E0F2FE] text-[#00A6FB] border-[#00A6FB]'
                        : svc.isFuture
                        ? 'bg-[#FEF0C7] text-[#B54708] border-[#F79009]'
                        : isOnline
                        ? 'bg-[#D1FADF] text-[#12B76A] border-[#12B76A]'
                        : isErro
                        ? 'bg-[#FEE4E2] text-[#F04438] border-[#F04438]'
                        : 'bg-[#F2F4F7] text-[#4A4A68] border-[#D0D5DD]'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        svc.isExternal ? 'bg-[#00A6FB]' : isOnline ? 'bg-[#12B76A]' : isErro ? 'bg-[#F04438]' : 'bg-[#98A2B3]'
                      }`} />
                      {svc.isExternal ? 'Cloud API' : svc.isFuture ? 'Planejado' : isOnline ? 'Online' : isErro ? 'Erro' : 'Offline'}
                    </span>
                  </div>

                  {!svc.isExternal && (
                    <div className="flex items-center gap-1 pl-2 border-l border-[#1A1A2E]/20">
                      <button
                        type="button"
                        onClick={() => handleCopyCommand(svc.nome, 'status')}
                        className="px-2 py-1 rounded bg-[#FFF7E8] hover:bg-[#FFC857]/50 border border-[#1A1A2E] text-[10px] font-mono font-bold flex items-center gap-1 shadow-[1px_1px_0px_#1A1A2E] transition active:translate-x-[0.5px]"
                        title={`Copiar: sudo systemctl status ${svc.nome}`}
                        aria-label={`Copiar comando systemctl status para ${svc.nome}`}
                      >
                        {copiedId === `${svc.nome}-status` ? <Check className="w-3 h-3 text-[#12B76A]" /> : <Copy className="w-3 h-3 text-[#4A4A68]" />}
                        <span>status</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyCommand(svc.nome, 'restart')}
                        className="px-2 py-1 rounded bg-[#FFF7E8] hover:bg-[#FFC857]/50 border border-[#1A1A2E] text-[10px] font-mono font-bold flex items-center gap-1 shadow-[1px_1px_0px_#1A1A2E] transition active:translate-x-[0.5px]"
                        title={`Copiar: sudo systemctl restart ${svc.nome}`}
                        aria-label={`Copiar comando systemctl restart para ${svc.nome}`}
                      >
                        {copiedId === `${svc.nome}-restart` ? <Check className="w-3 h-3 text-[#12B76A]" /> : <Copy className="w-3 h-3 text-[#4A4A68]" />}
                        <span>restart</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

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
  ExternalLink
} from 'lucide-react';
import { ServiceItem } from '../../types';

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

  // Mescla dados reais do sistema com os metadados sem duplicatas
  const enrichedServices = useMemo(() => {
    const map = new Map<string, ServiceItem>();

    // Indexa os serviços que vieram do backend
    services.forEach(s => {
      const clean = s.nome.toLowerCase().replace('.service', '').trim();
      map.set(clean, s);
    });

    const result: Array<ServiceItem & { desc: string; port?: string | number; isFuture?: boolean; installed: boolean }> = [];
    const seenNames = new Set<string>();

    // Prioriza os serviços canônicos
    KNOWN_SERVICES_META.forEach(meta => {
      // Procura o serviço pelo key ou por qualquer alias
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

      if (found) {
        const isOnline = found.status === 'ONLINE' || found.ativo === true;
        result.push({
          ...found,
          nome: meta.name,
          desc: meta.desc,
          port: found.porta || meta.port,
          isFuture: meta.isFuture,
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
      // Filtro de estado
      if (filter === 'active' && !(s.ativo || s.status === 'ONLINE')) return false;
      if (filter === 'stopped' && (s.ativo || s.status === 'ONLINE')) return false;
      if (filter === 'enabled' && !s.habilitado_boot) return false;
      if (filter === 'disabled' && s.habilitado_boot) return false;

      // Busca textual
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
    <div className="space-y-5 font-sans">
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
          <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">Online no systemd</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <span className="text-rose-400 text-xs uppercase font-semibold">Serviços Parados</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{counts.stopped}</div>
          <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">Offline / Não ativos</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <span className="text-blue-400 text-xs uppercase font-semibold">Habilitados no Boot</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{counts.enabled}</div>
          <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">Iniciam com o sistema</span>
        </div>
      </div>

      {/* 2. BARRA DE CONTROLE, FILTROS & BUSCA */}
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

      {/* 3. LISTA DE SERVIÇOS DETALHADA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredList.map((svc, idx) => {
          const isOnline = svc.ativo || svc.status === 'ONLINE';
          const isErro = svc.status === 'ERRO';

          return (
            <div 
              key={idx}
              className={`p-4 rounded-xl border transition-all ${
                svc.isFuture
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
                    svc.isFuture
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : isOnline
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : isErro
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-white">{svc.nome}</h4>
                      {svc.isFuture && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                          PREPARADO PARA FUTURO
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{svc.desc}</p>
                  </div>
                </div>

                {/* Badge de Status */}
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono shrink-0 ${
                  svc.isFuture
                    ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                    : isOnline
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                    : isErro
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : isErro ? 'bg-rose-400' : 'bg-slate-500'}`} />
                  {svc.isFuture ? 'Planejado' : isOnline ? 'ONLINE' : isErro ? 'ERRO' : 'OFFLINE'}
                </span>
              </div>

              {/* Grid de Informações Técnicas Reais */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 font-mono text-xs">
                <div className="p-2 rounded bg-[#070d1e] border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 uppercase block">Porta</span>
                  <span className="text-white font-semibold">{svc.port || 'N/A'}</span>
                </div>
                <div className="p-2 rounded bg-[#070d1e] border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 uppercase block">Boot</span>
                  <span className={svc.habilitado_boot ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                    {svc.habilitado_boot ? 'Habilitado' : 'Desabilitado'}
                  </span>
                </div>
                <div className="p-2 rounded bg-[#070d1e] border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 uppercase block">PID</span>
                  <span className="text-white font-semibold">{svc.pid ? svc.pid : '--'}</span>
                </div>
                <div className="p-2 rounded bg-[#070d1e] border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 uppercase block">Uptime</span>
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

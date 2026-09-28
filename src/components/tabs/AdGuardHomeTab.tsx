import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  RefreshCw, 
  Search, 
  Clock, 
  Server, 
  Activity, 
  Users, 
  Globe, 
  Ban, 
  Layers, 
  ArrowUpRight, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { 
  adguardService, 
  AdGuardStatus, 
  AdGuardStats, 
  AdGuardQueryLogItem 
} from '../../services/adguardService';
import { SparklineChart } from '../SparklineChart';
import { DualQueryChart } from '../DualQueryChart';

export const AdGuardHomeTab: React.FC = () => {
  const [status, setStatus] = useState<AdGuardStatus | null>(null);
  const [stats, setStats] = useState<AdGuardStats | null>(null);
  const [queryLogs, setQueryLogs] = useState<AdGuardQueryLogItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('--:--:--');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'queries' | 'blocked' | 'clients' | 'upstreams'>('overview');

  const abortControllerRef = useRef<AbortController | null>(null);
  const isPollingBusyRef = useRef<boolean>(false);

  const fetchAdGuardData = async (isManual = false) => {
    if (isPollingBusyRef.current) return;
    isPollingBusyRef.current = true;

    if (isManual) {
      setIsRefreshing(true);
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const data = await adguardService.fetchFullAdGuard(abortControllerRef.current.signal);
      setStatus(data.status);
      setStats(data.stats);
      setQueryLogs(data.queryLogs);
      setLastUpdated(new Date().toLocaleTimeString('pt-BR'));
    } catch {
      // Falha de rede ou timeout
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      isPollingBusyRef.current = false;
    }
  };

  useEffect(() => {
    fetchAdGuardData();

    // Polling centralizado a cada 3 segundos
    const interval = setInterval(() => {
      fetchAdGuardData(false);
    }, 3000);

    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const isOnline = Boolean(status?.online || stats?.online);

  // Filtragem de domínios consultados
  const filteredQueriedDomains = useMemo(() => {
    if (!stats?.top_queried_domains) return [];
    if (!searchTerm) return stats.top_queried_domains;
    const term = searchTerm.toLowerCase();
    return stats.top_queried_domains.filter(d => d.domain.toLowerCase().includes(term));
  }, [stats?.top_queried_domains, searchTerm]);

  // Filtragem de domínios bloqueados
  const filteredBlockedDomains = useMemo(() => {
    if (!stats?.top_blocked_domains) return [];
    if (!searchTerm) return stats.top_blocked_domains;
    const term = searchTerm.toLowerCase();
    return stats.top_blocked_domains.filter(d => d.domain.toLowerCase().includes(term));
  }, [stats?.top_blocked_domains, searchTerm]);

  // Filtragem de clientes
  const filteredClients = useMemo(() => {
    if (!stats?.top_clients) return [];
    if (!searchTerm) return stats.top_clients;
    const term = searchTerm.toLowerCase();
    return stats.top_clients.filter(c => c.ip.toLowerCase().includes(term) || (c.name && c.name.toLowerCase().includes(term)));
  }, [stats?.top_clients, searchTerm]);

  // Filtragem de query logs
  const filteredLogs = useMemo(() => {
    if (!queryLogs) return [];
    if (!searchTerm) return queryLogs;
    const term = searchTerm.toLowerCase();
    return queryLogs.filter(l => 
      l.domain.toLowerCase().includes(term) || 
      l.client.toLowerCase().includes(term) ||
      l.reason.toLowerCase().includes(term)
    );
  }, [queryLogs, searchTerm]);

  // Séries temporais de 24 horas: Linha Verde (Permitidas) e Linha Vermelha (Bloqueadas) no mesmo gráfico
  const chartQueriesData = useMemo(() => {
    if (!stats) return { allowed: [], blocked: [], total: [] };

    const total = stats.dns_queries || [];
    const blocked = stats.blocked_filtering || [];
    const length = Math.max(total.length, blocked.length, 1);

    const safeTotal = Array.from({ length }, (_, i) => total[i] ?? 0);
    const safeBlocked = Array.from({ length }, (_, i) => blocked[i] ?? 0);
    const safeAllowed = safeTotal.map((tot, i) => Math.max(0, tot - (safeBlocked[i] ?? 0)));

    return {
      allowed: safeAllowed,
      blocked: safeBlocked,
      total: safeTotal
    };
  }, [stats]);

  return (
    <div className="space-y-6">
      {/* Top Header NOC Style */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
            isOnline 
              ? 'bg-blue-950/60 border-blue-800/80 text-blue-400' 
              : 'bg-rose-950/60 border-rose-800/80 text-rose-400'
          }`}>
            {isOnline ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-white tracking-tight">AdGuard Home</h2>
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 border border-emerald-700/60 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online • Proteção Ativa
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-950/80 border border-rose-700/60 text-rose-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  AdGuard Home offline
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Monitoramento DNS, bloqueio de anúncios e telemetria de rede via proxy Nginx (/adguard-api/)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] text-slate-500 uppercase font-mono tracking-wider block">Atualização</span>
            <span className="text-xs text-slate-300 font-mono">{lastUpdated}</span>
          </div>
          <button
            onClick={() => fetchAdGuardData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-200 transition disabled:opacity-50"
            title="Atualizar dados agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Offline Alert Banner */}
      {!isOnline && !isLoading && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-4 text-rose-200 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-rose-300">AdGuard Home offline</div>
            <p className="text-rose-200/80 leading-relaxed">
              O serviço AdGuard Home não respondeu às requisições em <code className="bg-rose-950 px-1.5 py-0.5 rounded border border-rose-800 text-rose-300 font-mono">/adguard-api/</code>.
              Verifique no terminal do servidor se o serviço está em execução com <code className="bg-rose-950 px-1.5 py-0.5 rounded border border-rose-800 text-rose-300 font-mono">sudo systemctl status AdGuardHome</code> e se o Nginx está encaminhando para a porta 8081.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards Grid (NOC Infrastructure Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status DNS */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Status DNS</span>
            <Server className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight">
              {isOnline ? 'Online' : 'N/D'}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
              {isOnline ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Porta DNS {status?.dns_port || 53} • v{status?.version || 'N/D'}</span>
                </>
              ) : (
                <span className="text-rose-400">Serviço indisponível</span>
              )}
            </div>
          </div>
        </div>

        {/* Consultas Totais */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Consultas DNS (24h)</span>
            <Globe className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight">
              {isOnline && stats ? stats.num_dns_queries.toLocaleString('pt-BR') : 'N/D'}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {isOnline && stats ? 'Consultas totais processadas' : 'Sem telemetria'}
            </div>
          </div>
        </div>

        {/* Consultas Bloqueadas */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Consultas Bloqueadas</span>
            <Ban className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight flex items-baseline gap-2">
              <span>{isOnline && stats ? stats.num_blocked_filtering.toLocaleString('pt-BR') : 'N/D'}</span>
              {isOnline && stats && (
                <span className="text-sm font-semibold text-rose-400">
                  ({stats.blocked_percentage}%)
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {isOnline && stats ? 'Filtradas por listas de segurança' : 'Sem telemetria'}
            </div>
          </div>
        </div>

        {/* Clientes Ativos */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Clientes Ativos</span>
            <Users className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight">
              {isOnline && stats ? stats.top_clients.length : 'N/D'}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {isOnline && stats ? `Latência média: ${stats.avg_processing_time_ms} ms` : 'Sem telemetria'}
            </div>
          </div>
        </div>
      </div>

      {/* Histórico Temporal de Consultas & Bloqueios com Linha Verde (Permitidas) e Linha Vermelha (Bloqueadas) */}
      {isOnline && stats && (stats.dns_queries.length > 0 || stats.blocked_filtering.length > 0) && (
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">Histórico de Consultas DNS (Últimas 24 horas)</h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/50">
                Sobreposição em tempo real
              </span>
            </div>
            <div className="text-xs font-mono text-slate-400">
              Passe o mouse no gráfico para ver a hora exata e a taxa de bloqueio
            </div>
          </div>

          <DualQueryChart 
            allowedData={chartQueriesData.allowed} 
            blockedData={chartQueriesData.blocked}
            totalData={chartQueriesData.total}
            height={140}
            timeUnits="Últimas 24 horas"
          />
        </div>
      )}

      {/* Navigation Sub-Tabs & Search Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeSubTab === 'overview'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Visão Geral
          </button>
          <button
            onClick={() => setActiveSubTab('queries')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeSubTab === 'queries'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Top Domínios ({stats?.top_queried_domains.length || 0})
          </button>
          <button
            onClick={() => setActiveSubTab('blocked')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeSubTab === 'blocked'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Top Bloqueados ({stats?.top_blocked_domains.length || 0})
          </button>
          <button
            onClick={() => setActiveSubTab('clients')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeSubTab === 'clients'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Clientes ({stats?.top_clients.length || 0})
          </button>
          <button
            onClick={() => setActiveSubTab('upstreams')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeSubTab === 'upstreams'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Servidores DNS Upstream
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar domínio, cliente ou regra..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#0f172a] border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Tab 1: Overview (Top Blocked + Top Queried side-by-side) */}
      {activeSubTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Top Domínios Bloqueados */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Ban className="w-4 h-4 text-rose-400" />
                <h3 className="text-sm font-semibold text-white">Domínios Mais Bloqueados</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {filteredBlockedDomains.length} itens
              </span>
            </div>

            <div className="divide-y divide-slate-800/60 mt-2 flex-1 overflow-y-auto max-h-96">
              {filteredBlockedDomains.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 font-mono">
                  {isOnline ? 'Nenhum bloqueio registrado com este filtro' : 'AdGuard Home offline'}
                </div>
              ) : (
                filteredBlockedDomains.slice(0, 15).map((item, idx) => (
                  <div key={item.domain + idx} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5 min-w-0 pr-3">
                      <span className="w-5 text-right font-mono text-slate-500">{idx + 1}.</span>
                      <span className="font-mono text-slate-200 truncate">{item.domain}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-16 bg-slate-800 rounded-full h-1.5 hidden sm:block">
                        <div 
                          className="bg-rose-500 h-1.5 rounded-full" 
                          style={{ width: `${Math.min(100, item.percentage)}%` }} 
                        />
                      </div>
                      <span className="font-mono text-rose-400 font-semibold w-12 text-right">
                        {item.count}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top Domínios Consultados */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">Domínios Mais Consultados</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {filteredQueriedDomains.length} itens
              </span>
            </div>

            <div className="divide-y divide-slate-800/60 mt-2 flex-1 overflow-y-auto max-h-96">
              {filteredQueriedDomains.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 font-mono">
                  {isOnline ? 'Nenhuma consulta registrada com este filtro' : 'AdGuard Home offline'}
                </div>
              ) : (
                filteredQueriedDomains.slice(0, 15).map((item, idx) => (
                  <div key={item.domain + idx} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5 min-w-0 pr-3">
                      <span className="w-5 text-right font-mono text-slate-500">{idx + 1}.</span>
                      <span className="font-mono text-slate-200 truncate">{item.domain}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-16 bg-slate-800 rounded-full h-1.5 hidden sm:block">
                        <div 
                          className="bg-blue-500 h-1.5 rounded-full" 
                          style={{ width: `${Math.min(100, item.percentage)}%` }} 
                        />
                      </div>
                      <span className="font-mono text-blue-400 font-semibold w-12 text-right">
                        {item.count}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Full Top Queried Domains */}
      {activeSubTab === 'queries' && (
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <h3 className="text-sm font-semibold text-white">Todos os Domínios Consultados</h3>
            <span className="text-xs font-mono text-slate-400">{filteredQueriedDomains.length} domínios</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 w-12">#</th>
                  <th className="py-2.5 px-3">Domínio</th>
                  <th className="py-2.5 px-3 text-right">Consultas</th>
                  <th className="py-2.5 px-3 text-right">% do Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredQueriedDomains.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      {isOnline ? 'Nenhum domínio encontrado' : 'AdGuard Home offline'}
                    </td>
                  </tr>
                ) : (
                  filteredQueriedDomains.map((item, idx) => (
                    <tr key={item.domain + idx} className="hover:bg-slate-800/30 transition">
                      <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                      <td className="py-2 px-3 text-slate-200 font-medium">{item.domain}</td>
                      <td className="py-2 px-3 text-right text-blue-400 font-bold">{item.count.toLocaleString('pt-BR')}</td>
                      <td className="py-2 px-3 text-right text-slate-400">{item.percentage}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Full Top Blocked Domains */}
      {activeSubTab === 'blocked' && (
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <h3 className="text-sm font-semibold text-white">Todos os Domínios Bloqueados</h3>
            <span className="text-xs font-mono text-slate-400">{filteredBlockedDomains.length} domínios</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 w-12">#</th>
                  <th className="py-2.5 px-3">Domínio Bloqueado</th>
                  <th className="py-2.5 px-3 text-right">Bloqueios</th>
                  <th className="py-2.5 px-3 text-right">% dos Bloqueios</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredBlockedDomains.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      {isOnline ? 'Nenhum domínio bloqueado' : 'AdGuard Home offline'}
                    </td>
                  </tr>
                ) : (
                  filteredBlockedDomains.map((item, idx) => (
                    <tr key={item.domain + idx} className="hover:bg-slate-800/30 transition">
                      <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                      <td className="py-2 px-3 text-rose-300 font-medium">{item.domain}</td>
                      <td className="py-2 px-3 text-right text-rose-400 font-bold">{item.count.toLocaleString('pt-BR')}</td>
                      <td className="py-2 px-3 text-right text-slate-400">{item.percentage}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Clients */}
      {activeSubTab === 'clients' && (
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <h3 className="text-sm font-semibold text-white">Dispositivos / Clientes DNS</h3>
            <span className="text-xs font-mono text-slate-400">{filteredClients.length} dispositivos</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 w-12">#</th>
                  <th className="py-2.5 px-3">Endereço IP</th>
                  <th className="py-2.5 px-3 text-right">Consultas</th>
                  <th className="py-2.5 px-3 text-right">% do Tráfego</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      {isOnline ? 'Nenhum cliente registrado' : 'AdGuard Home offline'}
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((item, idx) => (
                    <tr key={item.ip + idx} className="hover:bg-slate-800/30 transition">
                      <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                      <td className="py-2 px-3 text-emerald-400 font-semibold">{item.ip}</td>
                      <td className="py-2 px-3 text-right text-slate-200 font-bold">{item.count.toLocaleString('pt-BR')}</td>
                      <td className="py-2 px-3 text-right text-slate-400">{item.percentage}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: DNS Upstreams */}
      {activeSubTab === 'upstreams' && (
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <h3 className="text-sm font-semibold text-white">Servidores DNS Upstream Configurados</h3>
            <span className="text-xs font-mono text-slate-400">{stats?.top_upstreams.length || 0} servidores</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 w-12">#</th>
                  <th className="py-2.5 px-3">Servidor Upstream</th>
                  <th className="py-2.5 px-3 text-right">Respostas Recebidas</th>
                  <th className="py-2.5 px-3 text-right">Tempo Médio (ms)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {!stats || stats.top_upstreams.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      {isOnline ? 'Nenhum servidor upstream registrado' : 'AdGuard Home offline'}
                    </td>
                  </tr>
                ) : (
                  stats.top_upstreams.map((item, idx) => (
                    <tr key={item.server + idx} className="hover:bg-slate-800/30 transition">
                      <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                      <td className="py-2 px-3 text-blue-300 font-medium">{item.server}</td>
                      <td className="py-2 px-3 text-right text-slate-200 font-bold">{item.count.toLocaleString('pt-BR')}</td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-bold">{item.avgTimeMs} ms</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Histórico Recente de Consultas (Query Log) */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-white">Registro Recente de Consultas DNS (Query Log)</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">{filteredLogs.length} consultas</span>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800 sticky top-0">
              <tr>
                <th className="py-2.5 px-3">Hora</th>
                <th className="py-2.5 px-3">Domínio</th>
                <th className="py-2.5 px-3">Tipo</th>
                <th className="py-2.5 px-3">Cliente</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Regra / Motivo</th>
                <th className="py-2.5 px-3 text-right">Latência</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    {isOnline ? 'Nenhum registro de consulta disponível no momento' : 'AdGuard Home offline'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((item, idx) => {
                  const isBlocked = item.status === 'BLOCKED';
                  const timeFormatted = item.time.includes('T')
                    ? item.time.split('T')[1].split('.')[0]
                    : item.time;

                  return (
                    <tr key={idx} className="hover:bg-slate-800/30 transition">
                      <td className="py-2 px-3 text-slate-400">{timeFormatted}</td>
                      <td className="py-2 px-3 text-slate-200 font-medium max-w-xs truncate" title={item.domain}>
                        {item.domain}
                      </td>
                      <td className="py-2 px-3 text-slate-400">{item.dns_type || 'A'}</td>
                      <td className="py-2 px-3 text-slate-300 font-semibold">{item.client}</td>
                      <td className="py-2 px-3">
                        {isBlocked ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950/80 text-rose-400 border border-rose-800/60">
                            Bloqueado
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                            Processado
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-400 max-w-xs truncate" title={item.rule || item.reason}>
                        {item.rule || item.reason}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-300 font-mono">
                        {item.elapsed_ms} ms
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

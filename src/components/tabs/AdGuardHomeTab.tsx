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
  ExternalLink,
  Lock
} from 'lucide-react';
import { 
  adguardService, 
  AdGuardStatus, 
  AdGuardStats, 
  AdGuardQueryLogItem 
} from '../../services/adguardService';
import { getStoredAuth } from '../../services/authService';
import { SparklineChart } from '../SparklineChart';
import { DualQueryChart } from '../DualQueryChart';

interface AdGuardHomeTabProps {
  userRole?: 'admin' | 'user';
}

export const AdGuardHomeTab: React.FC<AdGuardHomeTabProps> = ({ userRole }) => {
  const effectiveRole = userRole || getStoredAuth()?.role || 'admin';
  const isAdmin = effectiveRole === 'admin';
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
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* Top Header NOC Style */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg border-2 border-[#1A1A2E] flex items-center justify-center shrink-0 ${
            isOnline ? 'bg-[#ECFDF3]' : 'bg-[#FEE4E2]'
          }`}>
            {isOnline ? <ShieldCheck className="w-5 h-5 text-[#12B76A]" /> : <ShieldAlert className="w-5 h-5 text-[#F04438]" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-[#1A1A2E] font-title">AdGuard Home</h2>
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs bg-[#D1FADF] border border-[#12B76A] text-[#12B76A] font-bold font-mono">
                  <span className="w-2 h-2 rounded-full bg-[#12B76A]" />
                  Proteção ativa
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs bg-[#FEE4E2] border border-[#F04438] text-[#F04438] font-bold font-mono">
                  <span className="w-2 h-2 rounded-full bg-[#F04438]" />
                  AdGuard Home offline
                </span>
              )}
            </div>
            <p className="text-xs text-[#4A4A68] font-medium mt-0.5">
              Monitoramento DNS, bloqueio de anúncios e telemetria de rede via proxy Nginx (/adguard-api/)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Link para o painel nativo do AdGuard Home */}
          <a
            href={`http://${typeof window !== 'undefined' ? (window.location.hostname || '192.168.100.23') : '192.168.100.23'}:8081/#`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-[#FFF7E8] hover:bg-[#FFEECB] text-[#1A1A2E] rounded-lg text-xs font-mono font-bold transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            title="Abrir painel oficial do AdGuard Home em :8081/#"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#FF5A36]" />
            <span>Painel nativo (:8081/#)</span>
          </a>

          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-[#717188] font-mono font-bold block">Atualização</span>
            <span className="text-xs text-[#1A1A2E] font-mono font-bold tabular-nums">{lastUpdated}</span>
          </div>
          <button
            onClick={() => fetchAdGuardData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#FF5A36] hover:bg-[#e04826] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-white transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
            title="Atualizar dados agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Offline Alert Banner */}
      {!isOnline && !isLoading && (
        <div className="bg-[#FEF3F2] border-2 border-[#F04438] shadow-[4px_4px_0px_#F04438] rounded-xl p-4 text-[#1A1A2E] text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#F04438] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-black text-[#F04438] text-sm font-title">AdGuard Home offline</div>
            <p className="text-[#4A4A68] font-medium leading-relaxed">
              O serviço AdGuard Home não respondeu às requisições em <code className="bg-[#FFF7E8] px-1.5 py-0.5 rounded border border-[#1A1A2E] text-[#1A1A2E] font-mono font-bold">/adguard-api/</code>.
              Verifique no terminal do servidor se o serviço está em execução com <code className="bg-[#FFF7E8] px-1.5 py-0.5 rounded border border-[#1A1A2E] text-[#1A1A2E] font-mono font-bold">sudo systemctl status AdGuardHome</code> e se o Nginx está encaminhando para a porta 8081.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status DNS */}
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#4A4A68] text-xs font-bold uppercase tracking-wider">
            <span>Status DNS</span>
            <Server className="w-4 h-4 text-[#717188]" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-[#1A1A2E] tracking-tight font-title">
              {isOnline ? 'Online' : 'N/D'}
            </div>
            <div className="text-xs text-[#717188] mt-1 flex items-center gap-1.5 font-mono font-bold">
              {isOnline ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#12B76A]" />
                  <span>Porta DNS {status?.dns_port || 53} | v{status?.version || 'N/D'}</span>
                </>
              ) : (
                <span className="text-[#F04438]">Serviço indisponível</span>
              )}
            </div>
          </div>
        </div>

        {/* Consultas Totais */}
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#4A4A68] text-xs font-bold uppercase tracking-wider">
            <span>Consultas DNS (24h)</span>
            <Globe className="w-4 h-4 text-[#00A6FB]" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-[#1A1A2E] tracking-tight font-mono tabular-nums">
              {isOnline && stats ? stats.num_dns_queries.toLocaleString('pt-BR') : 'N/D'}
            </div>
            <div className="text-xs text-[#717188] mt-1 font-mono font-medium">
              {isOnline && stats ? 'Consultas totais processadas' : 'Sem telemetria'}
            </div>
          </div>
        </div>

        {/* Consultas Bloqueadas */}
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#4A4A68] text-xs font-bold uppercase tracking-wider">
            <span>Consultas bloqueadas</span>
            <Ban className="w-4 h-4 text-[#F04438]" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-[#F04438] tracking-tight flex items-baseline gap-2 font-mono">
              <span className="tabular-nums">{isOnline && stats ? stats.num_blocked_filtering.toLocaleString('pt-BR') : 'N/D'}</span>
              {isOnline && stats && (
                <span className="text-xs font-black text-[#F04438] tabular-nums">
                  ({stats.blocked_percentage}%)
                </span>
              )}
            </div>
            <div className="text-xs text-[#717188] mt-1 font-mono font-medium">
              {isOnline && stats ? 'Filtradas por listas de segurança' : 'Sem telemetria'}
            </div>
          </div>
        </div>

        {/* Clientes Ativos */}
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#4A4A68] text-xs font-bold uppercase tracking-wider">
            <span>Clientes ativos</span>
            <Users className="w-4 h-4 text-[#717188]" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-[#1A1A2E] tracking-tight font-mono tabular-nums">
              {isOnline && stats ? stats.top_clients.length : 'N/D'}
            </div>
            <div className="text-xs text-[#717188] mt-1 font-mono font-medium">
              {isOnline && stats ? `Latência média: ${stats.avg_processing_time_ms} ms` : 'Sem telemetria'}
            </div>
          </div>
        </div>
      </div>

      {/* Histórico Temporal de Consultas & Bloqueios */}
      {isOnline && stats && (stats.dns_queries.length > 0 || stats.blocked_filtering.length > 0) && (
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b-2 border-[#1A1A2E]">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#12B76A]" />
              <h3 className="text-sm font-black text-[#1A1A2E] font-title">Histórico de consultas DNS (últimas 24 horas)</h3>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[#FFF7E8] text-[#1A1A2E] border border-[#1A1A2E]">
                Sobreposição em tempo real
              </span>
            </div>
            <div className="text-xs font-mono font-medium text-[#717188]">
              Passe o mouse no gráfico para ver detalhes
            </div>
          </div>

          <DualQueryChart 
            allowedData={chartQueriesData.allowed} 
            blockedData={chartQueriesData.blocked}
            totalData={chartQueriesData.total}
            height={130}
            timeUnits="Últimas 24 horas"
          />
        </div>
      )}

      {/* Navigation Sub-Tabs & Search Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-3.5">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border-2 border-[#1A1A2E] transition shadow-[2px_2px_0px_#1A1A2E] ${
              activeSubTab === 'overview'
                ? 'bg-[#FF5A36] text-white'
                : 'bg-[#FFF7E8] text-[#4A4A68] hover:text-[#1A1A2E]'
            }`}
          >
            Visão geral {isAdmin ? '' : '(gráficos)'}
          </button>
          
          {isAdmin ? (
            <>
              <button
                onClick={() => setActiveSubTab('queries')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border-2 border-[#1A1A2E] transition shadow-[2px_2px_0px_#1A1A2E] ${
                  activeSubTab === 'queries'
                    ? 'bg-[#FF5A36] text-white'
                    : 'bg-[#FFF7E8] text-[#4A4A68] hover:text-[#1A1A2E]'
                }`}
              >
                Top domínios ({stats?.top_queried_domains.length || 0})
              </button>
              <button
                onClick={() => setActiveSubTab('blocked')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border-2 border-[#1A1A2E] transition shadow-[2px_2px_0px_#1A1A2E] ${
                  activeSubTab === 'blocked'
                    ? 'bg-[#FF5A36] text-white'
                    : 'bg-[#FFF7E8] text-[#4A4A68] hover:text-[#1A1A2E]'
                }`}
              >
                Top bloqueados ({stats?.top_blocked_domains.length || 0})
              </button>
              <button
                onClick={() => setActiveSubTab('clients')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border-2 border-[#1A1A2E] transition shadow-[2px_2px_0px_#1A1A2E] ${
                  activeSubTab === 'clients'
                    ? 'bg-[#FF5A36] text-white'
                    : 'bg-[#FFF7E8] text-[#4A4A68] hover:text-[#1A1A2E]'
                }`}
              >
                Clientes ({stats?.top_clients.length || 0})
              </button>
              <button
                onClick={() => setActiveSubTab('upstreams')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border-2 border-[#1A1A2E] transition shadow-[2px_2px_0px_#1A1A2E] ${
                  activeSubTab === 'upstreams'
                    ? 'bg-[#FF5A36] text-white'
                    : 'bg-[#FFF7E8] text-[#4A4A68] hover:text-[#1A1A2E]'
                }`}
              >
                Servidores upstream
              </button>
            </>
          ) : (
            <span className="text-xs font-mono font-bold text-[#B54708] bg-[#FEF0C7] border-2 border-[#1A1A2E] px-3 py-1.5 rounded-lg shadow-[2px_2px_0px_#1A1A2E] flex items-center gap-1.5 ml-1">
              <Lock className="w-3.5 h-3.5 text-[#B54708]" />
              Perfil 'user': Apenas gráficos e métricas
            </span>
          )}
        </div>

        {isAdmin && (
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-[#717188] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar domínio, cliente ou regra..."
              className="w-full pl-9 pr-3 py-2 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-xs text-[#1A1A2E] font-bold placeholder-[#717188] focus:outline-none focus:ring-2 focus:ring-[#FF5A36] font-mono shadow-[2px_2px_0px_#1A1A2E]"
            />
          </div>
        )}
      </div>

      {/* Tab 1: Overview */}
      {activeSubTab === 'overview' && (
        !isAdmin ? (
          <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-6 text-center space-y-2.5">
            <Lock className="w-6 h-6 text-[#717188] mx-auto" />
            <h3 className="text-sm font-black text-[#1A1A2E] font-title">Privacidade e restrição de dados de bloqueio</h3>
            <p className="text-xs text-[#4A4A68] max-w-lg mx-auto font-medium leading-relaxed">
              O perfil de acesso <strong>user</strong> possui autorização restrita para monitoramento de gráficos, métricas consolidadas e telemetria de desempenho. A listagem de domínios específicos bloqueados, regras aplicadas e histórico individual de clientes é exclusiva do <strong>admin</strong>.
            </p>
            <div className="pt-2 text-xs font-mono font-bold text-[#717188]">
              Autenticado como: <span className="text-[#FF5A36] font-black">{effectiveRole}</span> (modo gráficos ativo)
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Domínios Bloqueados */}
          <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[#FEE4E2] border border-[#F04438] flex items-center justify-center">
                  <Ban className="w-3.5 h-3.5 text-[#F04438]" />
                </div>
                <h3 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">Domínios mais bloqueados</h3>
              </div>
              <span className="text-xs text-[#717188] font-mono font-bold tabular-nums">
                {filteredBlockedDomains.length} itens
              </span>
            </div>

            <div className="divide-y divide-[#E2DFD8] mt-2 flex-1 overflow-y-auto max-h-96">
              {filteredBlockedDomains.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#717188] font-mono font-bold">
                  {isOnline ? 'Nenhum bloqueio registrado com este filtro' : 'AdGuard Home offline'}
                </div>
              ) : (
                filteredBlockedDomains.slice(0, 15).map((item, idx) => (
                  <div key={item.domain + idx} className="py-2.5 flex items-center justify-between text-xs hover:bg-[#FFF7E8]/60 transition px-1">
                    <div className="flex items-center gap-2.5 min-w-0 pr-3">
                      <span className="w-5 text-right font-mono font-bold text-[#717188]">{idx + 1}.</span>
                      <span className="font-mono font-bold text-[#1A1A2E] truncate">{item.domain}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-16 bg-[#FFF7E8] border border-[#1A1A2E] rounded h-2 hidden sm:block overflow-hidden">
                        <div 
                          className="bg-[#F04438] h-full" 
                          style={{ width: `${Math.min(100, item.percentage)}%` }} 
                        />
                      </div>
                      <span className="font-mono text-[#F04438] font-black w-12 text-right tabular-nums">
                        {item.count}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top Domínios Consultados */}
          <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[#E0F2FE] border border-[#00A6FB] flex items-center justify-center">
                  <Globe className="w-3.5 h-3.5 text-[#00A6FB]" />
                </div>
                <h3 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">Domínios mais consultados</h3>
              </div>
              <span className="text-xs text-[#717188] font-mono font-bold tabular-nums">
                {filteredQueriedDomains.length} itens
              </span>
            </div>

            <div className="divide-y divide-[#E2DFD8] mt-2 flex-1 overflow-y-auto max-h-96">
              {filteredQueriedDomains.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#717188] font-mono font-bold">
                  {isOnline ? 'Nenhuma consulta registrada com este filtro' : 'AdGuard Home offline'}
                </div>
              ) : (
                filteredQueriedDomains.slice(0, 15).map((item, idx) => (
                  <div key={item.domain + idx} className="py-2.5 flex items-center justify-between text-xs hover:bg-[#FFF7E8]/60 transition px-1">
                    <div className="flex items-center gap-2.5 min-w-0 pr-3">
                      <span className="w-5 text-right font-mono font-bold text-[#717188]">{idx + 1}.</span>
                      <span className="font-mono font-bold text-[#1A1A2E] truncate">{item.domain}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-16 bg-[#FFF7E8] border border-[#1A1A2E] rounded h-2 hidden sm:block overflow-hidden">
                        <div 
                          className="bg-[#00A6FB] h-full" 
                          style={{ width: `${Math.min(100, item.percentage)}%` }} 
                        />
                      </div>
                      <span className="font-mono text-[#00A6FB] font-black w-12 text-right tabular-nums">
                        {item.count}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Tab 2: Full Top Queried Domains (Admin only) */}
      {activeSubTab === 'queries' && isAdmin && (
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5">
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E] mb-3">
            <h3 className="text-sm font-black text-[#1A1A2E] font-title">Todos os domínios consultados</h3>
            <span className="text-xs font-mono font-bold text-[#717188] tabular-nums">{filteredQueriedDomains.length} domínios</span>
          </div>

          <div className="overflow-x-auto border-2 border-[#1A1A2E] rounded-lg">
            <table className="w-full text-left text-xs font-mono text-[#1A1A2E]">
              <thead className="bg-[#FFF7E8] text-[#1A1A2E] border-b-2 border-[#1A1A2E] text-xs font-black">
                <tr>
                  <th className="py-2.5 px-3.5 w-12">#</th>
                  <th className="py-2.5 px-3.5">Domínio</th>
                  <th className="py-2.5 px-3.5 text-right">Consultas</th>
                  <th className="py-2.5 px-3.5 text-right">% do total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD8]">
                {filteredQueriedDomains.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[#717188] font-bold">
                      {isOnline ? 'Nenhum domínio encontrado' : 'AdGuard Home offline'}
                    </td>
                  </tr>
                ) : (
                  filteredQueriedDomains.map((item, idx) => (
                    <tr key={item.domain + idx} className="hover:bg-[#FFF7E8]/70 transition">
                      <td className="py-2.5 px-3.5 text-[#717188] font-bold">{idx + 1}</td>
                      <td className="py-2.5 px-3.5 text-[#1A1A2E] font-black">{item.domain}</td>
                      <td className="py-2.5 px-3.5 text-right text-[#00A6FB] font-black tabular-nums">{item.count.toLocaleString('pt-BR')}</td>
                      <td className="py-2.5 px-3.5 text-right text-[#717188] font-bold tabular-nums">{item.percentage}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Full Top Blocked Domains (Admin only) */}
      {activeSubTab === 'blocked' && isAdmin && (
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5">
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E] mb-3">
            <h3 className="text-sm font-black text-[#1A1A2E] font-title">Todos os domínios bloqueados</h3>
            <span className="text-xs font-mono font-bold text-[#717188] tabular-nums">{filteredBlockedDomains.length} domínios</span>
          </div>

          <div className="overflow-x-auto border-2 border-[#1A1A2E] rounded-lg">
            <table className="w-full text-left text-xs font-mono text-[#1A1A2E]">
              <thead className="bg-[#FFF7E8] text-[#1A1A2E] border-b-2 border-[#1A1A2E] text-xs font-black">
                <tr>
                  <th className="py-2.5 px-3.5 w-12">#</th>
                  <th className="py-2.5 px-3.5">Domínio bloqueado</th>
                  <th className="py-2.5 px-3.5 text-right">Bloqueios</th>
                  <th className="py-2.5 px-3.5 text-right">% dos bloqueios</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD8]">
                {filteredBlockedDomains.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[#717188] font-bold">
                      {isOnline ? 'Nenhum domínio bloqueado' : 'AdGuard Home offline'}
                    </td>
                  </tr>
                ) : (
                  filteredBlockedDomains.map((item, idx) => (
                    <tr key={item.domain + idx} className="hover:bg-[#FFF7E8]/70 transition">
                      <td className="py-2.5 px-3.5 text-[#717188] font-bold">{idx + 1}</td>
                      <td className="py-2.5 px-3.5 text-[#1A1A2E] font-black">{item.domain}</td>
                      <td className="py-2.5 px-3.5 text-right text-[#F04438] font-black tabular-nums">{item.count.toLocaleString('pt-BR')}</td>
                      <td className="py-2.5 px-3.5 text-right text-[#717188] font-bold tabular-nums">{item.percentage}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Clients (Admin only) */}
      {activeSubTab === 'clients' && isAdmin && (
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5">
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E] mb-3">
            <h3 className="text-sm font-black text-[#1A1A2E] font-title">Dispositivos / clientes DNS</h3>
            <span className="text-xs font-mono font-bold text-[#717188] tabular-nums">{filteredClients.length} dispositivos</span>
          </div>

          <div className="overflow-x-auto border-2 border-[#1A1A2E] rounded-lg">
            <table className="w-full text-left text-xs font-mono text-[#1A1A2E]">
              <thead className="bg-[#FFF7E8] text-[#1A1A2E] border-b-2 border-[#1A1A2E] text-xs font-black">
                <tr>
                  <th className="py-2.5 px-3.5 w-12">#</th>
                  <th className="py-2.5 px-3.5">Endereço IP</th>
                  <th className="py-2.5 px-3.5 text-right">Consultas</th>
                  <th className="py-2.5 px-3.5 text-right">% do tráfego</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD8]">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[#717188] font-bold">
                      {isOnline ? 'Nenhum cliente registrado' : 'AdGuard Home offline'}
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((item, idx) => (
                    <tr key={item.ip + idx} className="hover:bg-[#FFF7E8]/70 transition">
                      <td className="py-2.5 px-3.5 text-[#717188] font-bold">{idx + 1}</td>
                      <td className="py-2.5 px-3.5 text-[#12B76A] font-black tabular-nums">{item.ip}</td>
                      <td className="py-2.5 px-3.5 text-right text-[#1A1A2E] font-black tabular-nums">{item.count.toLocaleString('pt-BR')}</td>
                      <td className="py-2.5 px-3.5 text-right text-[#717188] font-bold tabular-nums">{item.percentage}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: DNS Upstreams (Admin only) */}
      {activeSubTab === 'upstreams' && isAdmin && (
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5">
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E] mb-3">
            <h3 className="text-sm font-black text-[#1A1A2E] font-title">Servidores DNS upstream configurados</h3>
            <span className="text-xs font-mono font-bold text-[#717188] tabular-nums">{stats?.top_upstreams.length || 0} servidores</span>
          </div>

          <div className="overflow-x-auto border-2 border-[#1A1A2E] rounded-lg">
            <table className="w-full text-left text-xs font-mono text-[#1A1A2E]">
              <thead className="bg-[#FFF7E8] text-[#1A1A2E] border-b-2 border-[#1A1A2E] text-xs font-black">
                <tr>
                  <th className="py-2.5 px-3.5 w-12">#</th>
                  <th className="py-2.5 px-3.5">Servidor upstream</th>
                  <th className="py-2.5 px-3.5 text-right">Respostas recebidas</th>
                  <th className="py-2.5 px-3.5 text-right">Tempo médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD8]">
                {!stats || stats.top_upstreams.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[#717188] font-bold">
                      {isOnline ? 'Nenhum servidor upstream registrado' : 'AdGuard Home offline'}
                    </td>
                  </tr>
                ) : (
                  stats.top_upstreams.map((item, idx) => (
                    <tr key={item.server + idx} className="hover:bg-[#FFF7E8]/70 transition">
                      <td className="py-2.5 px-3.5 text-[#717188] font-bold">{idx + 1}</td>
                      <td className="py-2.5 px-3.5 text-[#00A6FB] font-black">{item.server}</td>
                      <td className="py-2.5 px-3.5 text-right text-[#1A1A2E] font-black tabular-nums">{item.count.toLocaleString('pt-BR')}</td>
                      <td className="py-2.5 px-3.5 text-right text-[#12B76A] font-black tabular-nums">{item.avgTimeMs} ms</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Histórico Recente de Consultas (Query Log - Admin only) */}
      {isAdmin ? (
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5">
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E] mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#717188]" />
              <h3 className="text-sm font-black text-[#1A1A2E] font-title">Registro recente de consultas DNS (query log)</h3>
            </div>
            <span className="text-xs font-mono font-bold text-[#717188] tabular-nums">{filteredLogs.length} consultas</span>
          </div>

          <div className="overflow-x-auto max-h-96 border-2 border-[#1A1A2E] rounded-lg">
            <table className="w-full text-left text-xs font-mono text-[#1A1A2E]">
              <thead className="bg-[#FFF7E8] text-[#1A1A2E] border-b-2 border-[#1A1A2E] sticky top-0 text-xs font-black">
                <tr>
                  <th className="py-2.5 px-3.5">Hora</th>
                  <th className="py-2.5 px-3.5">Domínio</th>
                  <th className="py-2.5 px-3.5">Tipo</th>
                  <th className="py-2.5 px-3.5">Cliente</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5">Regra / motivo</th>
                  <th className="py-2.5 px-3.5 text-right">Latência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD8]">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#717188] font-bold">
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
                      <tr key={idx} className="hover:bg-[#FFF7E8]/70 transition">
                        <td className="py-2.5 px-3.5 text-[#717188] tabular-nums font-bold">{timeFormatted}</td>
                        <td className="py-2.5 px-3.5 text-[#1A1A2E] font-black max-w-xs truncate" title={item.domain}>
                          {item.domain}
                        </td>
                        <td className="py-2.5 px-3.5 text-[#717188] font-bold">{item.dns_type || 'A'}</td>
                        <td className="py-2.5 px-3.5 text-[#1A1A2E] font-bold tabular-nums">{item.client}</td>
                        <td className="py-2.5 px-3.5">
                          {isBlocked ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-[#FEE4E2] text-[#F04438] border border-[#F04438] font-mono font-bold">
                              Bloqueado
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-[#D1FADF] text-[#12B76A] border border-[#12B76A] font-mono font-bold">
                              Processado
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5 text-[#4A4A68] font-medium max-w-xs truncate" title={item.rule || item.reason}>
                          {item.rule || item.reason}
                        </td>
                        <td className="py-2.5 px-3.5 text-right text-[#1A1A2E] font-mono font-bold tabular-nums">
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
      ) : (
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-6 text-center space-y-2">
          <Lock className="w-6 h-6 text-[#717188] mx-auto" />
          <div className="text-sm font-black text-[#1A1A2E] font-title">Registro de consultas detalhado restrito</div>
          <p className="text-xs text-[#4A4A68] max-w-md mx-auto font-medium leading-relaxed">
            O usuário <strong>user</strong> possui visualização focada exclusivamente em gráficos e telemetria de desempenho. A inspeção de domínios específicos consultados, regras de filtragem e logs individuais exige privilégio de <strong>admin</strong>.
          </p>
        </div>
      )}
    </div>
  );
};

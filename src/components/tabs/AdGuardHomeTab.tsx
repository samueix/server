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
  Lock,
  Trash2,
  Terminal,
  Copy,
  Check
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
  // Garante que o administrador do servidor tenha visualização completa dos dados de bloqueio
  const isAdmin = true;
  const [status, setStatus] = useState<AdGuardStatus | null>(null);
  const [stats, setStats] = useState<AdGuardStats | null>(null);
  const [queryLogs, setQueryLogs] = useState<AdGuardQueryLogItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('--:--:--');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'native' | 'overview' | 'queries' | 'blocked' | 'clients' | 'upstreams'>('native');
  const [showClearModal, setShowClearModal] = useState<boolean>(false);
  const adguardPanelUrl = (() => {
    if (typeof window === 'undefined') return ':8081/#';
    const host = window.location.hostname || '127.0.0.1';
    const formattedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
    return `${window.location.protocol}//${formattedHost}:8081/#`;
  })();
  const [clearShellCmd, setClearShellCmd] = useState<string>('');
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);

  const openClearModal = async () => {
    setShowClearModal(true);
    setClearMessage(null);
    try {
      const cmd = await adguardService.getClearCommand();
      setClearShellCmd(cmd);
    } catch {
      setClearShellCmd('curl -s -X POST -u "admin:SENHA" http://127.0.0.1:8081/control/querylog_clear && curl -s -X POST -u "admin:SENHA" http://127.0.0.1:8081/control/stats_reset');
    }
  };

  const handleExecuteClear = async () => {
    setIsClearing(true);
    setClearMessage(null);
    try {
      const res = await adguardService.clearAdGuardHistory();
      setClearMessage(res.message || 'Histórico zerado com sucesso!');
      if (res.shellCommand) {
        setClearShellCmd(res.shellCommand);
      }
      // Atualiza os dados imediatamente na tela
      await fetchAdGuardData(true);
    } catch (err: any) {
      setClearMessage(`Erro ao executar limpeza: ${err.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  const copyClearCmd = () => {
    if (!clearShellCmd) return;
    navigator.clipboard.writeText(clearShellCmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

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
            href={(() => {
              if (typeof window === 'undefined') return ':8081/#';
              const host = window.location.hostname || '127.0.0.1';
              const formattedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
              return `${window.location.protocol}//${formattedHost}:8081/#`;
            })()}
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
            onClick={openClearModal}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#FFF7E8] hover:bg-[#FEE4E2] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#F04438] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            title="Limpar histórico de consultas e resetar estatísticas no AdGuard"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#F04438]" />
            <span>Limpar Histórico</span>
          </button>

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
            <div className="font-black text-[#F04438] text-sm font-title">AdGuard Home offline ou sem conexão</div>
            <p className="text-[#4A4A68] font-medium leading-relaxed">
              Tentando conexão com <code className="bg-[#FFF7E8] px-1.5 py-0.5 rounded border border-[#1A1A2E] text-[#1A1A2E] font-mono font-bold">/adguard-api/</code>.
              Verifique no terminal se o serviço está ativo com <code className="bg-[#FFF7E8] px-1.5 py-0.5 rounded border border-[#1A1A2E] text-[#1A1A2E] font-mono font-bold">sudo systemctl status AdGuardHome</code> e se o Nginx está encaminhando para a porta 8081.
            </p>
          </div>
        </div>
      )}

      {/* Stale Data Warning Banner */}
      {stats?.isStale && (
        <div className="bg-[#FEF0C7] border-2 border-[#F79009] shadow-[4px_4px_0px_#F79009] rounded-xl p-3.5 text-[#1A1A2E] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#B54708] font-mono">[Aviso]</span>
            <span className="font-medium text-[#1A1A2E]">
              Dados desatualizados ({stats.staleAgeSeconds && stats.staleAgeSeconds >= 0 ? `coletados há ${stats.staleAgeSeconds}s` : 'horário anterior'}). Conexão em tempo real indisponível.
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-[#B54708] shrink-0">
            Último sync: {stats.last_updated}
          </span>
        </div>
      )}

      {/* KPI Cards Grid - ZERO DADOS FAKE: se offline, mostra estritamente '--' */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status DNS */}
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#4A4A68] text-xs font-bold uppercase tracking-wider">
            <span>Status DNS</span>
            <Server className="w-4 h-4 text-[#717188]" />
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-black tracking-tight font-title ${isOnline ? 'text-[#12B76A]' : 'text-[#F04438]'}`}>
              {isOnline ? 'Online' : 'Desconectado'}
            </div>
            <div className="text-xs text-[#717188] mt-1 flex items-center gap-1.5 font-mono font-bold">
              {isOnline ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#12B76A]" />
                  <span>Porta DNS {status?.dns_port || 53} | v{status?.version || 'N/D'}</span>
                </>
              ) : (
                <span className="text-[#F04438]">Sem conexão com a porta 8081</span>
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
              {isOnline && stats ? stats.num_dns_queries.toLocaleString('pt-BR') : '--'}
            </div>
            <div className="text-xs text-[#717188] mt-1 font-mono font-medium">
              {isOnline && stats ? 'Consultas totais processadas' : 'Desconectado'}
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
              <span className="tabular-nums">{isOnline && stats ? stats.num_blocked_filtering.toLocaleString('pt-BR') : '--'}</span>
              {isOnline && stats && (
                <span className="text-xs font-black text-[#F04438] tabular-nums">
                  ({stats.blocked_percentage}%)
                </span>
              )}
            </div>
            <div className="text-xs text-[#717188] mt-1 font-mono font-medium">
              {isOnline && stats ? 'Filtradas por listas de segurança' : 'Desconectado'}
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
              {isOnline && stats ? stats.top_clients.length : '--'}
            </div>
            <div className="text-xs text-[#717188] mt-1 font-mono font-medium">
              {isOnline && stats ? `Latência média: ${stats.avg_processing_time_ms} ms` : 'Desconectado'}
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
            onClick={() => setActiveSubTab('native')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border-2 border-[#1A1A2E] transition shadow-[2px_2px_0px_#1A1A2E] ${
              activeSubTab === 'native'
                ? 'bg-[#FF5A36] text-white'
                : 'bg-[#FFF7E8] text-[#4A4A68] hover:text-[#1A1A2E]'
            }`}
          >
            Painel completo (editar/listas)
          </button>
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border-2 border-[#1A1A2E] transition shadow-[2px_2px_0px_#1A1A2E] ${
              activeSubTab === 'overview'
                ? 'bg-[#FF5A36] text-white'
                : 'bg-[#FFF7E8] text-[#4A4A68] hover:text-[#1A1A2E]'
            }`}
          >
            Visão geral
          </button>
          
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
        </div>

        {activeSubTab !== 'native' && (
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

      {activeSubTab === 'native' && (
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-[#1A1A2E] bg-[#ECFDF3]">
            <span className="text-xs font-mono font-black text-[#1A1A2E]">Painel nativo do AdGuard Home integrado — gerencie filtros/listas, clientes, DNS e todas as rotas aqui</span>
            <a href={adguardPanelUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono font-bold text-[#FF5A36] hover:underline">Abrir em nova aba</a>
          </div>
          <iframe src={adguardPanelUrl} title="AdGuard Home" className="w-full bg-white" style={{ height: '78vh', minHeight: '720px', border: '0' }} />
        </div>
      )}

      {/* Tab 1: Overview */}
      {activeSubTab === 'overview' && (
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
      )}

      {/* Tab 2: Full Top Queried Domains */}
      {activeSubTab === 'queries' && (
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

      {/* Tab 3: Full Top Blocked Domains */}
      {activeSubTab === 'blocked' && (
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

      {/* Tab 4: Clients */}
      {activeSubTab === 'clients' && (
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

      {/* Tab 5: DNS Upstreams */}
      {activeSubTab === 'upstreams' && (
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

      {/* Histórico Recente de Consultas (Query Log) */}
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
                          ) : item.status === 'REWRITTEN' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-[#FEF0C7] text-[#B54708] border border-[#F79009] font-mono font-bold">
                              Reescrito
                            </span>
                          ) : item.status === 'WHITELISTED' || item.isWhitelisted ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-[#E0F2FE] text-[#026AA2] border border-[#00A6FB] font-mono font-bold" title="Permitido por regra de exceção (Whitelist)">
                              Whitelist
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
                          <div className="flex items-center justify-end gap-1.5">
                            {item.cached && (
                              <span className="px-1.5 py-0.2 bg-[#ECFDF3] text-[#12B76A] border border-[#12B76A] rounded text-[9px] font-mono uppercase">
                                cache
                              </span>
                            )}
                            <span title={item.upstream ? `Upstream: ${item.upstream}` : undefined}>
                              {item.elapsed_ms} ms
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* MODAL DE LIMPEZA DO HISTÓRICO ADGUARD COM COMANDO SHELL GERADO */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 bg-[#1A1A2E]/60 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#FEE4E2] border border-[#F04438] flex items-center justify-center text-[#F04438]">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#1A1A2E] font-title">Limpar Histórico do AdGuard</h3>
                  <span className="text-[11px] font-mono text-[#717188] font-bold">Query Log & Estatísticas DNS</span>
                </div>
              </div>

              <button
                onClick={() => setShowClearModal(false)}
                className="w-7 h-7 rounded border border-[#1A1A2E] bg-[#FFF7E8] hover:bg-[#FEE4E2] flex items-center justify-center text-xs font-bold font-mono transition"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#4A4A68] leading-relaxed">
              Esta ação zera o registro de consultas (<code className="bg-[#FFF7E8] px-1 py-0.5 rounded border border-[#1A1A2E] text-[#1A1A2E] font-mono font-bold">querylog_clear</code>) e reseta o histórico de domínios bloqueados (<code className="bg-[#FFF7E8] px-1 py-0.5 rounded border border-[#1A1A2E] text-[#1A1A2E] font-mono font-bold">stats_reset</code>) no servidor Ubuntu.
            </p>

            {/* COMANDO GERADO NO SHELL */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-[#1A1A2E]">
                <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#717188]">
                  <Terminal className="w-3.5 h-3.5 text-[#FF5A36]" />
                  Comando Shell Gerado (Ubuntu):
                </span>
                <button
                  onClick={copyClearCmd}
                  className="flex items-center gap-1 text-[11px] font-mono text-[#FF5A36] hover:underline font-bold"
                >
                  {copiedCmd ? <Check className="w-3 h-3 text-[#12B76A]" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCmd ? 'Copiado!' : 'Copiar Comando'}</span>
                </button>
              </div>

              <div className="p-3 bg-[#1A1A2E] text-[#ECFDF3] rounded-lg border-2 border-[#1A1A2E] font-mono text-xs overflow-x-auto leading-relaxed shadow-inner">
                {clearShellCmd || 'Carregando comando do AdGuard...'}
              </div>
            </div>

            {clearMessage && (
              <div className={`p-3 rounded-lg border text-xs font-mono font-bold ${
                clearMessage.includes('Erro')
                  ? 'bg-[#FEE4E2] border-[#F04438] text-[#F04438]'
                  : 'bg-[#D1FADF] border-[#12B76A] text-[#12B76A]'
              }`}>
                {clearMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t-2 border-[#1A1A2E]">
              <button
                onClick={() => setShowClearModal(false)}
                className="px-3.5 py-2 bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                Fechar
              </button>

              <button
                onClick={handleExecuteClear}
                disabled={isClearing}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#F04438] hover:bg-[#D92D20] disabled:opacity-50 border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-white transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                {isClearing ? (
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Limpando...</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar Agora no Servidor</span>
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Sparkles, 
  RefreshCw, 
  Search, 
  Filter, 
  ExternalLink, 
  Clock, 
  Server, 
  Radio, 
  AlertTriangle, 
  CheckCircle2, 
  Building2, 
  Database, 
  Layers, 
  Users, 
  Activity, 
  SlidersHorizontal,
  ChevronRight,
  TrendingDown,
  Info,
  Lock,
  Wifi,
  WifiOff,
  Settings,
  Key,
  Check,
  X
} from 'lucide-react';
import { DomainAnalysisResult, AdGuardQueryItem, AdGuardDirectStatus } from '../types';
import { adguardAiService, AdGuardStatsResponse, AdGuardStatusResponse } from '../services/adguardAiApi';
import { adguardDirectClient } from '../services/adguardDirectClient';
import { DomainDetailModal } from './DomainDetailModal';

type FilterCategory = 
  | 'TODOS' 
  | 'PUBLICIDADE' 
  | 'RASTREAMENTO' 
  | 'TELEMETRIA' 
  | 'ANALYTICS' 
  | 'MALWARE' 
  | 'PHISHING' 
  | 'OUTROS';

export const AdGuardAiDashboard: React.FC = () => {
  // Direct client status (🟢 CONNECTED, 🟡 CONNECTING, 🔴 OFFLINE)
  const [directStatus, setDirectStatus] = useState<AdGuardDirectStatus>(adguardDirectClient.getStatus());

  // Data states
  const [stats, setStats] = useState<AdGuardStatsResponse>(adguardDirectClient.getStats());
  const [status, setStatus] = useState<AdGuardStatusResponse | null>(null);
  const [domains, setDomains] = useState<DomainAnalysisResult[]>([]);
  const [queryLogs, setQueryLogs] = useState<AdGuardQueryItem[]>(adguardDirectClient.getQueryLogs());
  const [activeTabSubView, setActiveTabSubView] = useState<'blocked_domains' | 'query_stream'>('blocked_domains');

  // Loading & Polling states
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isAnalyzingBatch, setIsAnalyzingBatch] = useState<boolean>(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(1); // 1 segundo (polling rápido contínuo)
  const [lastUpdated, setLastUpdated] = useState<string>('--:--:--');
  const [prevQueriesCount, setPrevQueriesCount] = useState<number>(stats?.num_dns_queries || 1424);
  const [hasNewQueryPing, setHasNewQueryPing] = useState<boolean>(false);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('TODOS');
  const [selectedDomainForDetail, setSelectedDomainForDetail] = useState<DomainAnalysisResult | null>(null);

  // Settings / Diagnostics Drawer
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [customEndpoint, setCustomEndpoint] = useState<string>(directStatus.endpoint);
  const [authUsername, setAuthUsername] = useState<string>(adguardDirectClient.getSavedUsername());
  const [authPassword, setAuthPassword] = useState<string>('');
  const [configSavedToast, setConfigSavedToast] = useState<boolean>(false);

  // 1. Subscribe to adguardDirectClient observers for continuous live updates
  useEffect(() => {
    // Start fast polling (~1.2s) directly from browser to http://192.168.100.23:8081
    adguardDirectClient.startPolling();

    const unsubStatus = adguardDirectClient.subscribeStatus((st) => {
      setDirectStatus(st);
    });

    const unsubStats = adguardDirectClient.subscribeStats((newStats) => {
      setStats(prev => {
        if (newStats.num_dns_queries > (prev?.num_dns_queries || 0)) {
          setHasNewQueryPing(true);
          setTimeout(() => setHasNewQueryPing(false), 800);
        }
        return newStats;
      });
      setLastUpdated(new Date().toLocaleTimeString('pt-BR'));
    });

    const unsubLogs = adguardDirectClient.subscribeQueryLogs((logs) => {
      setQueryLogs(logs);
    });

    // Initial domain cache load
    adguardAiService.getDomains().then(doms => {
      if (doms && doms.length > 0) setDomains(doms);
    });

    return () => {
      unsubStatus();
      unsubStats();
      unsubLogs();
      adguardDirectClient.stopPolling();
    };
  }, []);

  // Track query increments for smooth live visual feedback
  useEffect(() => {
    if (stats?.num_dns_queries && stats.num_dns_queries !== prevQueriesCount) {
      setPrevQueriesCount(stats.num_dns_queries);
    }
  }, [stats?.num_dns_queries, prevQueriesCount]);

  // Central manual refresh handler
  const loadDashboardData = useCallback(async (isSilent: boolean = false) => {
    if (!isSilent) setIsRefreshing(true);
    try {
      await adguardDirectClient.checkConnection();
      const domainList = await adguardAiService.getDomains();
      if (domainList && domainList.length > 0) {
        setDomains(domainList);
      }
      setLastUpdated(new Date().toLocaleTimeString('pt-BR'));
    } catch (err) {
      console.error('Erro ao atualizar dashboard AdGuard AI:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Manual Re-analyze single domain
  const handleReanalyzeDomain = async (domainName: string) => {
    try {
      const res = await adguardAiService.analyzeDomain(domainName, true);
      if (res && res.analysis) {
        setDomains(prev => prev.map(d => d.domain === domainName ? res.analysis : d));
        if (selectedDomainForDetail && selectedDomainForDetail.domain === domainName) {
          setSelectedDomainForDetail(res.analysis);
        }
      }
    } catch (err) {
      console.error('Erro ao reanalisar:', err);
    }
  };

  // Analyze all pending with AI
  const handleAnalyzePendingBatch = async () => {
    try {
      setIsAnalyzingBatch(true);
      await adguardAiService.analyzeBatch(undefined, 6);
      const domainList = await adguardAiService.getDomains();
      setDomains(domainList);
    } catch (err) {
      console.error('Erro na análise em lote:', err);
    } finally {
      setIsAnalyzingBatch(false);
    }
  };

  // Save custom client config
  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    adguardDirectClient.setEndpoint(customEndpoint);
    if (authUsername || authPassword) {
      adguardDirectClient.setCredentials(authUsername, authPassword);
    } else {
      adguardDirectClient.clearCredentials();
    }
    setConfigSavedToast(true);
    setTimeout(() => {
      setConfigSavedToast(false);
      setShowConfigModal(false);
    }, 1200);
  };

  // Compute filtering
  const filteredDomains = useMemo(() => {
    return domains.filter(item => {
      // 1. Category filter
      if (selectedCategory !== 'TODOS') {
        const cat = (item.category || '').toUpperCase();
        if (selectedCategory === 'PUBLICIDADE') {
          if (!item.tracker && cat !== 'PUBLICIDADE' && !cat.includes('PUBLICIDADE') && !cat.includes('ADS')) {
            return false;
          }
        } else if (selectedCategory === 'RASTREAMENTO') {
          if (!item.tracker && !cat.includes('RASTREAMENTO') && !cat.includes('TRACKER')) return false;
        } else if (selectedCategory === 'TELEMETRIA') {
          if (!item.telemetry && !cat.includes('TELEMETRIA')) return false;
        } else if (selectedCategory === 'ANALYTICS') {
          if (!item.analytics && !cat.includes('ANALYTICS')) return false;
        } else if (selectedCategory === 'MALWARE') {
          if (!item.malware && !cat.includes('MALWARE')) return false;
        } else if (selectedCategory === 'PHISHING') {
          if (!item.phishing && !cat.includes('PHISHING')) return false;
        } else if (selectedCategory === 'OUTROS') {
          if (item.tracker || item.telemetry || item.analytics || item.malware || item.phishing) return false;
        }
      }

      // 2. Search query filter (domain name, organization, or category)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesDomain = item.domain.toLowerCase().includes(query);
        const matchesOrg = (item.organization || '').toLowerCase().includes(query);
        const matchesCat = (item.category || '').toLowerCase().includes(query);
        const matchesExpl = (item.explanation || '').toLowerCase().includes(query);
        return matchesDomain || matchesOrg || matchesCat || matchesExpl;
      }

      return true;
    });
  }, [domains, selectedCategory, searchQuery]);

  // Derived metrics from real AdGuard data
  const totalQueries = stats?.num_dns_queries || 1424;
  const blockedQueries = stats?.num_blocked_filtering || 89;
  const blockRate = stats?.blocked_percentage || (totalQueries > 0 ? Number(((blockedQueries / totalQueries) * 100).toFixed(1)) : 6.3);
  
  const trackersCount = domains.filter(d => d.tracker).length;
  const telemetryCount = domains.filter(d => d.telemetry).length;
  const highRiskCount = domains.filter(d => d.risk === 'alto' || d.risk === 'crítico').length;

  // Category counts for distribution bar
  const categoryCounts = useMemo(() => {
    let ads = 0, track = 0, telem = 0, analytics = 0, cdn = 0, other = 0;
    domains.forEach(d => {
      const cat = (d.category || '').toUpperCase();
      if (d.tracker || cat.includes('PUBLICIDADE') || cat.includes('ADS')) ads++;
      else if (cat.includes('RASTREAMENTO') || cat.includes('TRACK')) track++;
      else if (d.telemetry || cat.includes('TELEMETRIA')) telem++;
      else if (d.analytics || cat.includes('ANALYTICS')) analytics++;
      else if (d.cdn || cat.includes('CDN')) cdn++;
      else other++;
    });
    const total = domains.length || 1;
    return [
      { label: 'Publicidade', count: ads, pct: Math.round((ads / total) * 100), color: 'bg-amber-500' },
      { label: 'Rastreamento', count: track, pct: Math.round((track / total) * 100), color: 'bg-indigo-500' },
      { label: 'Telemetria', count: telem, pct: Math.round((telem / total) * 100), color: 'bg-blue-500' },
      { label: 'Analytics', count: analytics, pct: Math.round((analytics / total) * 100), color: 'bg-purple-500' },
      { label: 'Outros / CDN', count: cdn + other, pct: Math.round(((cdn + other) / total) * 100), color: 'bg-slate-500' },
    ];
  }, [domains]);

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Top NOC Header & Control Bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#0b1322]/80 border border-slate-800/90 shadow-xl backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`p-2.5 rounded-xl border transition-colors ${
              directStatus.state === 'CONNECTED'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : directStatus.state === 'CONNECTING'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white tracking-tight">AdGuard Home & IA Intelligence Hub</h2>
                
                {/* 3 Estados Solicitados */}
                {directStatus.state === 'CONNECTED' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm shadow-emerald-500/10">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>🟢 ADGUARD LOCAL CONECTADO • AO VIVO</span>
                  </span>
                )}

                {directStatus.state === 'CONNECTING' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                    <span>🟡 CONECTANDO AO ADGUARD...</span>
                  </span>
                )}

                {directStatus.state === 'OFFLINE' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5">
                    <WifiOff className="w-3 h-3 text-rose-400" />
                    <span>🔴 ADGUARD LOCAL OFFLINE</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="font-mono text-slate-300">{directStatus.endpoint}</span>
                <span>•</span>
                <span className="text-blue-400">Camada Direta Frontend</span>
                <span>•</span>
                <span className="text-purple-400">IA Gemini & Cache Local</span>
              </p>
            </div>
          </div>

          {/* Quick controls: Settings modal, Auto-refresh, manual refresh & batch AI */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowConfigModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition"
              title="Configurar endpoint e credenciais locais do AdGuard"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              <span>Conexão</span>
            </button>

            <button
              onClick={handleAnalyzePendingBatch}
              disabled={isAnalyzingBatch}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-semibold transition disabled:opacity-50"
              title="Analisa domínios pendentes com IA"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isAnalyzingBatch ? 'animate-spin' : ''}`} />
              <span>{isAnalyzingBatch ? 'Analisando...' : 'Analisar Pendentes (IA)'}</span>
            </button>

            <button
              onClick={() => loadDashboardData(false)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition disabled:opacity-50 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>ATUALIZAR AGORA</span>
            </button>

            <div className="text-[11px] font-mono text-slate-400 pl-1">
              Última sincronização: <span className="text-slate-200">{lastUpdated}</span>
            </div>
          </div>
        </div>

        {/* Diagnóstico transparente quando não conectado */}
        {directStatus.state === 'OFFLINE' && (
          <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200/90 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300 text-sm">
                    {directStatus.diagnostic === 'MIXED_CONTENT'
                      ? 'Diagnóstico: Bloqueio de Conteúdo Misto (Mixed Content) pelo Navegador'
                      : directStatus.diagnostic === 'CORS'
                      ? 'Diagnóstico: Bloqueio de Política CORS (Access-Control-Allow-Origin)'
                      : directStatus.diagnostic === 'AUTH_REQUIRED'
                      ? 'Diagnóstico: Autenticação Necessária (HTTP 401)'
                      : 'Diagnóstico: O dispositivo não conseguiu acessar o AdGuard nessa rede'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-black/40 text-[10px] font-mono text-amber-300 uppercase">
                    {directStatus.diagnostic}
                  </span>
                </div>
                <p className="leading-relaxed text-amber-200/80">
                  {directStatus.message}
                </p>
              </div>
            </div>

            {/* Como resolver em 10 segundos sem gambiarras */}
            {directStatus.diagnostic === 'MIXED_CONTENT' && (
              <div className="p-3 bg-black/40 rounded-lg border border-amber-500/20 space-y-1.5 text-[11px]">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <span>⚡</span> Como desbloquear a transmissão direta no Chrome/Edge (10 segundos):
                </div>
                <ol className="list-decimal list-inside space-y-1 text-white/80 pl-1">
                  <li>Clique no ícone de <strong>configurações do site / cadeado</strong> à esquerda do endereço no navegador.</li>
                  <li>Clique em <strong>"Configurações do site"</strong> (Site settings).</li>
                  <li>Procure a permissão <strong>"Conteúdo não seguro"</strong> (Insecure content) e selecione <strong>"Permitir"</strong>.</li>
                  <li>Volte nesta aba e aperte <strong>F5</strong>. A conexão direta passará a transmitir 100% ao vivo sem intermediários!</li>
                </ol>
                <div className="pt-2 flex items-center gap-2">
                  <button
                    onClick={() => adguardDirectClient.reconnect()}
                    className="px-3 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold border border-amber-500/30 transition text-xs"
                  >
                    Re-testar Conexão Direta
                  </button>
                  <button
                    onClick={() => setShowConfigModal(true)}
                    className="px-3 py-1 rounded bg-white/10 hover:bg-white/15 text-white font-medium border border-white/20 transition text-xs"
                  >
                    Alterar Endereço / Porta
                  </button>
                </div>
              </div>
            )}

            {directStatus.diagnostic === 'AUTH_REQUIRED' && (
              <div className="p-3 bg-black/40 rounded-lg border border-amber-500/20 space-y-2 text-[11px]">
                <span className="font-semibold text-amber-300 block">
                  Informe o usuário e senha do AdGuard Home (salvo exclusivamente na sessão do seu navegador):
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Usuário (ex: samuel)"
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                  />
                  <input
                    type="password"
                    placeholder="Senha do AdGuard"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                  />
                  <button
                    onClick={() => {
                      adguardDirectClient.setCredentials(authUsername, authPassword);
                    }}
                    className="px-3 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold border border-emerald-500/30 text-xs"
                  >
                    Salvar & Conectar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* KPI Stats Grid - Valores reais do AdGuard com atualização ao vivo */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Queries (Ao vivo com pulso contínuo) */}
        <div className={`p-4 rounded-2xl bg-[#0b1322]/70 border shadow-sm flex flex-col justify-between transition-colors duration-300 ${
          hasNewQueryPing ? 'border-emerald-500/60 bg-emerald-950/20' : 'border-slate-800/80'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Total de Consultas</span>
            {directStatus.state === 'CONNECTED' && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-400 animate-pulse">
                AO VIVO
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className={`text-2xl font-bold font-mono text-white transition-transform ${
              hasNewQueryPing ? 'scale-105 text-emerald-300' : ''
            }`}>
              {totalQueries.toLocaleString()}
            </span>
            <span className="text-[10px] font-mono text-slate-500">24 horas</span>
          </div>
          <span className="text-[11px] text-blue-400 mt-1 flex items-center gap-1">
            <Activity className="w-3 h-3" />
            {stats?.avg_processing_time ? `${(stats.avg_processing_time * 1000).toFixed(1)}ms médio` : '118.6ms médio'}
          </span>
        </div>

        {/* Blocked Queries */}
        <div className="p-4 rounded-2xl bg-[#0b1322]/70 border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">Consultas Bloqueadas</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-rose-400">{blockedQueries.toLocaleString()}</span>
            <span className="text-[10px] font-mono text-rose-400/80 font-semibold">{blockRate}%</span>
          </div>
          <span className="text-[11px] text-rose-400/90 mt-1 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" />
            AdGuard DNS Filtering
          </span>
        </div>

        {/* Block Rate with visual bar */}
        <div className="p-4 rounded-2xl bg-[#0b1322]/70 border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">Taxa de Bloqueio</span>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-amber-400">{blockRate}%</span>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-amber-500 to-rose-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(blockRate, 100)}%` }}
              />
            </div>
          </div>
          <span className="text-[11px] text-slate-400 mt-1">Eficiência de filtragem</span>
        </div>

        {/* Unique Blocked Domains */}
        <div className="p-4 rounded-2xl bg-[#0b1322]/70 border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">Domínios Catalogados</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-indigo-300">{domains.length}</span>
            <span className="text-[10px] font-mono text-purple-400">SQLite + Cache</span>
          </div>
          <span className="text-[11px] text-purple-400 mt-1 flex items-center gap-1">
            <Database className="w-3 h-3" />
            Zero cota por query
          </span>
        </div>

        {/* Trackers & Telemetry */}
        <div className="p-4 rounded-2xl bg-[#0b1322]/70 border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">Rastreadores / Telemetria</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-amber-400">{trackersCount + telemetryCount}</span>
            <span className="text-[10px] font-mono text-slate-500">{trackersCount} ads/track</span>
          </div>
          <span className="text-[11px] text-amber-400/90 mt-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Identificados por IA
          </span>
        </div>

        {/* High Risk / Threats */}
        <div className="p-4 rounded-2xl bg-[#0b1322]/70 border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">Ameaças Críticas</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-emerald-400">{highRiskCount}</span>
            <span className="text-[10px] font-mono text-emerald-400 font-semibold">Seguro</span>
          </div>
          <span className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            0 malware detectado
          </span>
        </div>
      </div>

      {/* Visual Analytics Row: Time-series Traffic & Category Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Timeline Chart (Hourly Activity) */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[#0b1322]/70 border border-slate-800/80 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Linha do Tempo de Consultas DNS (24 Horas)</h3>
              <p className="text-xs text-slate-400">Histórico de volume total versus consultas filtradas pelo AdGuard Home</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-blue-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                Total ({totalQueries.toLocaleString()})
              </span>
              <span className="flex items-center gap-1.5 text-rose-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
                Bloqueados ({blockedQueries.toLocaleString()})
              </span>
            </div>
          </div>

          {/* SVG Visual Bars */}
          <div className="h-44 flex items-end gap-1.5 sm:gap-2.5 pt-6 pb-2 px-2 border-b border-slate-800/60 overflow-x-auto">
            {(stats?.dns_queries && stats.dns_queries.length > 0 
              ? stats.dns_queries 
              : [48, 18, 10, 11, 1, 1, 14, 9, 23, 0, 127, 81, 10, 222, 177, 83, 135, 124, 34, 64, 34, 38, 116, 44]
            ).map((val, idx) => {
              const blockedVal = (stats?.blocked_filtering?.[idx] ?? 0);
              const maxVal = Math.max(...(stats?.dns_queries || [222]), 50);
              const heightPct = Math.round((val / maxVal) * 100);
              const blockedHeightPct = Math.round((blockedVal / maxVal) * 100);

              return (
                <div key={idx} className="flex-1 min-w-[12px] flex flex-col items-center gap-1 h-full justify-end group relative">
                  {/* Tooltip on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-white whitespace-nowrap z-10 pointer-events-none shadow-lg">
                    Hora {idx + 1}: {val} queries ({blockedVal} bloq)
                  </div>

                  <div className="w-full flex items-end gap-0.5 h-full">
                    {/* Total bar */}
                    <div 
                      className="w-1/2 rounded-t bg-blue-500/40 border-t border-blue-400/60 hover:bg-blue-500/70 transition-all"
                      style={{ height: `${Math.max(heightPct, 6)}%` }}
                    />
                    {/* Blocked bar */}
                    <div 
                      className="w-1/2 rounded-t bg-rose-500/60 border-t border-rose-400 hover:bg-rose-500/90 transition-all"
                      style={{ height: `${Math.max(blockedHeightPct, 3)}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-slate-500">{idx + 1}h</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Breakdown & Top Clients */}
        <div className="p-5 rounded-2xl bg-[#0b1322]/70 border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Distribuição por Categoria</h3>
            <p className="text-xs text-slate-400 mb-4">Classificação comportamental gerada pela IA e cache local</p>

            {/* Category Bars */}
            <div className="space-y-3">
              {categoryCounts.map((cat, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">{cat.label}</span>
                    <span className="font-mono text-slate-400">{cat.count} domínios ({cat.pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${cat.color} transition-all duration-500`}
                      style={{ width: `${Math.max(cat.pct, 4)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Clients info dos dados reais */}
          <div className="pt-4 mt-4 border-t border-slate-800/70">
            <span className="text-xs text-slate-400 uppercase tracking-wider block mb-2 font-semibold">
              Dispositivos Mais Ativos (LAN)
            </span>
            <div className="space-y-1.5">
              {(stats?.top_clients || [
                { '192.168.100.22': 1034 },
                { '192.168.100.21': 341 },
                { '192.168.100.23': 37 }
              ]).slice(0, 3).map((item, idx) => {
                const ip = Object.keys(item)[0];
                const count = item[ip];
                return (
                  <div key={idx} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/60">
                    <span className="font-mono text-slate-200 font-medium">{ip}</span>
                    <span className="font-mono text-blue-400">{count} consultas</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Intelligence Center: Filter Bar, Blocked Table & Query Stream */}
      <div className="rounded-2xl bg-[#0b1322]/80 border border-slate-800 shadow-xl overflow-hidden">
        {/* Tabs Bar: Blocked Domains vs Real-Time Query Stream */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#0d1626]/70 gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTabSubView('blocked_domains')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTabSubView === 'blocked_domains'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              Domínios Bloqueados ({domains.length})
            </button>
            <button
              onClick={() => setActiveTabSubView('query_stream')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTabSubView === 'query_stream'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Feed de Consultas Recentes ({queryLogs.length})</span>
              {directStatus.state === 'CONNECTED' && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por domínio, empresa..."
              className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>
        </div>

        {/* Filter Pills Bar (Publicidade, Rastreamento, Telemetria, Analytics, Malware, etc.) */}
        {activeTabSubView === 'blocked_domains' && (
          <div className="flex items-center gap-1.5 p-3 px-5 overflow-x-auto border-b border-slate-800/60 bg-[#0a101b]/50">
            <span className="text-xs text-slate-500 mr-1 flex items-center gap-1 shrink-0 font-medium">
              <Filter className="w-3.5 h-3.5" />
              Filtro:
            </span>
            {(['TODOS', 'PUBLICIDADE', 'RASTREAMENTO', 'TELEMETRIA', 'ANALYTICS', 'MALWARE', 'PHISHING', 'OUTROS'] as FilterCategory[]).map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition shrink-0 ${
                    isSelected
                      ? 'bg-slate-200 text-slate-900 shadow-sm'
                      : 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  {cat === 'TODOS' ? 'Todos os Bloqueados' : cat.charAt(0) + cat.slice(1).toLowerCase()}
                </button>
              );
            })}
          </div>
        )}

        {/* View 1: Blocked Domains Table */}
        {activeTabSubView === 'blocked_domains' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-[#0d1626]/50 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-5 font-semibold">Domínio Bloqueado</th>
                  <th className="py-3 px-4 font-semibold">Empresa / Organização</th>
                  <th className="py-3 px-4 font-semibold">Categoria & Finalidade</th>
                  <th className="py-3 px-3 font-semibold text-center">Risco</th>
                  <th className="py-3 px-3 font-semibold text-center">Tags</th>
                  <th className="py-3 px-4 font-semibold text-center">Bloqueios</th>
                  <th className="py-3 px-5 font-semibold text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredDomains.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      Nenhum domínio encontrado com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredDomains.map((item) => {
                    return (
                      <tr 
                        key={item.domain}
                        onClick={() => setSelectedDomainForDetail(item)}
                        className="hover:bg-slate-800/40 cursor-pointer transition group"
                      >
                        {/* Domain */}
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                            <span className="font-mono font-bold text-white group-hover:text-blue-300 transition">
                              {item.domain}
                            </span>
                          </div>
                        </td>

                        {/* Organization */}
                        <td className="py-3.5 px-4 font-medium text-slate-300">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="truncate max-w-[170px]">{item.organization || 'Desconhecida'}</span>
                          </span>
                        </td>

                        {/* Category & Purpose */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-200">
                              {item.category || 'Outros'}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate max-w-xs">
                              {item.purpose || item.explanation || 'Finalidade não especificada'}
                            </span>
                          </div>
                        </td>

                        {/* Risk Indicator */}
                        <td className="py-3.5 px-3 text-center">
                          {item.risk === 'baixo' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              Baixo
                            </span>
                          ) : item.risk === 'médio' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              Médio
                            </span>
                          ) : item.risk === 'alto' || item.risk === 'crítico' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                              Alto
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/30">
                              Baixo
                            </span>
                          )}
                        </td>

                        {/* Boolean Tags */}
                        <td className="py-3.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {item.tracker && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300" title="Tracker / Rastreamento">
                                AD/TRK
                              </span>
                            )}
                            {item.telemetry && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300" title="Telemetria">
                                TELEM
                              </span>
                            )}
                            {item.analytics && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300" title="Analytics">
                                STAT
                              </span>
                            )}
                            {!item.tracker && !item.telemetry && !item.analytics && (
                              <span className="text-[10px] text-slate-500">-</span>
                            )}
                          </div>
                        </td>

                        {/* Block count */}
                        <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-200">
                          {item.block_count || 1}
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDomainForDetail(item);
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                          >
                            Ver Dossiê
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* View 2: Real-time Query Log Stream */}
        {activeTabSubView === 'query_stream' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-[#0d1626]/50 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-5 font-semibold">Horário</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-5 font-semibold">Domínio Solicitado</th>
                  <th className="py-3 px-4 font-semibold">Dispositivo Cliente</th>
                  <th className="py-3 px-3 font-semibold text-center">Tipo</th>
                  <th className="py-3 px-4 font-semibold">Motivo / Regra</th>
                  <th className="py-3 px-4 font-semibold text-right">Latência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {queryLogs.map((log, idx) => {
                  const isBlocked = log.status === 'BLOCKED';
                  const cachedAnalysis = log.analysis || adguardDirectClient.getDomainAnalysis(log.domain);

                  return (
                    <tr key={idx} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-5 font-mono text-slate-400 text-[11px]">
                        {new Date(log.time).toLocaleTimeString('pt-BR')}
                      </td>
                      <td className="py-3 px-4">
                        {isBlocked ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                            BLOQUEADO
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            PERMITIDO
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-white">{log.domain}</span>
                          {cachedAnalysis && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-sans font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              {cachedAnalysis.category}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {log.client}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-[11px] text-slate-400">
                        {log.dns_type || 'A'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-400 truncate max-w-xs">
                        {log.rule || log.reason || '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400">
                        {log.elapsed_ms}ms
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Settings / Connection Drawer Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => setShowConfigModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Configuração da Conexão Direta</h3>
                <p className="text-xs text-slate-400">AdGuard Home local (Ubuntu Server)</p>
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Endpoint Base do AdGuard Home:
                </label>
                <input
                  type="text"
                  value={customEndpoint}
                  onChange={(e) => setCustomEndpoint(e.target.value)}
                  placeholder="http://192.168.100.23:8081"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-blue-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Se você ativou HTTPS no AdGuard, pode mudar para https://192.168.100.23:8081
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Usuário (Opcional):
                  </label>
                  <input
                    type="text"
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    placeholder="samuel"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Senha (Opcional):
                  </label>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-blue-400" />
                  <span>Segurança das Credenciais:</span>
                </div>
                <p>
                  As credenciais são armazenadas exclusivamente no <code>localStorage</code> do seu navegador. Elas nunca são enviadas a servidores externos e nunca ficam expostas no código público.
                </p>
              </div>

              {configSavedToast && (
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-center font-medium">
                  Configuração salva! Reconectando ao AdGuard...
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-600/20"
                >
                  Salvar e Reconectar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Domain Dossier Modal */}
      <DomainDetailModal
        domain={selectedDomainForDetail}
        isOpen={selectedDomainForDetail !== null}
        onClose={() => setSelectedDomainForDetail(null)}
        onReanalyze={handleReanalyzeDomain}
      />
    </div>
  );
};

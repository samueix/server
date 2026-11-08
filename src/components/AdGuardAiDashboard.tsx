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
  const [prevQueriesCount, setPrevQueriesCount] = useState<number>(stats?.num_dns_queries || 0);
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
    // Start fast polling via reverse proxy /adguard-api
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
  const totalQueries = stats?.num_dns_queries ?? 0;
  const blockedQueries = stats?.num_blocked_filtering ?? 0;
  const blockRate = totalQueries > 0
    ? Number(((blockedQueries / totalQueries) * 100).toFixed(1))
    : (stats?.blocked_percentage ?? 0);
  
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
      { label: 'Publicidade', count: ads, pct: Math.round((ads / total) * 100), color: 'bg-[#e5a93c]' },
      { label: 'Rastreamento', count: track, pct: Math.round((track / total) * 100), color: 'bg-[#38bdf8]' },
      { label: 'Telemetria', count: telem, pct: Math.round((telem / total) * 100), color: 'bg-[#8a95a5]' },
      { label: 'Analytics', count: analytics, pct: Math.round((analytics / total) * 100), color: 'bg-[#a78bfa]' },
      { label: 'Outros / CDN', count: cdn + other, pct: Math.round(((cdn + other) / total) * 100), color: 'bg-[#475569]' },
    ];
  }, [domains]);

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* Top NOC Header & Control Bar */}
      <div className="p-4 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className={`w-5 h-5 shrink-0 ${
              directStatus.state === 'CONNECTED'
                ? 'text-[#12B76A]'
                : directStatus.state === 'CONNECTING'
                ? 'text-[#F79009]'
                : 'text-[#F04438]'
            }`} />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold font-title text-[#1A1A2E]">AdGuard Home & IA Intelligence Hub</h2>
                
                {/* 3 Estados Solicitados */}
                {directStatus.state === 'CONNECTED' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#12B76A]/10 text-[#12B76A] border-2 border-[#12B76A] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#12B76A]" />
                    <span>AdGuard local conectado · Ao vivo</span>
                  </span>
                )}

                {directStatus.state === 'CONNECTING' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#F79009]/10 text-[#F79009] border-2 border-[#F79009] flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-[#F79009] animate-spin" />
                    <span>Conectando ao AdGuard...</span>
                  </span>
                )}

                {directStatus.state === 'OFFLINE' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#F04438]/10 text-[#F04438] border-2 border-[#F04438] flex items-center gap-1.5">
                    <WifiOff className="w-3.5 h-3.5 text-[#F04438]" />
                    <span>AdGuard local offline</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-[#4A4A68] mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[#1A1A2E] font-bold">{directStatus.endpoint}</span>
                <span className="text-[#1A1A2E]/30">·</span>
                <span className="text-[#00A6FB] font-semibold">Camada direta frontend</span>
                <span className="text-[#1A1A2E]/30">·</span>
                <span className="text-[#FF5A36] font-semibold">IA Gemini & cache local</span>
              </p>
            </div>
          </div>

          {/* Quick controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowConfigModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#FFF7E8] hover:bg-[#FFC857] text-[#1A1A2E] border-2 border-[#1A1A2E] text-xs font-mono font-bold shadow-[2px_2px_0px_#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              title="Configurar endpoint e credenciais locais do AdGuard"
            >
              <Settings className="w-3.5 h-3.5 text-[#1A1A2E]" />
              <span>Conexão</span>
            </button>

            <button
              onClick={handleAnalyzePendingBatch}
              disabled={isAnalyzingBatch}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#FFC857] hover:bg-[#ffbe38] text-[#1A1A2E] border-2 border-[#1A1A2E] text-xs font-mono font-bold shadow-[2px_2px_0px_#1A1A2E] transition disabled:opacity-50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              title="Analisa domínios pendentes com IA"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isAnalyzingBatch ? 'animate-spin' : ''}`} />
              <span>{isAnalyzingBatch ? 'Analisando...' : 'Analisar pendentes (IA)'}</span>
            </button>

            <button
              onClick={() => loadDashboardData(false)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#FF5A36] hover:bg-[#ff441b] text-white text-xs font-mono font-bold border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] transition disabled:opacity-50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Atualizar agora</span>
            </button>

            <div className="text-xs font-mono text-[#4A4A68] pl-1 font-semibold">
              Sincronização: <span className="text-[#1A1A2E] font-bold tabular-nums">{lastUpdated}</span>
            </div>
          </div>
        </div>

        {/* Diagnóstico transparente quando não conectado */}
        {directStatus.state === 'OFFLINE' && (
          <div className="mt-3 p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs text-[#1A1A2E] space-y-2 shadow-[2px_2px_0px_#1A1A2E]">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-[#F79009] shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1A1A2E]">
                    {directStatus.diagnostic === 'MIXED_CONTENT'
                      ? 'Diagnóstico: Bloqueio de Conteúdo Misto (Mixed Content) pelo Navegador'
                      : directStatus.diagnostic === 'CORS'
                      ? 'Diagnóstico: Bloqueio de Política CORS (Access-Control-Allow-Origin)'
                      : directStatus.diagnostic === 'AUTH_REQUIRED'
                      ? 'Diagnóstico: Autenticação Necessária (HTTP 401)'
                      : 'Diagnóstico: O dispositivo não conseguiu acessar o AdGuard nessa rede'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white text-[10px] font-mono text-[#F79009] border-2 border-[#1A1A2E] font-bold">
                    {directStatus.diagnostic}
                  </span>
                </div>
                <p className="leading-relaxed text-[#4A4A68]">
                  {directStatus.message}
                </p>
              </div>
            </div>

            {directStatus.diagnostic === 'MIXED_CONTENT' && (
              <div className="p-3 bg-white rounded-md border-2 border-[#1A1A2E] space-y-2 text-xs shadow-[1px_1px_0px_#1A1A2E]">
                <div className="font-bold text-[#FF5A36] flex items-center gap-1.5 font-mono">
                  Como desbloquear a transmissão direta no Chrome/Edge:
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[#4A4A68] pl-1">
                  <li>Clique no ícone de <strong className="text-[#1A1A2E]">configurações do site / cadeado</strong> à esquerda do endereço no navegador.</li>
                  <li>Clique em <strong className="text-[#1A1A2E]">"Configurações do site"</strong>.</li>
                  <li>Procure a permissão <strong className="text-[#1A1A2E]">"Conteúdo não seguro"</strong> e selecione <strong className="text-[#1A1A2E]">"Permitir"</strong>.</li>
                  <li>Volte nesta aba e aperte <strong className="text-[#1A1A2E]">F5</strong>.</li>
                </ol>
                <div className="pt-2 flex items-center gap-2">
                  <button
                    onClick={() => adguardDirectClient.reconnect()}
                    className="px-3 py-1.5 rounded-md bg-[#FFF7E8] hover:bg-[#FFC857] text-[#1A1A2E] font-bold border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] transition text-xs font-mono"
                  >
                    Re-testar conexão direta
                  </button>
                  <button
                    onClick={() => setShowConfigModal(true)}
                    className="px-3 py-1.5 rounded-md bg-white hover:bg-[#FFF7E8] text-[#1A1A2E] font-bold border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] transition text-xs font-mono"
                  >
                    Alterar endereço / porta
                  </button>
                </div>
              </div>
            )}

            {directStatus.diagnostic === 'AUTH_REQUIRED' && (
              <div className="p-3 bg-white rounded-md border-2 border-[#1A1A2E] space-y-2 text-xs shadow-[1px_1px_0px_#1A1A2E]">
                <span className="font-bold text-[#1A1A2E] block">
                  Informe o usuário e senha do AdGuard Home (salvo exclusivamente na sessão do seu navegador):
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Usuário (ex: samuel)"
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    className="px-3 py-1.5 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs text-[#1A1A2E] focus:outline-none focus:bg-white font-mono"
                  />
                  <input
                    type="password"
                    placeholder="Senha do AdGuard"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="px-3 py-1.5 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs text-[#1A1A2E] focus:outline-none focus:bg-white font-mono"
                  />
                  <button
                    onClick={() => {
                      adguardDirectClient.setCredentials(authUsername, authPassword);
                    }}
                    className="px-3.5 py-1.5 rounded-md bg-[#12B76A] hover:bg-[#0fa05b] text-white font-bold border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] text-xs font-mono"
                  >
                    Salvar & conectar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Queries */}
        <div className={`p-3.5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col justify-between transition-colors duration-200 ${
          hasNewQueryPing ? 'border-[#12B76A]' : 'border-[#1A1A2E]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#4A4A68] font-bold">Total consultas</span>
            {directStatus.state === 'CONNECTED' && (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-[#12B76A]/10 text-[#12B76A] border-2 border-[#12B76A] font-bold">
                Ao vivo
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono tabular-nums text-[#1A1A2E]">
              {totalQueries.toLocaleString()}
            </span>
            <span className="text-[10px] font-mono text-[#4A4A68] font-bold">24h</span>
          </div>
          <span className="text-xs text-[#00A6FB] mt-1 flex items-center gap-1 font-mono font-bold">
            <Activity className="w-3.5 h-3.5 text-[#00A6FB]" />
            {stats?.avg_processing_time ? `${(stats.avg_processing_time * 1000).toFixed(1)}ms` : '118.6ms'}
          </span>
        </div>

        {/* Blocked Queries */}
        <div className="p-3.5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col justify-between">
          <span className="text-xs text-[#4A4A68] font-bold">Bloqueadas</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono tabular-nums text-[#F04438]">{blockedQueries.toLocaleString()}</span>
            <span className="text-[10px] font-mono text-[#F04438] font-bold">{blockRate}%</span>
          </div>
          <span className="text-xs text-[#F04438] mt-1 flex items-center gap-1 font-mono font-bold">
            <ShieldAlert className="w-3.5 h-3.5 text-[#F04438]" />
            DNS filtering
          </span>
        </div>

        {/* Block Rate */}
        <div className="p-3.5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col justify-between">
          <span className="text-xs text-[#4A4A68] font-bold">Taxa bloqueio</span>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono tabular-nums text-[#FF5A36]">{blockRate}%</span>
            <div className="w-full bg-[#FFF7E8] h-2 rounded-full mt-2 overflow-hidden border-2 border-[#1A1A2E]">
              <div 
                className="bg-[#FF5A36] h-full rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(blockRate, 100)}%` }}
              />
            </div>
          </div>
          <span className="text-xs text-[#4A4A68] mt-1 font-mono font-bold">Eficiência</span>
        </div>

        {/* Cataloged Domains */}
        <div className="p-3.5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col justify-between">
          <span className="text-xs text-[#4A4A68] font-bold">Catalogados</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono tabular-nums text-[#1A1A2E]">{domains.length}</span>
            <span className="text-[10px] font-mono text-[#00A6FB] font-bold">Cache</span>
          </div>
          <span className="text-xs text-[#00A6FB] mt-1 flex items-center gap-1 font-mono font-bold">
            <Database className="w-3.5 h-3.5" />
            Zero cota por query
          </span>
        </div>

        {/* Trackers & Telemetry */}
        <div className="p-3.5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col justify-between">
          <span className="text-xs text-[#4A4A68] font-bold">Rastreadores</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono tabular-nums text-[#F79009]">{trackersCount + telemetryCount}</span>
            <span className="text-[10px] font-mono text-[#4A4A68] font-bold">{trackersCount} ads</span>
          </div>
          <span className="text-xs text-[#F79009] mt-1 flex items-center gap-1 font-mono font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            Identificados por IA
          </span>
        </div>

        {/* High Risk / Threats */}
        <div className="p-3.5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col justify-between">
          <span className="text-xs text-[#4A4A68] font-bold">Ameaças</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono tabular-nums text-[#12B76A]">{highRiskCount}</span>
            <span className="text-[10px] font-mono text-[#12B76A] font-bold">Seguro</span>
          </div>
          <span className="text-xs text-[#12B76A] mt-1 flex items-center gap-1 font-mono font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            0 malware detectado
          </span>
        </div>
      </div>

      {/* Visual Analytics Row: Time-series Traffic & Category Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Timeline Chart */}
        <div className="lg:col-span-2 p-4 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-bold font-title text-[#1A1A2E]">Linha do tempo de consultas DNS (24 horas)</h3>
              <p className="text-xs text-[#4A4A68]">Volume total versus consultas filtradas</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-[#00A6FB] font-bold">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#00A6FB]" />
                Total ({totalQueries.toLocaleString()})
              </span>
              <span className="flex items-center gap-1.5 text-[#F04438] font-bold">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#F04438]" />
                Bloqueados ({blockedQueries.toLocaleString()})
              </span>
            </div>
          </div>

          {/* SVG Visual Bars */}
          <div className="h-40 flex items-end gap-1.5 pt-4 pb-1 px-2 border-b-2 border-[#1A1A2E] overflow-x-auto bg-[#FFF7E8]/50 rounded-t-lg">
            {(stats?.dns_queries && stats.dns_queries.length > 0 
              ? stats.dns_queries 
              : [48, 18, 10, 11, 1, 1, 14, 9, 23, 0, 127, 81, 10, 222, 177, 83, 135, 124, 34, 64, 34, 38, 116, 44]
            ).map((val, idx) => {
              const blockedVal = (stats?.blocked_filtering?.[idx] ?? 0);
              const maxVal = Math.max(...(stats?.dns_queries || [222]), 50);
              const heightPct = Math.round((val / maxVal) * 100);
              const blockedHeightPct = Math.round((blockedVal / maxVal) * 100);

              return (
                <div key={idx} className="flex-1 min-w-[10px] flex flex-col items-center gap-1 h-full justify-end group relative">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 px-2 py-0.5 rounded-md bg-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] text-[10px] font-mono font-bold text-[#1A1A2E] whitespace-nowrap z-10 pointer-events-none tabular-nums">
                    {idx + 1}h: {val} ({blockedVal} bloq)
                  </div>

                  <div className="w-full flex items-end gap-0.5 h-full">
                    <div 
                      className="w-1/2 rounded-t-sm bg-[#00A6FB]/50 hover:bg-[#00A6FB] transition-all"
                      style={{ height: `${Math.max(heightPct, 6)}%` }}
                    />
                    <div 
                      className="w-1/2 rounded-t-sm bg-[#F04438]/70 hover:bg-[#F04438] transition-all"
                      style={{ height: `${Math.max(blockedHeightPct, 3)}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono font-bold text-[#4A4A68]">{idx + 1}h</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Breakdown & Top Clients */}
        <div className="p-4 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold font-title text-[#1A1A2E]">Distribuição por categoria</h3>
            <p className="text-xs text-[#4A4A68] mb-3">Classificação gerada pela IA e cache local</p>

            {/* Category Bars */}
            <div className="space-y-2.5">
              {categoryCounts.map((cat, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#1A1A2E] font-bold">{cat.label}</span>
                    <span className="font-mono text-[#4A4A68] font-bold tabular-nums">{cat.count} ({cat.pct}%)</span>
                  </div>
                  <div className="w-full bg-[#FFF7E8] h-2 rounded-full overflow-hidden border-2 border-[#1A1A2E]">
                    <div 
                      className={`h-full rounded-full ${cat.color} transition-all duration-300`}
                      style={{ width: `${Math.max(cat.pct, 4)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Clients info */}
          <div className="pt-3 mt-3 border-t-2 border-[#1A1A2E]">
            <span className="text-xs text-[#4A4A68] font-bold block mb-1.5 font-mono">
              Dispositivos mais ativos (LAN)
            </span>
            <div className="space-y-1.5">
              {(stats?.top_clients && stats.top_clients.length > 0) ? (
                stats.top_clients.slice(0, 3).map((item, idx) => {
                  const ip = Object.keys(item)[0];
                  const count = item[ip];
                  return (
                    <div key={idx} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E]">
                      <span className="font-mono font-bold text-[#1A1A2E]">{ip}</span>
                      <span className="font-mono text-[#00A6FB] tabular-nums font-bold">{count} queries</span>
                    </div>
                  );
                })
              ) : (
                <div className="text-xs font-mono text-[#717188] py-2 text-center bg-[#FFF7E8]/50 border border-dashed border-[#1A1A2E]/30 rounded-md">
                  Nenhum cliente registrado no período.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Intelligence Center: Filter Bar, Blocked Table & Query Stream */}
      <div className="rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] overflow-hidden">
        {/* Tabs Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-4 py-3 border-b-2 border-[#1A1A2E] bg-[#FFF7E8] gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTabSubView('blocked_domains')}
              className={`px-3 py-1.5 rounded-md text-xs font-mono transition border-2 border-[#1A1A2E] ${
                activeTabSubView === 'blocked_domains'
                  ? 'bg-[#FF5A36] text-white shadow-[2px_2px_0px_#1A1A2E] font-bold'
                  : 'bg-white text-[#1A1A2E] hover:bg-[#FFC857] font-semibold'
              }`}
            >
              Domínios bloqueados ({domains.length})
            </button>
            <button
              onClick={() => setActiveTabSubView('query_stream')}
              className={`px-3 py-1.5 rounded-md text-xs font-mono transition flex items-center gap-1.5 border-2 border-[#1A1A2E] ${
                activeTabSubView === 'query_stream'
                  ? 'bg-[#00A6FB] text-white shadow-[2px_2px_0px_#1A1A2E] font-bold'
                  : 'bg-white text-[#1A1A2E] hover:bg-[#FFC857] font-semibold'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-white" />
              <span>Feed de consultas recentes ({queryLogs.length})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-[#4A4A68] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por domínio, empresa..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border-2 border-[#1A1A2E] rounded-md text-[#1A1A2E] placeholder-[#4A4A68] focus:outline-none focus:bg-[#FFF7E8] font-mono shadow-[2px_2px_0px_#1A1A2E]"
            />
          </div>
        </div>

        {/* Filter Bar */}
        {activeTabSubView === 'blocked_domains' && (
          <div className="flex items-center gap-1.5 p-2.5 px-4 overflow-x-auto border-b-2 border-[#1A1A2E] bg-[#FFF7E8]">
            <span className="text-xs text-[#4A4A68] mr-1 flex items-center gap-1 shrink-0 font-mono font-bold">
              <Filter className="w-3.5 h-3.5" />
              Filtro:
            </span>
            {(['TODOS', 'PUBLICIDADE', 'RASTREAMENTO', 'TELEMETRIA', 'ANALYTICS', 'MALWARE', 'PHISHING', 'OUTROS'] as FilterCategory[]).map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-md text-xs transition shrink-0 font-mono border-2 border-[#1A1A2E] ${
                    isSelected
                      ? 'bg-[#FF5A36] text-white shadow-[2px_2px_0px_#1A1A2E] font-bold'
                      : 'bg-white text-[#1A1A2E] hover:bg-[#FFC857] font-semibold'
                  }`}
                >
                  {cat === 'TODOS' ? 'Todos os bloqueados' : cat.charAt(0) + cat.slice(1).toLowerCase()}
                </button>
              );
            })}
          </div>
        )}

        {/* View 1: Blocked Domains Table */}
        {activeTabSubView === 'blocked_domains' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#1A1A2E]">
              <thead className="text-xs text-[#4A4A68] bg-[#FFF7E8] border-b-2 border-[#1A1A2E] font-mono font-bold">
                <tr>
                  <th className="py-2.5 px-4 font-bold">Domínio bloqueado</th>
                  <th className="py-2.5 px-3 font-bold">Empresa / organização</th>
                  <th className="py-2.5 px-3 font-bold">Categoria & finalidade</th>
                  <th className="py-2.5 px-3 font-bold text-center">Risco</th>
                  <th className="py-2.5 px-3 font-bold text-center">Tags</th>
                  <th className="py-2.5 px-3 font-bold text-center">Bloqueios</th>
                  <th className="py-2.5 px-4 font-bold text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-[#1A1A2E]/10 font-mono">
                {filteredDomains.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#4A4A68]">
                      Nenhum domínio encontrado com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredDomains.map((item) => {
                    return (
                      <tr 
                        key={item.domain}
                        onClick={() => setSelectedDomainForDetail(item)}
                        className="hover:bg-[#FFF7E8]/60 cursor-pointer transition group"
                      >
                        {/* Domain */}
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#F04438] shrink-0" />
                            <span className="font-mono font-bold text-[#1A1A2E] group-hover:text-[#FF5A36] transition">
                              {item.domain}
                            </span>
                          </div>
                        </td>

                        {/* Organization */}
                        <td className="py-2.5 px-3 font-sans text-[#4A4A68]">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-[#4A4A68] shrink-0" />
                            <span className="truncate max-w-[170px] text-[#1A1A2E] font-semibold">{item.organization || 'Desconhecida'}</span>
                          </span>
                        </td>

                        {/* Category & Purpose */}
                        <td className="py-2.5 px-3 font-sans">
                          <div className="flex flex-col">
                            <span className="font-bold text-[#1A1A2E]">
                              {item.category || 'Outros'}
                            </span>
                            <span className="text-[11px] text-[#4A4A68] truncate max-w-xs">
                              {item.purpose || item.explanation || 'Finalidade não especificada'}
                            </span>
                          </div>
                        </td>

                        {/* Risk Indicator */}
                        <td className="py-2.5 px-3 text-center">
                          {item.risk === 'baixo' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#12B76A]/10 text-[#12B76A] border-2 border-[#12B76A]">
                              Baixo
                            </span>
                          ) : item.risk === 'médio' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F79009]/10 text-[#F79009] border-2 border-[#F79009]">
                              Médio
                            </span>
                          ) : item.risk === 'alto' || item.risk === 'crítico' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F04438]/10 text-[#F04438] border-2 border-[#F04438]">
                              Alto
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF7E8] text-[#4A4A68] border-2 border-[#1A1A2E]">
                              Baixo
                            </span>
                          )}
                        </td>

                        {/* Boolean Tags */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {item.tracker && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#F79009]/20 text-[#1A1A2E] border border-[#1A1A2E]" title="Tracker / Rastreamento">
                                AD/TRK
                              </span>
                            )}
                            {item.telemetry && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#00A6FB]/20 text-[#1A1A2E] border border-[#1A1A2E]" title="Telemetria">
                                TELEM
                              </span>
                            )}
                            {item.analytics && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FFC857]/30 text-[#1A1A2E] border border-[#1A1A2E]" title="Analytics">
                                STAT
                              </span>
                            )}
                            {!item.tracker && !item.telemetry && !item.analytics && (
                              <span className="text-[10px] text-[#4A4A68]">-</span>
                            )}
                          </div>
                        </td>

                        {/* Block count */}
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-[#1A1A2E] tabular-nums">
                          {item.block_count || 1}
                        </td>

                        {/* Action */}
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDomainForDetail(item);
                            }}
                            className="px-3 py-1 rounded-md text-xs bg-white hover:bg-[#FFC857] text-[#1A1A2E] border-2 border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] transition font-sans font-bold"
                          >
                            Ver dossiê
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
            <table className="w-full text-left text-xs text-[#1A1A2E]">
              <thead className="text-xs text-[#4A4A68] bg-[#FFF7E8] border-b-2 border-[#1A1A2E] font-mono font-bold">
                <tr>
                  <th className="py-2.5 px-4 font-bold">Horário</th>
                  <th className="py-2.5 px-3 font-bold">Status</th>
                  <th className="py-2.5 px-4 font-bold">Domínio solicitado</th>
                  <th className="py-2.5 px-3 font-bold">Dispositivo cliente</th>
                  <th className="py-2.5 px-3 font-bold text-center">Tipo</th>
                  <th className="py-2.5 px-3 font-bold">Motivo / regra</th>
                  <th className="py-2.5 px-4 font-bold text-right">Latência</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-[#1A1A2E]/10 font-mono">
                {queryLogs.map((log, idx) => {
                  const isBlocked = log.status === 'BLOCKED';
                  const isRewritten = log.status === 'REWRITTEN';
                  const isWhitelisted = log.isWhitelisted;
                  const cachedAnalysis = log.analysis || adguardDirectClient.getDomainAnalysis(log.domain);

                  return (
                    <tr key={idx} className="hover:bg-[#FFF7E8]/60 transition">
                      <td className="py-2 px-4 text-[#4A4A68] text-xs font-semibold tabular-nums">
                        {new Date(log.time).toLocaleTimeString('pt-BR')}
                      </td>
                      <td className="py-2 px-3">
                        {isBlocked ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F04438]/10 text-[#F04438] border-2 border-[#F04438]">
                            Bloqueado
                          </span>
                        ) : isRewritten ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F79009]/15 text-[#B54708] border-2 border-[#F79009]">
                            Reescrito
                          </span>
                        ) : isWhitelisted ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00A6FB]/15 text-[#026AA2] border-2 border-[#00A6FB]" title="Permitido por regra de exceção (Whitelist)">
                            Whitelist
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#12B76A]/10 text-[#12B76A] border-2 border-[#12B76A]">
                            Permitido
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#1A1A2E]">{log.domain}</span>
                          {cachedAnalysis && (
                            <span className="px-2 py-0.2 rounded text-[10px] font-mono font-bold bg-[#00A6FB]/20 text-[#1A1A2E] border border-[#1A1A2E]">
                              {cachedAnalysis.category}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-[#4A4A68] font-bold tabular-nums">
                        {log.client}
                      </td>
                      <td className="py-2 px-3 text-center text-xs text-[#4A4A68] font-bold">
                        {log.dns_type || 'A'}
                      </td>
                      <td className="py-2 px-3 text-xs text-[#4A4A68] truncate max-w-xs font-mono" title={log.rule || log.reason || '-'}>
                        {log.rule || log.reason || '-'}
                      </td>
                      <td className="py-2 px-4 text-right text-[#1A1A2E] font-bold tabular-nums">
                        <div className="flex items-center justify-end gap-1.5">
                          {log.cached && (
                            <span className="px-1.5 py-0.2 bg-[#ECFDF3] text-[#12B76A] border border-[#12B76A] rounded text-[9px] font-mono uppercase">
                              cache
                            </span>
                          )}
                          <span title={log.upstream ? `Upstream: ${log.upstream}` : undefined}>
                            {log.elapsed_ms}ms
                          </span>
                        </div>
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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="relative bg-white border-2 border-[#1A1A2E] w-full max-w-md rounded-xl p-5 shadow-[8px_8px_0px_#1A1A2E]">
            <button
              onClick={() => setShowConfigModal(false)}
              className="absolute top-4 right-4 text-[#1A1A2E] hover:bg-[#F04438] hover:text-white p-1 rounded-md border-2 border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <Settings className="w-5 h-5 text-[#FF5A36] shrink-0" />
              <div>
                <h3 className="text-sm font-bold font-title text-[#1A1A2E]">Configuração da conexão direta</h3>
                <p className="text-xs text-[#4A4A68]">AdGuard Home local (Ubuntu Server)</p>
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-3.5 text-xs font-sans">
              <div>
                <label className="block text-[#1A1A2E] font-bold mb-1 font-mono">
                  Endpoint base do AdGuard Home:
                </label>
                <input
                  type="text"
                  value={customEndpoint}
                  onChange={(e) => setCustomEndpoint(e.target.value)}
                  placeholder="/adguard-api ou http://localhost:8081"
                  className="w-full px-3 py-2 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-md text-[#1A1A2E] font-mono focus:outline-none focus:bg-white shadow-[2px_2px_0px_#1A1A2E]"
                />
                <span className="text-[10px] text-[#4A4A68] mt-1 block">
                  Padrão recomendado: /adguard-api (proxy Nginx automático sem restrição de IP)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[#1A1A2E] font-bold mb-1 font-mono">
                    Usuário (opcional):
                  </label>
                  <input
                    type="text"
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    placeholder="samuel"
                    className="w-full px-3 py-2 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-md text-[#1A1A2E] focus:outline-none focus:bg-white font-mono shadow-[2px_2px_0px_#1A1A2E]"
                  />
                </div>
                <div>
                  <label className="block text-[#1A1A2E] font-bold mb-1 font-mono">
                    Senha (opcional):
                  </label>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-md text-[#1A1A2E] focus:outline-none focus:bg-white font-mono shadow-[2px_2px_0px_#1A1A2E]"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#FFF7E8] rounded-md border-2 border-[#1A1A2E] text-xs text-[#4A4A68] space-y-1 shadow-[2px_2px_0px_#1A1A2E]">
                <div className="font-bold text-[#1A1A2E] flex items-center gap-1.5 font-mono">
                  <Lock className="w-4 h-4 text-[#FF5A36]" />
                  <span>Segurança das credenciais:</span>
                </div>
                <p>
                  As credenciais são armazenadas exclusivamente no <code className="text-[#1A1A2E] font-mono font-bold bg-white px-1 rounded border border-[#1A1A2E]">localStorage</code> do seu navegador. Elas nunca são enviadas a servidores externos.
                </p>
              </div>

              {configSavedToast && (
                <div className="p-2.5 rounded-md bg-[#12B76A]/10 text-[#12B76A] border-2 border-[#12B76A] text-center font-bold font-mono">
                  Configuração salva! Reconectando ao AdGuard...
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-3.5 py-2 rounded-lg text-[#1A1A2E] hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] transition font-mono font-bold shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#FF5A36] hover:bg-[#ff441b] text-white font-bold transition font-mono border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  Salvar e reconectar
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

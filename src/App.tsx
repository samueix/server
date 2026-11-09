import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OfflineBanner } from './components/OfflineBanner';
import { AlertBanner, ActiveAlert } from './components/AlertBanner';
import { SettingsModal } from './components/SettingsModal';
import { CodeViewerModal } from './components/CodeViewerModal';
import { SecurityVaultProvider } from './context/SecurityVaultContext';
import { SecurityUnlockModal } from './components/SecurityUnlockModal';

import { OverviewTab } from './components/tabs/OverviewTab';
const MonitoringTab = React.lazy(() => import('./components/tabs/MonitoringTab').then(m => ({ default: m.MonitoringTab })));
const ProcessesTab = React.lazy(() => import('./components/tabs/ProcessesTab').then(m => ({ default: m.ProcessesTab })));
const ServicesTab = React.lazy(() => import('./components/tabs/ServicesTab').then(m => ({ default: m.ServicesTab })));
const NetworkTab = React.lazy(() => import('./components/tabs/NetworkTab').then(m => ({ default: m.NetworkTab })));
const CommandsTab = React.lazy(() => import('./components/tabs/CommandsTab').then(m => ({ default: m.CommandsTab })));
const SystemTab = React.lazy(() => import('./components/tabs/SystemTab').then(m => ({ default: m.SystemTab })));
const AdGuardHomeTab = React.lazy(() => import('./components/tabs/AdGuardHomeTab').then(m => ({ default: m.AdGuardHomeTab })));
const DocumentationTab = React.lazy(() => import('./components/tabs/DocumentationTab').then(m => ({ default: m.DocumentationTab })));
const PingTab = React.lazy(() => import('./components/tabs/PingTab').then(m => ({ default: m.PingTab })));
const LogsTab = React.lazy(() => import('./components/tabs/LogsTab').then(m => ({ default: m.LogsTab })));
const N8nTab = React.lazy(() => import('./components/tabs/N8nTab').then(m => ({ default: m.N8nTab })));
const FilesTab = React.lazy(() => import('./components/tabs/FilesTab').then(m => ({ default: m.FilesTab })));
const SecurityTab = React.lazy(() => import('./components/tabs/SecurityTab').then(m => ({ default: m.SecurityTab })));
const CredentialsTab = React.lazy(() => import('./components/tabs/CredentialsTab').then(m => ({ default: m.CredentialsTab })));
const AntigravityTab = React.lazy(() => import('./components/tabs/AntigravityTab').then(m => ({ default: m.AntigravityTab })));

import { LoginScreen } from './components/LoginScreen';
import { LogoutModal } from './components/LogoutModal';
import { getStoredAuth, saveAuthSession, clearAuthSession, AuthSession } from './services/authService';

import { 
  NavigationTab, 
  ConnectionStatus, 
  ApiServerResponse, 
  ApiStatusResponse, 
  ApiTemperatureResponse,
  ProcessItem, 
  ServiceItem, 
  HistoryPoint,
  AlertHistoryItem
} from './types';
import { apiService, NetworkTelemetry } from './services/api';
import { loadConfig, SERVER_IPV4 } from './config';

class TabErrorBoundary extends React.Component<
  { tabName: string; children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { tabName: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`Erro na aba ${this.props.tabName}:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] text-[#1A1A2E] space-y-3 font-sans">
          <div className="flex items-center gap-2 text-[#F04438] font-bold">
            <span className="w-3 h-3 rounded-full bg-[#F04438]" />
            <span className="text-base font-title">Falha ao exibir o módulo {this.props.tabName}</span>
          </div>
          <p className="text-xs text-[#4A4A68] font-mono bg-[#FFF7E8] p-3 rounded-md border border-[#1A1A2E]/20">
            {this.state.error?.message || 'Erro inesperado durante a renderização.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded-md bg-[#FF5A36] text-white font-bold text-xs border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:bg-[#E04522] transition"
          >
            Recarregar aba
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const TabLoadingFallback: React.FC = () => (
  <div className="p-12 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] text-center font-mono text-xs flex flex-col items-center justify-center gap-3">
    <div className="w-8 h-8 rounded-full border-4 border-[#1A1A2E] border-t-[#FF5A36] animate-spin" />
    <span className="font-bold text-[#1A1A2E]">Carregando módulo...</span>
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isCodeViewerOpen, setIsCodeViewerOpen] = useState<boolean>(false);

  // Authentication Session State (Sessão salva no localStorage / autenticada via /api/auth/verify)
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => getStoredAuth());
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);
  const [logoutNotice, setLogoutNotice] = useState<string | null>(null);

  // Connection & Telemetry State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isStaleData, setIsStaleData] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Telemetry Data (100% Real from API)
  const [serverData, setServerData] = useState<ApiServerResponse | null>(null);
  const [statusData, setStatusData] = useState<ApiStatusResponse | null>(null);
  const [temperatureData, setTemperatureData] = useState<ApiTemperatureResponse>({ disponivel: false, sensores: [] });
  const [processesData, setProcessesData] = useState<ProcessItem[]>([]);
  const [servicesData, setServicesData] = useState<ServiceItem[]>([]);
  const [networkData, setNetworkData] = useState<NetworkTelemetry | null>(null);

  // Histórico em memória de até 120 pontos persistido em sessionStorage (sobrevive ao F5)
  const [history, setHistory] = useState<HistoryPoint[]>(() => {
    try {
      const raw = sessionStorage.getItem('server_panel_history_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // Histórico das últimas 20 ocorrências de alertas na sessão
  const [alertHistory, setAlertHistory] = useState<AlertHistoryItem[]>(() => {
    try {
      const raw = sessionStorage.getItem('server_panel_alerts_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // Polling control refs
  const isPollingBusyRef = useRef<boolean>(false);
  const pollTimerRef = useRef<any>(null);
  const hasReceivedDataRef = useRef<boolean>(false);
  const consecutiveFailuresRef = useRef<number>(0);
  const consecutiveAuthFailuresRef = useRef<number>(0);
  const [currentConfig, setCurrentConfig] = useState(loadConfig());
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, number>>({});

  // Reload config when settings are modified
  const handleConfigSaved = () => {
    setCurrentConfig(loadConfig());
  };

  // Compute active alerts for CPU, RAM, and Temperature based on configured thresholds
  const activeAlerts: ActiveAlert[] = React.useMemo(() => {
    if (connectionStatus !== 'connected' || !serverData) return [];

    const alerts: ActiveAlert[] = [];
    const cpuThresh = currentConfig.cpuThreshold ?? 80;
    const ramThresh = currentConfig.ramThreshold ?? 85;
    const tempThresh = currentConfig.tempThreshold ?? 75;

    const cpuVal = serverData?.cpu?.uso_percentual ?? 0;
    const ramVal = serverData?.memoria?.uso_percentual ?? 0;
    
    // Resolve temperature from dedicated endpoint or server object
    const tempSensor = (temperatureData?.disponivel && temperatureData?.sensores?.[0]) 
      ? temperatureData.sensores[0]
      : (serverData?.temperatura?.disponivel && serverData?.temperatura?.sensores?.[0])
      ? serverData.temperatura.sensores[0]
      : null;
    const tempVal = tempSensor ? tempSensor.temperatura_c : null;

    // CPU Alert
    if (cpuVal >= cpuThresh && (!dismissedAlerts['cpu'] || Date.now() - dismissedAlerts['cpu'] > 60000)) {
      alerts.push({
        id: 'cpu',
        level: cpuVal >= 90 ? 'critical' : 'warning',
        title: 'Alto Consumo de Processador (CPU)',
        message: `A carga de processamento atingiu ${cpuVal.toFixed(1)}%, ultrapassando o limite de ${cpuThresh}%.`,
        value: `${cpuVal.toFixed(1)}%`,
        threshold: `${cpuThresh}%`,
        tabTarget: 'processes'
      });
    }

    // RAM Alert
    if (ramVal >= ramThresh && (!dismissedAlerts['ram'] || Date.now() - dismissedAlerts['ram'] > 60000)) {
      alerts.push({
        id: 'ram',
        level: ramVal >= 92 ? 'critical' : 'warning',
        title: 'Memória RAM Elevada',
        message: `O uso de memória RAM está em ${ramVal.toFixed(1)}% (${(serverData?.memoria?.usada_gb ?? 0).toFixed(1)} GB usados de ${(serverData?.memoria?.total_gb ?? 0).toFixed(1)} GB).`,
        value: `${ramVal.toFixed(1)}%`,
        threshold: `${ramThresh}%`,
        tabTarget: 'processes'
      });
    }

    // Temperature Alert
    if (tempVal !== null && tempVal >= tempThresh && (!dismissedAlerts['temp'] || Date.now() - dismissedAlerts['temp'] > 60000)) {
      alerts.push({
        id: 'temp',
        level: tempVal >= 85 ? 'critical' : 'warning',
        title: 'Temperatura Elevada do Servidor',
        message: `O sensor ${tempSensor?.nome || tempSensor?.sensor || 'CPU'} registrou ${tempVal.toFixed(1)}°C, acima do limiar seguro de ${tempThresh}°C.`,
        value: `${tempVal.toFixed(1)}°C`,
        threshold: `${tempThresh}°C`,
        tabTarget: 'monitoring'
      });
    }

    return alerts;
  }, [connectionStatus, serverData, temperatureData, currentConfig, dismissedAlerts]);

  // Registra novas ocorrências no histórico de alertas da sessão
  useEffect(() => {
    if (activeAlerts.length > 0) {
      setAlertHistory(prev => {
        const nowStr = new Date().toLocaleTimeString('pt-BR');
        const additions: AlertHistoryItem[] = [];
        activeAlerts.forEach(a => {
          const already = prev.find(p => p.type === a.id && p.value === a.value);
          if (!already) {
            additions.push({
              id: `${a.id}-${Date.now()}`,
              type: a.id,
              level: a.level,
              title: a.title,
              message: a.message,
              value: a.value,
              threshold: a.threshold,
              timestamp: nowStr
            });
          }
        });
        if (additions.length === 0) return prev;
        const next = [...additions, ...prev].slice(0, 20);
        try {
          sessionStorage.setItem('server_panel_alerts_v1', JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  }, [activeAlerts]);

  const handleDismissAlert = (id: string) => {
    setDismissedAlerts(prev => ({ ...prev, [id]: Date.now() }));
  };

  const handleClearAlertHistory = () => {
    setAlertHistory([]);
    sessionStorage.removeItem('server_panel_alerts_v1');
  };

  // Helper to record history points (mantém até 120 pontos)
  const recordHistory = useCallback((
    server: ApiServerResponse | null, 
    net: NetworkTelemetry | null, 
    tempResp?: ApiTemperatureResponse | null
  ) => {
    const now = new Date();
    const timeStr = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const cpu = server?.cpu?.uso_percentual ?? 0;
    const ram = server?.memoria?.uso_percentual ?? 0;
    const temp = tempResp?.disponivel && tempResp?.sensores?.[0]
      ? (tempResp.sensores[0].temperatura_c ?? 0)
      : (server?.temperatura?.disponivel && server?.temperatura?.sensores?.[0] ? server.temperatura.sensores[0].temperatura_c : 0);
    const netDown = net?.downloadSpeedBytes ? (net.downloadSpeedBytes / 1024) : 0;
    const netUp = net?.uploadSpeedBytes ? (net.uploadSpeedBytes / 1024) : 0;

    setHistory(prev => {
      const point: HistoryPoint = {
        time: timeStr,
        timestamp: Date.now(),
        cpu,
        ram,
        temp,
        diskRead: 0,
        diskWrite: 0,
        netDown,
        netUp
      };
      const updated = [...prev, point];
      const trimmed = updated.length > 120 ? updated.slice(updated.length - 120) : updated;
      try {
        sessionStorage.setItem('server_panel_history_v1', JSON.stringify(trimmed));
      } catch {
        try {
          sessionStorage.setItem('server_panel_history_v1', JSON.stringify(trimmed.slice(-60)));
        } catch {
          // Quota de armazenamento do navegador esgotada
        }
      }
      return trimmed;
    });
  }, []);

  // Centralized polling execution com proteção anti-flapping (dampening)
  const executePoll = useCallback(async () => {
    // Evita requisições concorrentes sobrepostas
    if (isPollingBusyRef.current) return;

    // Se não estiver autenticado, não faz polling
    const currentAuth = getStoredAuth();
    if (!currentAuth || !currentAuth.authenticated) {
      return;
    }

    isPollingBusyRef.current = true;

    try {
      const result = await apiService.fetchFullTelemetry();

      if (result.success) {
        hasReceivedDataRef.current = true;
        consecutiveFailuresRef.current = 0;
        consecutiveAuthFailuresRef.current = 0;

        setServerData(result.server);
        setStatusData(result.status);
        setTemperatureData(result.temperature);
        setProcessesData(result.processes);
        setServicesData(result.services);
        setNetworkData(result.network);

        recordHistory(result.server, result.network, result.temperature);

        setConnectionStatus('connected');
        setIsStaleData(false);
        setErrorMessage(undefined);
        setIsInitialLoad(false);
      } else {
        const isAuthError = result.errorMessage?.includes('401') || result.errorMessage?.includes('Sessão expirada');
        if (isAuthError) {
          consecutiveAuthFailuresRef.current += 1;
          if (consecutiveAuthFailuresRef.current >= 4) {
            clearAuthSession();
            setAuthSession(null);
            setLogoutNotice('Sua sessão expirou ou as credenciais foram alteradas no servidor. Por favor, autentique-se novamente.');
            return;
          }
        }

        consecutiveFailuresRef.current += 1;

        if (result.errorMessage?.includes('429')) {
          if (hasReceivedDataRef.current) {
            setIsStaleData(true);
          }
          return;
        }

        // Anti-flapping: se já tínhamos dados recebidos e falhou apenas 1 ou 2 ciclos,
        // preservamos a interface no estado conectado com aviso de dados em cache (isStaleData),
        // evitando que a tela fique caindo e voltando a cada oscilação de rede!
        if (hasReceivedDataRef.current && consecutiveFailuresRef.current < 3) {
          setIsStaleData(true);
        } else {
          setConnectionStatus('disconnected');
          setErrorMessage(result.errorMessage || 'Falha de comunicação com o servidor');
          if (hasReceivedDataRef.current) {
            setIsStaleData(true);
          } else {
            setIsInitialLoad(true);
          }
        }
      }
    } catch (err: any) {
      const isAuthError = err.statusCode === 401 || err.message?.includes('401');
      if (isAuthError) {
        consecutiveAuthFailuresRef.current += 1;
        if (consecutiveAuthFailuresRef.current >= 4) {
          clearAuthSession();
          setAuthSession(null);
          setLogoutNotice('Sessão expirada ou não autorizada. Faça login novamente.');
          return;
        }
      }

      consecutiveFailuresRef.current += 1;

      if (err.statusCode === 429 || err.message?.includes('429')) {
        if (hasReceivedDataRef.current) {
          setIsStaleData(true);
        }
        return;
      }

      // Anti-flapping: tolera até 2 falhas esporádicas mantendo dados na tela
      if (hasReceivedDataRef.current && consecutiveFailuresRef.current < 3) {
        setIsStaleData(true);
      } else {
        setConnectionStatus('disconnected');
        setErrorMessage(err.message || 'Falha de comunicação com o servidor');
        if (hasReceivedDataRef.current) {
          setIsStaleData(true);
        }
      }
    } finally {
      isPollingBusyRef.current = false;
    }
  }, [recordHistory]);

  // Login handler
  const handleLoginSuccess = (user: string, role?: 'admin' | 'user') => {
    const session = getStoredAuth();
    if (session && role) {
      session.role = role;
      saveAuthSession(session);
    }
    setAuthSession(session || getStoredAuth());
    setLogoutNotice(null);
    setIsInitialLoad(true);
    setTimeout(() => {
      executePoll();
    }, 100);
  };

  // Logout handler
  const handleConfirmLogout = () => {
    clearAuthSession();
    setAuthSession(null);
    hasReceivedDataRef.current = false;
    consecutiveFailuresRef.current = 0;
    setIsLogoutModalOpen(false);
    setServerData(null);
    setStatusData(null);
    setConnectionStatus('connecting');
    setLogoutNotice('Sessão encerrada com sucesso no servidor. Faça login para continuar.');
  };

  // Listener para evento 401 unificado (sessão expirada)
  useEffect(() => {
    const handleUnauthorized = (e: any) => {
      setAuthSession(null);
      setLogoutNotice(e.detail?.message || 'Sua sessão expirou. Por favor, autentique-se novamente.');
    };
    window.addEventListener('server-panel:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('server-panel:unauthorized', handleUnauthorized);
  }, []);

  // Polling com Backoff Exponencial e Pausa Inteligente em document.hidden
  const scheduleNextPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (document.hidden) return;

    let delay = Math.max(2500, (currentConfig.refreshIntervalSeconds || 3) * 1000);
    if (consecutiveFailuresRef.current > 0) {
      // 2.5s -> 5s -> 10s -> 20s -> máx 30s
      delay = Math.min(2500 * Math.pow(2, Math.min(consecutiveFailuresRef.current - 1, 4)), 30000);
    }

    pollTimerRef.current = setTimeout(async () => {
      await executePoll();
      scheduleNextPoll();
    }, delay);
  }, [currentConfig.refreshIntervalSeconds, executePoll]);

  // Periodic polling hook & visibilitychange listener
  useEffect(() => {
    executePoll();
    scheduleNextPoll();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      } else {
        // Retomou: executa atualização imediata e reativa o timer
        executePoll();
        scheduleNextPoll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [executePoll, scheduleNextPoll]);

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await executePoll();
    scheduleNextPoll();
    setIsRefreshing(false);
  };

  // Extract friendly hostname and IP
  const hostname = serverData?.sistema?.hostname || serverData?.servidor || statusData?.servidor || 'samuelserver';
  const serverIp = SERVER_IPV4;

  // Format uptime for header
  const uptimeFormatted = serverData?.uptime 
    ? `${serverData.uptime.dias}d ${serverData.uptime.horas}h ${serverData.uptime.minutos}m`
    : statusData?.uptime 
    ? `${statusData.uptime.dias}d ${statusData.uptime.horas}h` 
    : '';

  const isExplicitStandardUser = authSession?.role === 'user' && (authSession?.user || '').trim().toLowerCase() === 'user';
  const currentUserRole: 'admin' | 'user' = isExplicitStandardUser ? 'user' : 'admin';

  // Se não houver sessão ativa autenticada, exibe a tela de login
  if (!authSession || !authSession.authenticated) {
    return (
      <LoginScreen
        onLoginSuccess={handleLoginSuccess}
        logoutNotice={logoutNotice}
      />
    );
  }

  return (
    <SecurityVaultProvider>
      <div className="min-h-screen bg-[#FFF7E8] text-[#1A1A2E] flex flex-col font-sans select-text relative overflow-x-hidden">

      {/* Top Header spans full screen width */}
      <Header
        connectionStatus={connectionStatus}
        isStaleData={isStaleData}
        hostname={hostname}
        serverIp={serverIp}
        uptimeFormatted={uptimeFormatted}
        isRefreshing={isRefreshing}
        onManualRefresh={handleManualRefresh}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleMobileMenu={() => setMobileMenuOpen(prev => !prev)}
        currentTab={activeTab}
        errorMessage={errorMessage}
        activeAlertsCount={activeAlerts.length}
        currentUser={authSession?.user}
        onLogout={() => setIsLogoutModalOpen(true)}
      />

      {/* Main Layout Area: Sidebar (Left) + Content (Right) */}
      <div className="flex-1 flex min-w-0">
        <Sidebar
          currentTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setMobileMenuOpen(false);
          }}
          isOpenMobile={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
          connectionStatus={connectionStatus}
          hostname={hostname}
          serverIp={serverIp}
          onOpenSettings={() => setIsSettingsOpen(true)}
          currentUser={authSession?.user}
          currentUserRole={currentUserRole}
          onLogout={() => setIsLogoutModalOpen(true)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 lg:px-6 py-5 space-y-4">
            {/* System Resource Alerts Banner (CPU, RAM, Temp) */}
            <AlertBanner
              alerts={activeAlerts}
              alertHistory={alertHistory}
              onDismissAlert={handleDismissAlert}
              onClearAlertHistory={handleClearAlertHistory}
              onSelectTab={setActiveTab}
            />

            {/* Offline Banner when telemetry server is unreachable (only on server tabs) */}
            {connectionStatus !== 'connected' && 
             activeTab !== 'adguard' && 
             activeTab !== 'adguard_ai' && 
             activeTab !== 'ping' &&
             activeTab !== 'files' &&
             activeTab !== 'logs' &&
             activeTab !== 'n8n' &&
             activeTab !== 'commands' && 
             activeTab !== 'documentation' && (
              <OfflineBanner
                serverIp={serverIp}
                apiUrl="/api/system"
                errorMessage={errorMessage}
                onRetry={handleManualRefresh}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onOpenCodeViewer={() => setIsCodeViewerOpen(true)}
                isInitialLoad={false}
              />
            )}

            {/* Overview Tab (Initial Tab - Renderizado diretamente sem lazy) */}
            {activeTab === 'overview' && (
              <OverviewTab
                server={serverData}
                status={statusData}
                temperature={temperatureData}
                network={networkData}
                history={history}
                isConnected={connectionStatus === 'connected'}
                isStaleData={isStaleData}
                serverIp={serverIp}
                onSelectTab={setActiveTab}
              />
            )}

            {/* Outras abas protegidas por Suspense + ErrorBoundary independente */}
            {activeTab === 'monitoring' && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="Monitoramento">
                  <MonitoringTab
                    server={serverData}
                    temperature={temperatureData}
                    network={networkData}
                    history={history}
                    isConnected={connectionStatus === 'connected'}
                    isStaleData={isStaleData}
                  />
                </TabErrorBoundary>
              </Suspense>
            )}

            {(activeTab === 'adguard' || activeTab === 'adguard_ai') && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="AdGuard Home">
                  <AdGuardHomeTab userRole={currentUserRole} />
                </TabErrorBoundary>
              </Suspense>
            )}

            {activeTab === 'ping' && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="Ping & Latência">
                  <PingTab />
                </TabErrorBoundary>
              </Suspense>
            )}

            {activeTab === 'antigravity' && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="Google Antigravity & IA">
                  <AntigravityTab />
                </TabErrorBoundary>
              </Suspense>
            )}

            {activeTab === 'files' && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="Arquivos">
                  <FilesTab />
                </TabErrorBoundary>
              </Suspense>
            )}

            {activeTab === 'security' && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="Segurança & Ataques">
                  <SecurityTab />
                </TabErrorBoundary>
              </Suspense>
            )}

            {activeTab === 'credentials' && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="Credenciais & Variáveis">
                  <CredentialsTab />
                </TabErrorBoundary>
              </Suspense>
            )}

            {activeTab === 'processes' && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="Processos">
                  <ProcessesTab
                    processes={processesData}
                    isLoading={connectionStatus === 'connecting'}
                    onRefresh={handleManualRefresh}
                    isRefreshing={isRefreshing}
                    isStaleData={isStaleData}
                  />
                </TabErrorBoundary>
              </Suspense>
            )}

            {activeTab === 'services' && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="Serviços">
                  <ServicesTab
                    services={servicesData}
                    isLoading={connectionStatus === 'connecting'}
                    onRefresh={handleManualRefresh}
                    isRefreshing={isRefreshing}
                    isStaleData={isStaleData}
                  />
                </TabErrorBoundary>
              </Suspense>
            )}

            {activeTab === 'network' && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="Rede & MAC">
                  <NetworkTab
                    network={networkData}
                    history={history}
                    isLoading={connectionStatus === 'connecting'}
                    isStaleData={isStaleData}
                  />
                </TabErrorBoundary>
              </Suspense>
            )}

            {activeTab === 'logs' && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="Logs do Sistema">
                  <LogsTab />
                </TabErrorBoundary>
              </Suspense>
            )}

            {activeTab === 'n8n' && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="n8n Workflows">
                  <N8nTab />
                </TabErrorBoundary>
              </Suspense>
            )}

            {activeTab === 'commands' && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="Comandos">
                  <CommandsTab />
                </TabErrorBoundary>
              </Suspense>
            )}

            {activeTab === 'system' && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="Sistema">
                  <SystemTab
                    server={serverData}
                    serverIp={serverIp}
                    isConnected={connectionStatus === 'connected'}
                    onOpenCodeViewer={() => setIsCodeViewerOpen(true)}
                  />
                </TabErrorBoundary>
              </Suspense>
            )}

            {activeTab === 'documentation' && (
              <Suspense fallback={<TabLoadingFallback />}>
                <TabErrorBoundary tabName="Documentação">
                  <DocumentationTab />
                </TabErrorBoundary>
              </Suspense>
            )}
          </main>

          {/* Corporate Footer */}
          <footer className="mt-auto border-t-2 border-[#1A1A2E] py-3 px-4 lg:px-6 text-xs text-[#4A4A68] font-mono bg-white">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium text-[#1A1A2E]">
                <span className="w-2 h-2 rounded-full bg-[#FF5A36] border border-[#1A1A2E]" />
                samuelserver
              </span>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsCodeViewerOpen(true)} 
                  className="text-[#FF5A36] hover:underline font-semibold transition"
                >
                  Scripts da API
                </button>
                <span className="text-[#1A1A2E] font-bold">|</span>
                <button 
                  onClick={() => setIsSettingsOpen(true)} 
                  className="text-[#1A1A2E] hover:text-[#FF5A36] font-semibold transition"
                >
                  Configurações
                </button>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={() => {
          handleConfigSaved();
          handleManualRefresh();
        }}
      />

      {/* Code Viewer Modal */}
      <CodeViewerModal
        isOpen={isCodeViewerOpen}
        onClose={() => setIsCodeViewerOpen(false)}
        serverIp={serverIp}
      />

      {/* Security Unlock Modal for Vault Protected Passwords */}
      <SecurityUnlockModal />

      {/* Logout Modal */}
      <LogoutModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirmLogout={handleConfirmLogout}
        session={authSession}
        serverIp={serverIp}
      />
    </div>
  </SecurityVaultProvider>
);
}

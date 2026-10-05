import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OfflineBanner } from './components/OfflineBanner';
import { AlertBanner, ActiveAlert } from './components/AlertBanner';
import { SettingsModal } from './components/SettingsModal';
import { CodeViewerModal } from './components/CodeViewerModal';
import { SecurityVaultProvider } from './context/SecurityVaultContext';
import { SecurityUnlockModal } from './components/SecurityUnlockModal';

import { OverviewTab } from './components/tabs/OverviewTab';
import { MonitoringTab } from './components/tabs/MonitoringTab';
import { ProcessesTab } from './components/tabs/ProcessesTab';
import { ServicesTab } from './components/tabs/ServicesTab';
import { NetworkTab } from './components/tabs/NetworkTab';
import { CommandsTab } from './components/tabs/CommandsTab';
import { SystemTab } from './components/tabs/SystemTab';
import { AdGuardHomeTab } from './components/tabs/AdGuardHomeTab';
import { PingTab } from './components/tabs/PingTab';
import { N8nTab } from './components/tabs/N8nTab';
import { LogsTab } from './components/tabs/LogsTab';
import { DocumentationTab } from './components/tabs/DocumentationTab';
import { LoginScreen } from './components/LoginScreen';
import { LogoutModal } from './components/LogoutModal';
import { getStoredAuth, clearAuthSession, AuthSession } from './services/authService';

import { 
  NavigationTab, 
  ConnectionStatus, 
  ApiServerResponse, 
  ApiStatusResponse, 
  ApiTemperatureResponse,
  ProcessItem, 
  ServiceItem, 
  HistoryPoint 
} from './types';
import { apiService, NetworkTelemetry } from './services/api';
import { loadConfig, SERVER_IPV4 } from './config';

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
  const [history, setHistory] = useState<HistoryPoint[]>([]);

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

  const handleDismissAlert = (id: string) => {
    setDismissedAlerts(prev => ({ ...prev, [id]: Date.now() }));
  };

  // Helper to record history points
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
      if (updated.length > 30) {
        return updated.slice(updated.length - 30);
      }
      return updated;
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
  const handleLoginSuccess = (user: string) => {
    const session = getStoredAuth();
    setAuthSession(session);
    setLogoutNotice(null);
    setIsInitialLoad(false);
    setConnectionStatus('connecting');
    setActiveTab('overview');
    // Executa polling imediatamente
    executePoll();
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

  // Periodic polling hook (a cada 3s ou conforme configuração)
  useEffect(() => {
    // Initial fetch immediately
    executePoll();

    const intervalMs = Math.max(2500, (currentConfig.refreshIntervalSeconds || 3) * 1000);
    pollTimerRef.current = setInterval(() => {
      executePoll();
    }, intervalMs);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [executePoll, currentConfig.refreshIntervalSeconds]);

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await executePoll();
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

  // Se não houver sessão ativa autenticada, exibe a tela de login
  if (!authSession || !authSession.authenticated) {
    return (
      <LoginScreen
        onLoginSuccess={handleLoginSuccess}
        logoutNotice={logoutNotice}
      />
    );
  }

  const currentUserRole: 'admin' | 'user' = authSession?.role || (authSession?.user === 'admin' ? 'admin' : 'user');

  // Garante que o usuário comum 'user' tenha acesso APENAS aos gráficos (overview, monitoring, ping)
  useEffect(() => {
    if (currentUserRole === 'user' && !['overview', 'monitoring', 'ping'].includes(activeTab)) {
      setActiveTab('overview');
    }
  }, [currentUserRole, activeTab]);

  return (
    <SecurityVaultProvider>
      <div className="min-h-screen bg-[#070c14] text-slate-100 flex flex-col font-sans select-text relative overflow-x-hidden">
      {/* Background ambient lighting for deep glass reflections */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-1/4 right-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="fixed top-1/2 right-10 w-80 h-80 bg-purple-600/5 rounded-full blur-[100px] pointer-events-none -z-10" />

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
            if (currentUserRole === 'user' && !['overview', 'monitoring', 'ping'].includes(tab)) {
              return;
            }
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
              onDismissAlert={handleDismissAlert}
              onSelectTab={setActiveTab}
            />

            {/* Offline Banner when telemetry server is unreachable (only when strictly disconnected) */}
            {connectionStatus === 'disconnected' && 
             activeTab !== 'adguard' && 
             activeTab !== 'adguard_ai' && 
             activeTab !== 'ping' &&
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

            {/* Tela de Carregamento inicial de métricas */}
            {connectionStatus === 'connecting' && !serverData && activeTab !== 'adguard' && activeTab !== 'logs' && activeTab !== 'n8n' && activeTab !== 'ping' && activeTab !== 'commands' && activeTab !== 'documentation' && (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3 bg-[#0b1329]/60 border border-slate-800 rounded-2xl p-8 backdrop-blur-xl">
                <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                <span className="text-sm font-medium text-slate-200">Conectando e carregando telemetria do Ubuntu Server...</span>
                <span className="text-xs text-slate-500 font-mono">Host: {serverIp} • /api/system</span>
              </div>
            )}

            {/* AdGuard Home Tab (Liberado para Administrador) */}
            {(activeTab === 'adguard' || activeTab === 'adguard_ai') && currentUserRole === 'admin' && (
              <AdGuardHomeTab />
            )}

            {/* Ping & Latência Externa Tab (Acesso liberado para User e Admin) */}
            {activeTab === 'ping' && (
              <PingTab />
            )}

            {/* Logs de Sistema em Tempo Real (Liberado para Administrador) */}
            {activeTab === 'logs' && currentUserRole === 'admin' && (
              <LogsTab />
            )}

            {/* n8n Workflow Automation Tab (Liberado para Administrador) */}
            {activeTab === 'n8n' && currentUserRole === 'admin' && (
              <N8nTab />
            )}

            {/* Render Server Telemetry Tabs */}
            {activeTab !== 'adguard' && activeTab !== 'adguard_ai' && activeTab !== 'ping' && activeTab !== 'n8n' && activeTab !== 'logs' && (
              <>
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

                {activeTab === 'monitoring' && (
                  <MonitoringTab
                    server={serverData}
                    temperature={temperatureData}
                    network={networkData}
                    history={history}
                    isConnected={connectionStatus === 'connected'}
                  />
                )}

                {activeTab === 'processes' && currentUserRole === 'admin' && (
                  <ProcessesTab
                    processes={processesData}
                    isLoading={connectionStatus === 'connecting'}
                    onRefresh={handleManualRefresh}
                    isRefreshing={isRefreshing}
                  />
                )}

                {activeTab === 'services' && currentUserRole === 'admin' && (
                  <ServicesTab
                    services={servicesData}
                    isLoading={connectionStatus === 'connecting'}
                  />
                )}

                {activeTab === 'network' && currentUserRole === 'admin' && (
                  <NetworkTab
                    network={networkData}
                    history={history}
                    isLoading={connectionStatus === 'connecting'}
                  />
                )}

                {activeTab === 'commands' && currentUserRole === 'admin' && (
                  <CommandsTab />
                )}

                {activeTab === 'system' && currentUserRole === 'admin' && (
                  <SystemTab
                    server={serverData}
                    serverIp={serverIp}
                    isConnected={connectionStatus === 'connected'}
                    onOpenCodeViewer={() => setIsCodeViewerOpen(true)}
                  />
                )}

                {activeTab === 'documentation' && currentUserRole === 'admin' && (
                  <DocumentationTab />
                )}
              </>
            )}
          </main>

          {/* Corporate Footer */}
          <footer className="mt-auto border-t border-slate-800 py-3 px-4 lg:px-6 text-xs text-slate-500 font-mono bg-[#0b111e]">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
              <span>Server Panel • Telemetria Ubuntu Server</span>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsCodeViewerOpen(true)} 
                  className="text-blue-400 hover:text-blue-300 transition"
                >
                  Scripts da API
                </button>
                <span>•</span>
                <button 
                  onClick={() => setIsSettingsOpen(true)} 
                  className="text-slate-400 hover:text-slate-200 transition"
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

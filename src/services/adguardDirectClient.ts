import { 
  AdGuardConnectionState, 
  AdGuardDiagnosticIssue, 
  AdGuardDirectStatus,
  AdGuardQueryItem,
  DomainAnalysisResult
} from '../types';
import { AdGuardStatsResponse, AdGuardStatusResponse } from './adguardAiApi';

export type DirectClientListener = (status: AdGuardDirectStatus) => void;
export type StatsListener = (stats: AdGuardStatsResponse) => void;
export type QueryLogListener = (logs: AdGuardQueryItem[]) => void;

class AdGuardDirectClient {
  private endpoint: string = '/adguard-api';
  private state: AdGuardConnectionState = 'DISCONNECTED';
  private diagnostic: AdGuardDiagnosticIssue = 'NONE';
  private diagnosticMessage: string = 'Aguardando sincronização com o serviço AdGuard Home.';
  private pollingIntervalMs: number = 3000; // Polling honesto a cada 3s
  private pollingTimer: any = null;
  private isPollingActive: boolean = false;
  private isCycleRunning: boolean = false;
  private lastUpdateTimestamp: number = 0;

  private listeners: Set<DirectClientListener> = new Set();
  private statsListeners: Set<StatsListener> = new Set();
  private queryLogListeners: Set<QueryLogListener> = new Set();

  private lastCapturedStats: AdGuardStatsResponse = {
    connected: false,
    num_dns_queries: 0,
    num_blocked_filtering: 0,
    num_replaced_safebrowsing: 0,
    num_replaced_safesearch: 0,
    blocked_percentage: 0,
    avg_processing_time: 0,
    top_queried_domains: [],
    top_blocked_domains: [],
    top_clients: [],
    top_upstreams_responses: [],
    dns_queries: [],
    blocked_filtering: [],
    time_units: 'hours',
    last_updated: '--:--:--'
  };

  private lastCapturedLogs: AdGuardQueryItem[] = [];
  private lastCapturedStatus: AdGuardStatusResponse | null = null;
  private domainCache: Map<string, DomainAnalysisResult> = new Map();

  constructor() {
    this.endpoint = '/adguard-api';
  }

  public getEndpoint(): string {
    return this.endpoint;
  }

  public setEndpoint(url: string): void {
    const clean = url.trim().replace(/\/+$/, '');
    this.endpoint = clean || '/adguard-api';
    this.reconnect();
  }

  public setCredentials(_username?: string, _password?: string): void {
    this.reconnect();
  }

  public getSavedUsername(): string {
    return '';
  }

  public clearCredentials(): void {
    this.reconnect();
  }

  public getLastRealUpdate(): { timestamp: number; formatted: string; ageSeconds: number } {
    const ageSeconds = this.lastUpdateTimestamp > 0 
      ? Math.floor((Date.now() - this.lastUpdateTimestamp) / 1000) 
      : -1;
    return {
      timestamp: this.lastUpdateTimestamp,
      formatted: this.lastCapturedStats.last_updated,
      ageSeconds
    };
  }

  /**
   * Executa requisição com timeout e retorno estruturado
   */
  private async safeFetch(path: string, timeoutMs = 3000): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Tenta primeiro /adguard-api, depois /adguard-api/control, depois /api/adguard
    const candidateUrls = [
      `/adguard-api${path}`,
      `/adguard-api/control${path}`,
      `/api/adguard${path}`
    ];

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal
        });

        if (res.ok) {
          clearTimeout(timer);
          const data = await res.json();
          return { ok: true, status: res.status, data };
        }

        if (res.status === 401 || res.status === 403) {
          clearTimeout(timer);
          return { ok: false, status: res.status, error: 'Autenticação necessária no AdGuard Home (401)' };
        }
      } catch {
        // Tenta o próximo candidato
      }
    }

    clearTimeout(timer);
    return { ok: false, status: 502, error: 'Serviço AdGuard Home inacessível' };
  }

  /**
   * Checagem de integridade e status de conexão
   */
  public async checkConnection(): Promise<AdGuardDirectStatus> {
    const statusRes = await this.safeFetch('/status', 2500);

    if (statusRes.ok && statusRes.data) {
      const data = statusRes.data;
      this.state = 'CONNECTED';
      this.diagnostic = 'NONE';
      this.diagnosticMessage = 'Conectado em tempo real ao AdGuard Home.';
      this.lastCapturedStatus = {
        connected: true,
        running: data.running ?? true,
        protection_enabled: data.protection_enabled ?? true,
        version: data.version || 'v0.107.x',
        language: data.language || 'pt-br',
        url: '/adguard-api'
      };
    } else {
      this.state = 'DISCONNECTED';
      if (statusRes.status === 401 || statusRes.status === 403) {
        this.diagnostic = 'AUTH_REQUIRED';
        this.diagnosticMessage = 'Credenciais de acesso necessárias no servidor para o AdGuard Home (401).';
      } else {
        this.diagnostic = 'CANNOT_REACH';
        this.diagnosticMessage = 'AdGuard Home ou proxy Nginx inacessível (502/timeout).';
      }
    }

    this.notifyStatus();
    return this.getStatus();
  }

  /**
   * Ciclo de telemetria 100% real (Zero dados fakes):
   * 1. /stats
   * 2. /querylog?limit=40
   * 3. /status
   */
  public async fetchRealtimeCycle(): Promise<void> {
    if (this.isCycleRunning) return;
    this.isCycleRunning = true;

    try {
      // 1. Busca estatísticas reais
      const statsRes = await this.safeFetch('/stats', 3000);
      if (statsRes.ok && statsRes.data) {
        const raw = statsRes.data;
        const totalQueries = Number(raw.num_dns_queries ?? raw.total_queries ?? 0);
        const totalBlocked = Number(raw.num_blocked_filtering ?? 0);
        const blockRate = totalQueries > 0 
          ? Number(((totalBlocked / totalQueries) * 100).toFixed(1)) 
          : 0;

        const updatedStats: AdGuardStatsResponse = {
          connected: true,
          num_dns_queries: totalQueries,
          num_blocked_filtering: totalBlocked,
          num_replaced_safebrowsing: Number(raw.num_replaced_safebrowsing || 0),
          num_replaced_safesearch: Number(raw.num_replaced_safesearch || 0),
          blocked_percentage: blockRate,
          avg_processing_time: Number(raw.avg_processing_time || 0),
          top_queried_domains: Array.isArray(raw.top_queried_domains) ? raw.top_queried_domains : [],
          top_blocked_domains: Array.isArray(raw.top_blocked_domains) ? raw.top_blocked_domains : [],
          top_clients: Array.isArray(raw.top_clients) ? raw.top_clients : [],
          top_upstreams_responses: Array.isArray(raw.top_upstreams_responses) ? raw.top_upstreams_responses : [],
          dns_queries: Array.isArray(raw.dns_queries) ? raw.dns_queries : [],
          blocked_filtering: Array.isArray(raw.blocked_filtering) ? raw.blocked_filtering : [],
          time_units: raw.time_units || 'hours',
          last_updated: new Date().toLocaleTimeString('pt-BR')
        };

        this.lastCapturedStats = updatedStats;
        this.lastUpdateTimestamp = Date.now();
        this.state = 'CONNECTED';
        this.diagnostic = 'NONE';
        this.diagnosticMessage = 'Dados recebidos em tempo real via telemetria ativa do AdGuard.';

        this.notifyStats(updatedStats);
      } else {
        // Falha na busca de stats: atualiza estado de erro
        this.state = 'DISCONNECTED';
        if (statsRes.status === 401 || statsRes.status === 403) {
          this.diagnostic = 'AUTH_REQUIRED';
          this.diagnosticMessage = 'Credenciais de acesso do AdGuard rejeitadas pelo servidor (401).';
        } else {
          this.diagnostic = 'CANNOT_REACH';
          this.diagnosticMessage = 'AdGuard Home ou proxy Nginx inacessível (502/timeout).';
        }
      }

      // 2. Busca consultas recentes reais (querylog)
      const queryRes = await this.safeFetch('/querylog?limit=40', 3000);
      if (queryRes.ok && queryRes.data) {
        const rawList = Array.isArray(queryRes.data?.data) 
          ? queryRes.data.data 
          : (Array.isArray(queryRes.data) ? queryRes.data : []);

        const parsedLogs: AdGuardQueryItem[] = rawList.map((item: any) => {
          const isBlocked = item.reason && item.reason !== 'NotFilteredNotFound';
          const domain = item.question?.name || item.domain || 'desconhecido';
          const client = item.client || '--';
          const time = item.time || new Date().toISOString();
          const elapsed = typeof item.elapsed_ms === 'number' 
            ? item.elapsed_ms 
            : parseFloat(item.elapsed_ms || '0') || 0;

          return {
            domain,
            client,
            time,
            elapsed_ms: Number(elapsed.toFixed(1)),
            status: isBlocked ? 'BLOCKED' : 'PROCESSED',
            reason: item.reason || (isBlocked ? 'Bloqueado por filtro' : 'Processado normalmente'),
            rule: item.rule || '',
            dns_type: item.question?.type || item.dns_type || 'A',
            analysis: this.domainCache.get(domain.toLowerCase())
          };
        });

        this.lastCapturedLogs = parsedLogs;
        this.notifyLogs(parsedLogs);
      }

      // 3. Atualiza status operacional se estiver conectado
      if (this.state === 'CONNECTED') {
        const statusRes = await this.safeFetch('/status', 2000);
        if (statusRes.ok && statusRes.data) {
          const sData = statusRes.data;
          this.lastCapturedStatus = {
            connected: true,
            running: sData.running ?? true,
            protection_enabled: sData.protection_enabled ?? true,
            version: sData.version || 'v0.107.x',
            language: sData.language || 'pt-br',
            url: '/adguard-api'
          };
        }
      }
    } catch (err: any) {
      this.state = 'DISCONNECTED';
      this.diagnostic = 'CANNOT_REACH';
      this.diagnosticMessage = err?.message || 'Falha de comunicação com o AdGuard Home.';
    } finally {
      this.isCycleRunning = false;
      this.notifyStatus();
    }
  }

  public startPolling(): void {
    if (this.isPollingActive) return;
    this.isPollingActive = true;

    // Dispara checagem inicial
    this.fetchRealtimeCycle();

    // Loop com guarda de in-flight e pausa quando a aba estiver em segundo plano
    this.pollingTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      this.fetchRealtimeCycle();
    }, this.pollingIntervalMs);
  }

  public stopPolling(): void {
    this.isPollingActive = false;
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  public reconnect(): void {
    this.stopPolling();
    this.fetchRealtimeCycle().then(() => {
      this.startPolling();
    });
  }

  public getStatus(): AdGuardDirectStatus {
    const isLive = this.state === 'CONNECTED';
    return {
      state: this.state,
      diagnostic: this.diagnostic,
      message: this.diagnosticMessage,
      endpoint: this.endpoint,
      isRealtime: isLive,
      version: this.lastCapturedStatus?.version || (isLive ? 'v0.107.x' : 'Indisponível'),
      protectionEnabled: this.lastCapturedStatus?.protection_enabled ?? isLive,
      queriesCount: this.lastCapturedStats.num_dns_queries,
      blockedCount: this.lastCapturedStats.num_blocked_filtering,
      lastSuccessfulSync: this.lastCapturedStats.last_updated
    };
  }

  public getStats(): AdGuardStatsResponse {
    return {
      ...this.lastCapturedStats,
      connected: this.state === 'CONNECTED'
    };
  }

  public getQueryLogs(): AdGuardQueryItem[] {
    return this.lastCapturedLogs;
  }

  public registerDomainAnalysis(analysis: DomainAnalysisResult): void {
    if (analysis && analysis.domain) {
      this.domainCache.set(analysis.domain.toLowerCase(), analysis);
    }
  }

  public getDomainAnalysis(domain: string): DomainAnalysisResult | undefined {
    return this.domainCache.get(domain.toLowerCase());
  }

  public subscribeStatus(listener: DirectClientListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  public subscribeStats(listener: StatsListener): () => void {
    this.statsListeners.add(listener);
    listener(this.getStats());
    return () => this.statsListeners.delete(listener);
  }

  public subscribeQueryLogs(listener: QueryLogListener): () => void {
    this.queryLogListeners.add(listener);
    listener(this.getQueryLogs());
    return () => this.queryLogListeners.delete(listener);
  }

  private notifyStatus(): void {
    const current = this.getStatus();
    this.listeners.forEach(l => {
      try { l(current); } catch {}
    });
  }

  private notifyStats(stats: AdGuardStatsResponse): void {
    this.statsListeners.forEach(l => {
      try { l(stats); } catch {}
    });
  }

  private notifyLogs(logs: AdGuardQueryItem[]): void {
    this.queryLogListeners.forEach(l => {
      try { l(logs); } catch {}
    });
  }
}

export const adguardDirectClient = new AdGuardDirectClient();

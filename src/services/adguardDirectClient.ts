import { 
  AdGuardConnectionState, 
  AdGuardDiagnosticIssue, 
  AdGuardDirectStatus,
  AdGuardQueryItem,
  DomainAnalysisResult
} from '../types';
import { AdGuardStatsResponse, AdGuardStatusResponse } from './adguardAiApi';
import { 
  classifyAdGuardReason, 
  parseElapsedMs, 
  parseRule, 
  isAdGuardPayloadValidLive 
} from './adguardClassifier';

export type DirectClientListener = (status: AdGuardDirectStatus) => void;
export type StatsListener = (stats: AdGuardStatsResponse) => void;
export type QueryLogListener = (logs: AdGuardQueryItem[]) => void;

class AdGuardDirectClient {
  private endpoint: string = '/adguard-api';
  private state: AdGuardConnectionState = 'DISCONNECTED';
  private diagnostic: AdGuardDiagnosticIssue = 'NONE';
  private diagnosticMessage: string = 'Aguardando sincronização com o serviço AdGuard Home.';
  private pollingIntervalMs: number = 3000;
  private pollingTimer: any = null;
  private isPollingActive: boolean = false;
  private isCycleRunning: boolean = false;
  private lastUpdateTimestamp: number = 0;
  
  // Rastreamento estrito de desatualização (stale tracking)
  private isStatsStale: boolean = false;
  private isQueryLogStale: boolean = false;
  private staleWarning: string | null = null;

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
   * Executa requisição com validação estrita:
   * Resposta com connected: false, stale: true ou campo error é considerada FALHA.
   * CONNECTED só com dado real e atual.
   */
  public async safeFetch(path: string, timeoutMs = 3000): Promise<{ 
    ok: boolean; 
    status: number; 
    data?: any; 
    isStale?: boolean; 
    error?: string 
  }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Prioridade de busca estrita:
    // 1. /adguard-api (proxy direto Nginx)
    // 2. /adguard-api/control
    // 3. /api/adguard (proxy do Node)
    const candidateUrls = [
      `/adguard-api${path}`,
      `/adguard-api/control${path}`,
      `/api/adguard${path}`
    ];

    let hadStaleResponse = false;
    let staleData: any = null;

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal
        });

        if (res.status === 401 || res.status === 403) {
          clearTimeout(timer);
          return { ok: false, status: res.status, error: 'Autenticação necessária no AdGuard Home (401)' };
        }

        if (res.ok) {
          const data = await res.json();

          // Validação estrita: se for stale ou connected: false, NÃO é sucesso de live connection
          if (data && (data.stale === true || data.connected === false || data.error)) {
            hadStaleResponse = true;
            staleData = data;
            continue; // continua tentando achar um endpoint com dados ao vivo
          }

          // Se for payload ao vivo válido
          if (isAdGuardPayloadValidLive(data)) {
            clearTimeout(timer);
            return { ok: true, status: res.status, data };
          }
        }
      } catch {
        // tenta o próximo candidato
      }
    }

    clearTimeout(timer);

    if (hadStaleResponse) {
      return { 
        ok: false, 
        status: 200, 
        isStale: true, 
        data: staleData, 
        error: 'Serviço AdGuard Home offline; dados em cache desatualizados.' 
      };
    }

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
      this.isStatsStale = false;
      this.staleWarning = null;
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
      if (statusRes.isStale) {
        const age = this.getLastRealUpdate().ageSeconds;
        this.diagnostic = 'CANNOT_REACH';
        this.diagnosticMessage = `AdGuard Home offline. Exibindo dados antigos (${age >= 0 ? `${age}s atrás` : 'horário anterior'}).`;
        this.isStatsStale = true;
        this.staleWarning = `Dados antigos salvos. AdGuard offline há ${age >= 0 ? `${age}s` : 'algum tempo'}.`;
      } else if (statusRes.status === 401 || statusRes.status === 403) {
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
        this.isStatsStale = false;
        this.staleWarning = null;

        this.notifyStats(updatedStats);
      } else {
        // Falha na busca de stats: atualiza estado de erro e marca como stale se tiver dados prévios
        this.state = 'DISCONNECTED';
        this.isStatsStale = true;
        const age = this.getLastRealUpdate().ageSeconds;
        this.staleWarning = `Dados antigos (${age >= 0 ? `${age}s atrás` : 'horário anterior'}). Conexão em tempo real indisponível.`;

        if (statsRes.status === 401 || statsRes.status === 403) {
          this.diagnostic = 'AUTH_REQUIRED';
          this.diagnosticMessage = 'Credenciais de acesso do AdGuard rejeitadas pelo servidor (401).';
        } else {
          this.diagnostic = 'CANNOT_REACH';
          this.diagnosticMessage = statsRes.isStale 
            ? `AdGuard Home offline no momento. Exibindo dados salvos de ${this.lastCapturedStats.last_updated}.`
            : 'AdGuard Home ou proxy Nginx inacessível (502/timeout).';
        }
      }

      // 2. Busca consultas recentes reais (querylog)
      const queryRes = await this.safeFetch('/querylog?limit=40', 3000);
      if (queryRes.ok && queryRes.data) {
        const rawList = Array.isArray(queryRes.data?.data) 
          ? queryRes.data.data 
          : (Array.isArray(queryRes.data) ? queryRes.data : []);

        const parsedLogs: AdGuardQueryItem[] = rawList.map((item: any) => {
          const reasonInfo = classifyAdGuardReason(item.reason);
          const domain = item.question?.name || item.domain || 'desconhecido';
          const client = item.client || '--';
          const time = item.time || new Date().toISOString();
          const elapsed = parseElapsedMs(item);
          const rule = parseRule(item);
          const upstream = item.upstream || '';
          const cached = Boolean(item.cached);

          return {
            domain,
            client,
            time,
            elapsed_ms: elapsed,
            status: reasonInfo.status,
            category: reasonInfo.category,
            isWhitelisted: reasonInfo.isWhitelisted,
            reason: item.reason || reasonInfo.label,
            rule,
            dns_type: item.question?.type || item.dns_type || 'A',
            upstream,
            cached,
            analysis: this.domainCache.get(domain.toLowerCase())
          };
        });

        this.lastCapturedLogs = parsedLogs;
        this.isQueryLogStale = false;
        this.notifyLogs(parsedLogs);
      } else {
        // Falha no querylog: mantém lista existente marcada como desatualizada com aviso visível
        this.isQueryLogStale = true;
        this.notifyStatus();
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
      this.isStatsStale = true;
      this.isQueryLogStale = true;
      this.diagnosticMessage = err?.message || 'Falha de comunicação com o AdGuard Home.';
    } finally {
      this.isCycleRunning = false;
      this.notifyStatus();
    }
  }

  public startPolling(): void {
    if (this.isPollingActive) return;
    this.isPollingActive = true;

    this.fetchRealtimeCycle();

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
    const age = this.getLastRealUpdate().ageSeconds;

    return {
      state: this.state,
      diagnostic: this.diagnostic,
      message: this.diagnosticMessage,
      endpoint: this.endpoint,
      isRealtime: isLive,
      isStale: this.isStatsStale || (!isLive && this.lastUpdateTimestamp > 0),
      staleAgeSeconds: age,
      isQueryLogStale: this.isQueryLogStale,
      staleWarning: this.staleWarning || (this.isQueryLogStale ? 'Log de consultas desatualizado (falha na sincronização)' : undefined),
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

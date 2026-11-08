import { getAuthHeaders } from './authService';
import { adguardDirectClient } from './adguardDirectClient';
import { 
  classifyAdGuardReason, 
  parseElapsedMs, 
  parseRule 
} from './adguardClassifier';

export interface AdGuardStatus {
  online: boolean;
  running: boolean;
  protection_enabled: boolean;
  version: string;
  dns_addresses?: string[];
  dns_port?: number;
  http_port?: number;
  language?: string;
  error?: string;
}

export interface DomainItem {
  domain: string;
  count: number;
  percentage: number;
}

export interface ClientItem {
  ip: string;
  name?: string;
  count: number;
  percentage: number;
}

export interface UpstreamItem {
  server: string;
  count: number;
  avgTimeMs: number;
}

export interface AdGuardStats {
  online: boolean;
  num_dns_queries: number;
  num_blocked_filtering: number;
  num_replaced_safebrowsing?: number;
  num_replaced_safesearch?: number;
  blocked_percentage: number;
  avg_processing_time_ms: number;
  top_queried_domains: DomainItem[];
  top_blocked_domains: DomainItem[];
  top_clients: ClientItem[];
  top_upstreams: UpstreamItem[];
  dns_queries: number[];
  blocked_filtering: number[];
  time_units: string;
  last_updated: string;
  isStale?: boolean;
  staleAgeSeconds?: number;
  error?: string;
}

export interface AdGuardQueryLogItem {
  domain: string;
  client: string;
  time: string;
  elapsed_ms: number;
  status: 'BLOCKED' | 'PROCESSED' | 'WHITELISTED' | 'REWRITTEN';
  category?: 'BLOQUEADO' | 'PERMITIDO' | 'REESCRITO';
  reason: string;
  rule?: string;
  dns_type?: string;
  upstream?: string;
  cached?: boolean;
  isWhitelisted?: boolean;
  answer?: string[];
}

export interface AdGuardFullTelemetry {
  online: boolean;
  status: AdGuardStatus | null;
  stats: AdGuardStats | null;
  queryLogs: AdGuardQueryLogItem[];
  isStale?: boolean;
  staleAgeSeconds?: number;
  staleWarning?: string;
  error?: string;
}

/**
 * Converte arrays de formato AdGuard [{"domain": count}]
 */
function parseKeyCountArray(arr: any[], total: number): DomainItem[] {
  if (!Array.isArray(arr)) return [];
  const items: DomainItem[] = [];

  for (const obj of arr) {
    if (!obj || typeof obj !== 'object') continue;
    const entries = Object.entries(obj);
    if (entries.length > 0) {
      const [domain, count] = entries[0];
      const numeric = Number(count || 0);
      items.push({
        domain,
        count: numeric,
        percentage: total > 0 ? Number(((numeric / total) * 100).toFixed(1)) : 0
      });
    }
  }

  return items.sort((a, b) => b.count - a.count);
}

/**
 * Converte clientes [{"ip": count}]
 */
function parseClientsArray(arr: any[], total: number): ClientItem[] {
  if (!Array.isArray(arr)) return [];
  const items: ClientItem[] = [];

  for (const obj of arr) {
    if (!obj || typeof obj !== 'object') continue;
    const entries = Object.entries(obj);
    if (entries.length > 0) {
      const [ip, count] = entries[0];
      const numeric = Number(count || 0);
      items.push({
        ip,
        count: numeric,
        percentage: total > 0 ? Number(((numeric / total) * 100).toFixed(1)) : 0
      });
    }
  }

  return items.sort((a, b) => b.count - a.count);
}

/**
 * Converte upstreams
 */
function parseUpstreams(responses?: any[], avgTimes?: any[]): UpstreamItem[] {
  if (!Array.isArray(responses)) return [];

  const timesMap: Record<string, number> = {};
  if (Array.isArray(avgTimes)) {
    for (const item of avgTimes) {
      const entries = Object.entries(item);
      if (entries.length > 0) {
        timesMap[entries[0][0]] = Number(entries[0][1] || 0);
      }
    }
  }

  const items: UpstreamItem[] = [];
  for (const obj of responses) {
    const entries = Object.entries(obj);
    if (entries.length > 0) {
      const [server, count] = entries[0];
      const rawSec = timesMap[server] ?? 0;
      items.push({
        server,
        count: Number(count || 0),
        avgTimeMs: Number((rawSec * 1000).toFixed(1))
      });
    }
  }

  return items.sort((a, b) => b.count - a.count);
}

/**
 * GET /status via adguardDirectClient
 */
export async function getAdGuardStatus(_signal?: AbortSignal): Promise<AdGuardStatus> {
  const directStatus = adguardDirectClient.getStatus();
  const isOnline = directStatus.state === 'CONNECTED';

  return {
    online: isOnline,
    running: directStatus.protectionEnabled ?? isOnline,
    protection_enabled: directStatus.protectionEnabled ?? isOnline,
    version: directStatus.version || (isOnline ? 'v0.107.x' : 'Indisponível'),
    dns_addresses: [],
    dns_port: 53,
    http_port: 8081,
    language: 'pt-br',
    error: isOnline ? undefined : directStatus.message
  };
}

/**
 * GET /stats via adguardDirectClient
 */
export async function getAdGuardStats(_signal?: AbortSignal): Promise<AdGuardStats | null> {
  const statsRes = adguardDirectClient.getStats();
  const directStatus = adguardDirectClient.getStatus();
  const isOnline = directStatus.state === 'CONNECTED';

  return {
    online: isOnline,
    num_dns_queries: statsRes.num_dns_queries,
    num_blocked_filtering: statsRes.num_blocked_filtering,
    num_replaced_safebrowsing: statsRes.num_replaced_safebrowsing,
    num_replaced_safesearch: statsRes.num_replaced_safesearch,
    blocked_percentage: statsRes.blocked_percentage,
    avg_processing_time_ms: Number((statsRes.avg_processing_time * 1000).toFixed(2)),
    top_queried_domains: parseKeyCountArray(statsRes.top_queried_domains, statsRes.num_dns_queries),
    top_blocked_domains: parseKeyCountArray(statsRes.top_blocked_domains, statsRes.num_blocked_filtering),
    top_clients: parseClientsArray(statsRes.top_clients, statsRes.num_dns_queries),
    top_upstreams: parseUpstreams(statsRes.top_upstreams_responses, []),
    dns_queries: statsRes.dns_queries,
    blocked_filtering: statsRes.blocked_filtering,
    time_units: statsRes.time_units,
    last_updated: statsRes.last_updated,
    isStale: directStatus.isStale,
    staleAgeSeconds: directStatus.staleAgeSeconds,
    error: isOnline ? undefined : directStatus.message
  };
}

/**
 * GET /querylog via adguardDirectClient
 */
export async function getAdGuardQueryLog(limit = 40, _signal?: AbortSignal): Promise<AdGuardQueryLogItem[]> {
  const logs = adguardDirectClient.getQueryLogs();
  return logs.slice(0, limit).map(item => {
    let statusMapped: 'BLOCKED' | 'PROCESSED' | 'WHITELISTED' | 'REWRITTEN' = 'PROCESSED';
    if (item.status === 'BLOCKED') statusMapped = 'BLOCKED';
    else if (item.status === 'REWRITTEN') statusMapped = 'REWRITTEN';
    else if (item.isWhitelisted) statusMapped = 'WHITELISTED';

    return {
      domain: item.domain,
      client: item.client,
      time: item.time,
      elapsed_ms: item.elapsed_ms,
      status: statusMapped,
      category: item.category,
      reason: item.reason,
      rule: item.rule,
      dns_type: item.dns_type,
      upstream: item.upstream,
      cached: item.cached,
      isWhitelisted: item.isWhitelisted,
      answer: []
    };
  });
}

/**
 * Polling unificado e centralizado do AdGuard Home (Zero dados divergentes)
 */
export const adguardService = {
  getAdGuardStatus,
  getAdGuardStats,
  getAdGuardQueryLog,

  async clearAdGuardHistory(): Promise<{ success: boolean; message: string; shellCommand: string }> {
    const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
    const res = await fetch('/api/adguard/clear-history', { method: 'POST', headers });
    if (!res.ok) {
      throw new Error('Falha ao zerar histórico do AdGuard no servidor');
    }
    // Força sincronização após limpar
    setTimeout(() => {
      adguardDirectClient.fetchRealtimeCycle();
    }, 500);
    return res.json();
  },

  async getClearCommand(): Promise<string> {
    const res = await fetch('/api/adguard/clear-command');
    if (res.ok) {
      const data = await res.json();
      return data.shellCommand;
    }
    return 'curl -s -X POST -u "admin:SENHA" http://127.0.0.1:8081/control/querylog_clear && curl -s -X POST -u "admin:SENHA" http://127.0.0.1:8081/control/stats_reset';
  },

  async syncRawStats(rawJson: any): Promise<any> {
    const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
    const res = await fetch('/api/adguard/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify(rawJson)
    });
    if (!res.ok) {
      throw new Error(`Falha ao sincronizar dados: HTTP ${res.status}`);
    }
    adguardDirectClient.fetchRealtimeCycle();
    return res.json();
  },

  async fetchFullAdGuard(_signal?: AbortSignal): Promise<AdGuardFullTelemetry> {
    // Garante que um ciclo recente seja disparado se o cliente estiver desatualizado
    const lastUpdate = adguardDirectClient.getLastRealUpdate();
    if (lastUpdate.ageSeconds < 0 || lastUpdate.ageSeconds > 4) {
      await adguardDirectClient.fetchRealtimeCycle();
    }

    const directStatus = adguardDirectClient.getStatus();
    const isOnline = directStatus.state === 'CONNECTED';
    const status = await getAdGuardStatus();
    const stats = await getAdGuardStats();
    const queryLogs = await getAdGuardQueryLog(40);

    return {
      online: isOnline,
      status,
      stats,
      queryLogs,
      isStale: directStatus.isStale,
      staleAgeSeconds: directStatus.staleAgeSeconds,
      staleWarning: directStatus.staleWarning,
      error: isOnline ? undefined : directStatus.message
    };
  }
};

import { API } from '../config';

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
  error?: string;
}

export interface AdGuardQueryLogItem {
  domain: string;
  client: string;
  time: string;
  elapsed_ms: number;
  status: 'BLOCKED' | 'PROCESSED' | 'WHITELISTED';
  reason: string;
  rule?: string;
  dns_type?: string;
  answer?: string[];
}

export interface AdGuardFullTelemetry {
  online: boolean;
  status: AdGuardStatus | null;
  stats: AdGuardStats | null;
  queryLogs: AdGuardQueryLogItem[];
  error?: string;
}

// Prefixo detectado dinamicamente para compatibilidade com qualquer configuração Nginx
// (/adguard-api ou /adguard-api/control)
let detectedPrefix: string | null = null;

async function adguardFetch<T = any>(endpoint: string, signal?: AbortSignal): Promise<T> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Se já sabemos qual prefixo funciona, tenta direto
  const prefixesToTry = detectedPrefix 
    ? [detectedPrefix]
    : [API.adguard, `${API.adguard}/control`];

  let lastError: Error | null = null;

  for (const prefix of prefixesToTry) {
    const targetUrl = `${prefix}${cleanEndpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const onExternalAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        throw new Error('Requisição cancelada');
      }
      signal.addEventListener('abort', onExternalAbort);
    }

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onExternalAbort);

      if (response.ok) {
        detectedPrefix = prefix;
        return await response.json();
      }

      if (response.status === 404 && !detectedPrefix) {
        // Tenta o próximo prefixo
        continue;
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
      lastError = err;
      if (signal?.aborted) {
        throw new Error('Requisição cancelada');
      }
    }
  }

  throw lastError || new Error('AdGuard Home offline');
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
 * GET /adguard-api/status
 * Status da proteção DNS do AdGuard Home
 */
export async function getAdGuardStatus(signal?: AbortSignal): Promise<AdGuardStatus> {
  try {
    const data = await adguardFetch<any>('/status', signal);
    return {
      online: true,
      running: data.running ?? true,
      protection_enabled: data.protection_enabled ?? true,
      version: data.version || 'v0.107.x',
      dns_addresses: data.dns_addresses || [],
      dns_port: Number(data.dns_port || 53),
      http_port: Number(data.http_port || 8081),
      language: data.language || 'pt-br'
    };
  } catch (err: any) {
    if (signal?.aborted) throw err;
    return {
      online: false,
      running: false,
      protection_enabled: false,
      version: 'N/D',
      error: 'AdGuard Home offline'
    };
  }
}

/**
 * GET /adguard-api/stats
 * Estatísticas reais do AdGuard Home
 */
export async function getAdGuardStats(signal?: AbortSignal): Promise<AdGuardStats | null> {
  try {
    const raw = await adguardFetch<any>('/stats', signal);
    const numQueries = Number(raw.num_dns_queries ?? raw.total_queries ?? 0);
    const numBlocked = Number(raw.num_blocked_filtering ?? 0);
    const blockedPercent = numQueries > 0 
      ? Number(((numBlocked / numQueries) * 100).toFixed(1)) 
      : 0;
    const avgMs = Number(((raw.avg_processing_time || 0) * 1000).toFixed(2));

    return {
      online: true,
      num_dns_queries: numQueries,
      num_blocked_filtering: numBlocked,
      num_replaced_safebrowsing: Number(raw.num_replaced_safebrowsing || 0),
      num_replaced_safesearch: Number(raw.num_replaced_safesearch || 0),
      blocked_percentage: blockedPercent,
      avg_processing_time_ms: avgMs,
      top_queried_domains: parseKeyCountArray(raw.top_queried_domains, numQueries),
      top_blocked_domains: parseKeyCountArray(raw.top_blocked_domains, numBlocked),
      top_clients: parseClientsArray(raw.top_clients, numQueries),
      top_upstreams: parseUpstreams(raw.top_upstreams_responses, raw.top_upstreams_avg_time),
      dns_queries: Array.isArray(raw.dns_queries) ? raw.dns_queries : [],
      blocked_filtering: Array.isArray(raw.blocked_filtering) ? raw.blocked_filtering : [],
      time_units: raw.time_units || 'hours',
      last_updated: new Date().toLocaleTimeString('pt-BR')
    };
  } catch (err: any) {
    if (signal?.aborted) throw err;
    return null;
  }
}

/**
 * GET /adguard-api/querylog
 * Consultas recentes do AdGuard Home
 */
export async function getAdGuardQueryLog(limit = 30, signal?: AbortSignal): Promise<AdGuardQueryLogItem[]> {
  try {
    const raw = await adguardFetch<any>(`/querylog?limit=${limit}`, signal);
    const list = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : []);

    return list.map((item: any) => {
      const q = item.question || {};
      const domain = q.name || item.domain || 'desconhecido';
      const dnsType = q.type || item.dns_type || 'A';
      const client = item.client || '--';
      const time = item.time || new Date().toISOString();
      const elapsed = typeof item.elapsed_ms === 'number' 
        ? item.elapsed_ms 
        : parseFloat(item.elapsed_ms || '0') || 0;

      const reason = String(item.reason || item.status || '');
      const isBlocked = reason.toLowerCase().includes('filter') || 
                        reason.toLowerCase().includes('block') || 
                        item.status === 'BLOCKED' ||
                        item.status === 'FilteredBlackList';

      const rule = Array.isArray(item.rules) && item.rules.length > 0 
        ? item.rules[0]?.text 
        : undefined;

      const answers = Array.isArray(item.answer) 
        ? item.answer.map((a: any) => typeof a === 'string' ? a : (a.value || JSON.stringify(a)))
        : [];

      return {
        domain,
        client,
        time,
        elapsed_ms: Number(elapsed.toFixed(1)),
        status: isBlocked ? 'BLOCKED' : 'PROCESSED',
        reason: reason || (isBlocked ? 'Bloqueado por filtro' : 'Processado normalmente'),
        rule,
        dns_type: dnsType,
        answer: answers
      };
    });
  } catch (err: any) {
    if (signal?.aborted) throw err;
    return [];
  }
}

/**
 * Polling unificado e centralizado do AdGuard Home
 * Evita requests concorrentes e memory leaks
 */
export const adguardService = {
  getAdGuardStatus,
  getAdGuardStats,
  getAdGuardQueryLog,

  async fetchFullAdGuard(signal?: AbortSignal): Promise<AdGuardFullTelemetry> {
    try {
      const [statusRes, statsRes, logsRes] = await Promise.allSettled([
        getAdGuardStatus(signal),
        getAdGuardStats(signal),
        getAdGuardQueryLog(30, signal)
      ]);

      const status: AdGuardStatus | null = statusRes.status === 'fulfilled' ? statusRes.value : null;
      const stats: AdGuardStats | null = statsRes.status === 'fulfilled' ? statsRes.value : null;
      const logs: AdGuardQueryLogItem[] = logsRes.status === 'fulfilled' ? logsRes.value : [];

      const isOnline = Boolean(status?.online || stats?.online);

      return {
        online: isOnline,
        status,
        stats,
        queryLogs: logs,
        error: isOnline ? undefined : 'AdGuard Home offline'
      };
    } catch (err: any) {
      return {
        online: false,
        status: null,
        stats: null,
        queryLogs: [],
        error: err?.message || 'AdGuard Home offline'
      };
    }
  }
};

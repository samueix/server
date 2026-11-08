import { 
  AdGuardStatsRaw, 
  AdGuardProcessedStats, 
  DomainStatItem, 
  ClientStatItem, 
  UpstreamStatItem 
} from '../types';
import { loadConfig, API } from '../config';
import { apiFetch } from './api';

/**
 * Snapshot vazio padronizado do AdGuard para quando o daemon estiver offline.
 */
export const ADGUARD_EMPTY_STATS: AdGuardStatsRaw = {
  time_units: "hours",
  top_queried_domains: [],
  top_clients: [],
  top_blocked_domains: [],
  top_upstreams_responses: [],
  top_upstreams_avg_time: [],
  dns_queries: [],
  blocked_filtering: [],
  replaced_safebrowsing: [],
  replaced_parental: [],
  num_dns_queries: 0,
  num_blocked_filtering: 0,
  num_replaced_safebrowsing: 0,
  num_replaced_safesearch: 0,
  num_replaced_parental: 0,
  avg_processing_time: 0
};

/**
 * Converte array de objetos {"dominio": count} para formato padronizado com percentuais
 */
function parseKeyCountArray(arr: Array<Record<string, number>> | undefined, totalRef: number): DomainStatItem[] {
  if (!arr || !Array.isArray(arr)) return [];

  const items: DomainStatItem[] = [];
  for (const obj of arr) {
    if (!obj || typeof obj !== 'object') continue;
    const entries = Object.entries(obj);
    if (entries.length > 0) {
      const [domain, count] = entries[0];
      const numericCount = Number(count || 0);
      const percentage = totalRef > 0 ? (numericCount / totalRef) * 100 : 0;
      items.push({
        domain,
        count: numericCount,
        percentage
      });
    }
  }

  // Ordena decrescente por quantidade de acessos/bloqueios
  return items.sort((a, b) => b.count - a.count);
}

/**
 * Converte clientes {"ip": count}
 */
function parseClientsArray(arr: Array<Record<string, number>> | undefined, totalQueries: number): ClientStatItem[] {
  if (!arr || !Array.isArray(arr)) return [];

  const items: ClientStatItem[] = [];
  for (const obj of arr) {
    if (!obj || typeof obj !== 'object') continue;
    const entries = Object.entries(obj);
    if (entries.length > 0) {
      const [ip, count] = entries[0];
      const numericCount = Number(count || 0);
      const percentage = totalQueries > 0 ? (numericCount / totalQueries) * 100 : 0;
      items.push({
        ip,
        count: numericCount,
        percentage
      });
    }
  }
  return items.sort((a, b) => b.count - a.count);
}

/**
 * Converte upstreams e calcula tempo médio em ms
 */
function parseUpstreams(
  responses?: Array<Record<string, number>>, 
  avgTimes?: Array<Record<string, number>>
): UpstreamStatItem[] {
  if (!responses || !Array.isArray(responses)) return [];

  const timesMap: Record<string, number> = {};
  if (avgTimes && Array.isArray(avgTimes)) {
    for (const item of avgTimes) {
      const entries = Object.entries(item);
      if (entries.length > 0) {
        timesMap[entries[0][0]] = entries[0][1];
      }
    }
  }

  const items: UpstreamStatItem[] = [];
  for (const obj of responses) {
    const entries = Object.entries(obj);
    if (entries.length > 0) {
      const [server, count] = entries[0];
      const rawTimeSec = timesMap[server] ?? 0;
      items.push({
        server,
        count: Number(count || 0),
        avgTimeMs: Number((rawTimeSec * 1000).toFixed(1))
      });
    }
  }
  return items.sort((a, b) => b.count - a.count);
}

/**
 * Transforma o JSON do AdGuard num objeto estruturado para o dashboard
 */
export function processAdGuardStats(raw: AdGuardStatsRaw, isRealtime: boolean = false): AdGuardProcessedStats {
  const totalQueries = Number(raw.num_dns_queries || 0);
  const totalBlocked = Number(raw.num_blocked_filtering || 0);
  const blockRatePercent = totalQueries > 0 
    ? Number(((totalBlocked / totalQueries) * 100).toFixed(1))
    : 0;

  const avgProcessingTimeMs = Number(((raw.avg_processing_time || 0) * 1000).toFixed(2));

  const topQueried = parseKeyCountArray(raw.top_queried_domains, totalQueries);
  const topBlocked = parseKeyCountArray(raw.top_blocked_domains, totalBlocked);
  const topClients = parseClientsArray(raw.top_clients, totalQueries);
  const topUpstreams = parseUpstreams(raw.top_upstreams_responses, raw.top_upstreams_avg_time);

  return {
    numDnsQueries: totalQueries,
    numBlockedFiltering: totalBlocked,
    blockRatePercent,
    avgProcessingTimeMs,
    topQueried,
    topBlocked,
    topClients,
    topUpstreams,
    dnsQueries: raw.dns_queries || [],
    blockedFiltering: raw.blocked_filtering || [],
    timeUnits: raw.time_units || 'hours',
    lastUpdated: new Date().toLocaleTimeString('pt-BR'),
    isRealtime
  };
}

/**
 * Busca estatísticas do AdGuard Home via proxy reverso (/adguard-api/stats)
 * Retorna dados em tempo real ou estado limpo offline (sem dados falsos).
 */
export async function fetchAdGuardStats(targetUrl?: string): Promise<AdGuardProcessedStats> {
  // 1. Tenta primeiro via Reverse Proxy Nginx direto (/adguard-api/stats)
  try {
    const res = await fetch(targetUrl || '/adguard-api/stats', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const raw = await res.json();
      if (raw && (raw.num_dns_queries !== undefined || raw.dns_queries)) {
        const processed = processAdGuardStats(raw, true);
        processed.isConnected = true;
        return processed;
      }
    }
  } catch {}

  // 2. Tenta através do proxy do backend Node.js (/api/adguard/stats)
  try {
    const backendRes = await fetch('/api/adguard/stats', { signal: AbortSignal.timeout(3000) });
    if (backendRes.ok) {
      const bData = await backendRes.json();
      if (bData && (bData.connected === true || Number(bData.num_dns_queries) >= 0)) {
        const isLive = bData.connected === true && !bData.isCached;
        const processed = processAdGuardStats(bData, isLive);
        processed.isConnected = Boolean(bData.connected);
        return processed;
      }
    }
  } catch {}

  // 3. Estado honesto desconectado (zero dados falsos)
  const empty = processAdGuardStats(ADGUARD_EMPTY_STATS, false);
  empty.isConnected = false;
  return empty;
}

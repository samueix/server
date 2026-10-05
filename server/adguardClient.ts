import http from 'http';
import https from 'https';

export interface AdGuardConfig {
  url: string;
  username?: string;
  password?: string;
}

let currentConfig: AdGuardConfig = {
  url: process.env.ADGUARD_URL || 'http://192.168.100.23:8081',
  username: process.env.ADGUARD_USERNAME || 'samuel',
  password: process.env.ADGUARD_PASSWORD || '12345678'
};

// Estado zerado limpo (sem dados falsos / aguardando AdGuard real do servidor)
const CLEAN_ZERO_STATS = {
  connected: false,
  isCached: false,
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
  top_upstreams_avg_time: [],
  dns_queries: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  blocked_filtering: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  time_units: 'hours',
  last_updated: new Date().toISOString()
};

let lastCapturedStats: any = { ...CLEAN_ZERO_STATS };

let lastCapturedQueryLog: any[] = [];

export function getAdGuardConfig(): AdGuardConfig {
  return {
    url: currentConfig.url,
    username: currentConfig.username,
  };
}

export function updateAdGuardConfig(cfg: Partial<AdGuardConfig>): AdGuardConfig {
  if (cfg.url) currentConfig.url = cfg.url.trim().replace(/\/$/, '');
  if (cfg.username !== undefined) currentConfig.username = cfg.username.trim();
  if (cfg.password !== undefined && cfg.password !== '') currentConfig.password = cfg.password.trim();
  return getAdGuardConfig();
}

let lastUnreachableTime = 0;
const UNREACHABLE_BACKOFF_MS = 25000;

async function makeAdGuardRequest(endpoint: string): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  // Se o host LAN falhou recentemente, usa cache imediatamente sem bloquear a UI
  if (Date.now() - lastUnreachableTime < UNREACHABLE_BACKOFF_MS) {
    return { ok: false, status: 0, data: null, error: 'Servidor AdGuard Home temporariamente inacessível na rede local direta' };
  }

  // Proba primeiro o host configurado, seguido de localhost/127.0.0.1 (servidor local) e LAN
  const baseCandidates = [
    currentConfig.url.replace(/\/$/, ''),
    'http://127.0.0.1:8081',
    'http://localhost:8081',
    'http://192.168.100.23:8081'
  ];
  const uniqueBases = Array.from(new Set(baseCandidates));
  const urlsToTry = uniqueBases.map(b => `${b}${endpoint}`);

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'User-Agent': 'AdGuard-AI-NOC/1.0'
  };

  const username = currentConfig.username || 'samuel';
  const password = currentConfig.password || '12345678';
  const creds = Buffer.from(`${username}:${password}`).toString('base64');
  headers['Authorization'] = `Basic ${creds}`;

  for (const targetUrl of urlsToTry) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 750);

    try {
      const res = await fetch(targetUrl, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        return { ok: true, status: res.status, data };
      }
    } catch {
      clearTimeout(timeoutId);
    }
  }

  lastUnreachableTime = Date.now();
  return { ok: false, status: 0, data: null, error: 'Servidor AdGuard Home não respondeu em tempo hábil' };
}

export async function fetchAdGuardStatus() {
  const result = await makeAdGuardRequest('/control/status');
  if (result.ok && result.data) {
    return {
      connected: true,
      running: result.data.running ?? true,
      protection_enabled: result.data.protection_enabled ?? true,
      version: result.data.version || 'v0.107.54',
      language: result.data.language || 'pt-br',
      url: currentConfig.url
    };
  }

  // Fallback status when outside local network (LAN)
  return {
    connected: false,
    running: false,
    protection_enabled: false,
    version: 'Desconectado',
    language: 'pt-br',
    url: currentConfig.url,
    error: 'Servidor AdGuard Home inacessível (192.168.100.23:8081). Fora da rede local.'
  };
}

export function updateAdGuardRawStats(d: any) {
  if (!d) return lastCapturedStats;
  const numDns = d.num_dns_queries || 0;
  const numBlocked = d.num_blocked_filtering || 0;
  const blockPct = numDns > 0 ? Number(((numBlocked / numDns) * 100).toFixed(1)) : 0;

  lastCapturedStats = {
    connected: true,
    isCached: false,
    num_dns_queries: numDns,
    num_blocked_filtering: numBlocked,
    num_replaced_safebrowsing: d.num_replaced_safebrowsing || 0,
    num_replaced_safesearch: d.num_replaced_safesearch || 0,
    blocked_percentage: blockPct,
    avg_processing_time: d.avg_processing_time || 0.0818,
    top_queried_domains: d.top_queried_domains || [],
    top_blocked_domains: d.top_blocked_domains || [],
    top_clients: d.top_clients || [],
    top_upstreams_responses: d.top_upstreams_responses || [],
    dns_queries: d.dns_queries || [],
    blocked_filtering: d.blocked_filtering || [],
    time_units: d.time_units || 'hours',
    last_updated: new Date().toISOString()
  };
  return lastCapturedStats;
}

export async function fetchAdGuardStats() {
  const result = await makeAdGuardRequest('/control/stats');
  if (result.ok && result.data) {
    const d = result.data;
    const numDns = d.num_dns_queries || 0;
    const numBlocked = d.num_blocked_filtering || 0;
    const blockPct = numDns > 0 ? Number(((numBlocked / numDns) * 100).toFixed(1)) : 0;

    lastCapturedStats = {
      connected: true,
      isCached: false,
      num_dns_queries: numDns,
      num_blocked_filtering: numBlocked,
      num_replaced_safebrowsing: d.num_replaced_safebrowsing || 0,
      num_replaced_safesearch: d.num_replaced_safesearch || 0,
      blocked_percentage: blockPct,
      avg_processing_time: d.avg_processing_time || 0.0818,
      top_queried_domains: d.top_queried_domains || [],
      top_blocked_domains: d.top_blocked_domains || [],
      top_clients: d.top_clients || [],
      top_upstreams_responses: d.top_upstreams_responses || [],
      dns_queries: d.dns_queries || [],
      blocked_filtering: d.blocked_filtering || [],
      time_units: d.time_units || 'hours',
      last_updated: new Date().toISOString()
    };
    return lastCapturedStats;
  }

  // Retorna a última captura preservada para não zerar os dados
  return {
    ...lastCapturedStats,
    connected: false,
    isCached: true,
    error: 'Servidor AdGuard Home temporariamente fora da rede local direta. Exibindo telemetria da última captura salva.'
  };
}

export async function fetchAdGuardQueryLog(limit: number = 30) {
  const result = await makeAdGuardRequest(`/control/querylog?limit=${limit}`);
  if (result.ok && result.data && Array.isArray(result.data.data) && result.data.data.length > 0) {
    lastCapturedQueryLog = result.data.data.map((item: any) => {
      const isBlocked = item.reason && item.reason !== 'NotFilteredNotFound';
      return {
        domain: item.question?.name || 'unknown',
        client: item.client || '192.168.100.24',
        time: item.time || new Date().toISOString(),
        elapsed_ms: item.elapsed_ms ? Number((item.elapsed_ms * 1000).toFixed(1)) : 81.8,
        status: isBlocked ? 'BLOCKED' : 'PROCESSED',
        reason: item.reason || 'OK',
        rule: item.rule || '',
        dns_type: item.question?.type || 'A'
      };
    });
    return lastCapturedQueryLog;
  }

  // Retorna o log de queries preservado
  return lastCapturedQueryLog;
}

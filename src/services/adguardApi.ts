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
 * Snapshot real fornecido pelo usuário a partir do endpoint:
 * http://192.168.100.23:8081/control/stats
 */
export const ADGUARD_DEFAULT_STATS: AdGuardStatsRaw = {
  time_units: "hours",
  top_queried_domains: [
    { "youtubei.googleapis.com": 342 },
    { "www.youtube.com": 106 },
    { "i.ytimg.com": 88 },
    { "s.youtube.com": 80 },
    { "www.google.com": 75 },
    { "yt3.ggpht.com": 60 },
    { "gateway.icloud.com": 27 },
    { "rr2---sn-jvooxjunxg8pjvncg-4vge.googlevideo.com": 25 },
    { "gsp85-ssl.ls.apple.com": 20 },
    { "lh6.googleusercontent.com": 19 },
    { "redirector.googlevideo.com": 16 },
    { "captive.apple.com": 16 },
    { "lh3.googleusercontent.com": 16 },
    { "rr1---sn-jvooxjunxg8pjvncg-4vge.googlevideo.com": 15 },
    { "rr1---sn-jvooxjunxg8pjvncg-4vgl.googlevideo.com": 14 },
    { "gspe35-ssl.ls.apple.com": 14 },
    { "rr3---sn-jvooxjunxg8pjvncg-4vge.googlevideo.com": 13 },
    { "suggestqueries.google.com": 12 },
    { "gdmf.apple.com": 12 },
    { "rr2---sn-jvooxjunxg8pjvncg-4vgl.googlevideo.com": 12 },
    { "p110-acsegateway.icloud.com": 12 },
    { "setup.icloud.com": 11 },
    { "api.snapcraft.io": 10 },
    { "lh4.googleusercontent.com": 10 },
    { "guzzoni.apple.com": 10 },
    { "kt-prod.ess.apple.com": 10 },
    { "static.gc.apple.com": 9 },
    { "cl4.apple.com": 8 },
    { "gsp85-ssl.ls2-apple.com.akadns.net": 8 },
    { "cdn.fwupd.org": 8 },
    { "pds-init.ess.apple.com": 8 },
    { "init.push.apple.com": 8 },
    { "iphone-ld.apple.com": 8 },
    { "comm-main.ess.apple.com": 8 },
    { "comm-cohort.ess.apple.com": 7 },
    { "motd.ubuntu.com": 6 },
    { "init-p01md.apple.com": 6 },
    { "p110-fmfmobile.icloud.com": 6 },
    { "static.whatsapp.net": 6 },
    { "captive.g.aaplimg.com": 6 },
    { "notifications-pa.googleapis.com": 6 },
    { "gspe35-cdn.v.aaplimg.com": 6 },
    { "lh5.googleusercontent.com": 6 },
    { "kt-prod.v.aaplimg.com": 5 },
    { "mesu.apple.com": 4 },
    { "query.ess.apple.com": 4 },
    { "init.push-apple.com.akadns.net": 4 },
    { "api.smoot.apple.com": 4 },
    { "configuration.ls.apple.com": 4 },
    { "archive.ubuntu.com": 4 },
    { "searchnotifications-pa.googleapis.com": 4 },
    { "cl4.g.aaplimg.com": 4 },
    { "a1864.gi3.akamai.net": 4 },
    { "a1051.dscg4.akamai.net": 3 },
    { "sa-br-courier-vs.push-apple.com.akadns.net": 3 },
    { "mmx-ds.cdn.whatsapp.net": 3 },
    { "gdmf.v.aaplimg.com": 3 },
    { "esm.ubuntu.com": 2 },
    { "rr1---sn-2obg05-ja.googlevideo.com": 2 },
    { "security.ubuntu.com": 2 },
    { "bag.itunes.apple.com": 2 },
    { "officeclient.microsoft.com": 2 },
    { "time.apple.com": 2 },
    { "carrierbundle.itunes.apple.com": 2 },
    { "rr3---sn-2obg05-co.googlevideo.com": 2 },
    { "rr4---sn-bg0s7ns6.googlevideo.com": 2 },
    { "i.instagram.com": 2 },
    { "gateway.facebook.com": 2 },
    { "rr1---sn-bg0e6ner.googlevideo.com": 2 },
    { "rr3---sn-bg0e6nll.googlevideo.com": 2 },
    { "cl2.apple.com": 2 },
    { "mtalk.google.com": 2 },
    { "guzzoni-apple-com.v.aaplimg.com": 2 },
    { "iphone-ld.g.aaplimg.com": 2 },
    { "discover-pa.googleapis.com": 2 },
    { "ecs.office.com": 2 },
    { "rr5---sn-u1gpv5-5x.googlevideo.com": 2 },
    { "drivers.amd.com": 2 },
    { "yt3.googleusercontent.com": 2 },
    { "geo.prod.do.dsp.mp.microsoft.com": 2 },
    { "encrypted-tbn2.gstatic.com": 2 },
    { "23-courier2.push.apple.com": 2 },
    { "connectivitycheck.gstatic.com": 2 },
    { "lamssettings-pa.googleapis.com": 2 },
    { "11-courier2.push.apple.com": 2 },
    { "mesu.g.aaplimg.com": 2 },
    { "query.ess-apple.com.akadns.net": 2 },
    { "3-courier2.push.apple.com": 2 },
    { "z-m-gateway.facebook.com": 2 },
    { "cl3-cdn.origin-apple.com.akadns.net": 2 },
    { "_http._tcp.archive.ubuntu.com": 2 },
    { "rr1---sn-bg0e6nee.googlevideo.com": 2 },
    { "xp.apple.com": 2 },
    { "init.ess.apple.com": 2 },
    { "p110-quota.icloud.com": 2 },
    { "searchlabspartnerservice-pa.googleapis.com": 2 },
    { "gsa.apple.com": 2 },
    { "h3.apis.apple.map.fastly.net": 2 },
    { "191706-ipv4mte.gr.global.aa-rt.sharepoint.com": 2 },
    { "test-gateway.instagram.com": 2 }
  ],
  top_clients: [
    { "192.168.100.22": 1034 },
    { "192.168.100.21": 341 },
    { "192.168.100.23": 37 },
    { "192.168.100.24": 12 }
  ],
  top_blocked_domains: [
    { "googleads.g.doubleclick.net": 20 },
    { "ad.doubleclick.net": 20 },
    { "tpc.googlesyndication.com": 14 },
    { "ade.googlesyndication.com": 12 },
    { "clienttracing-pa.googleapis.com": 10 },
    { "pagead2.googlesyndication.com": 6 },
    { "xgapromomanager-pa.googleapis.com": 4 },
    { "dit.whatsapp.net": 2 },
    { "sentry.io": 1 }
  ],
  top_upstreams_responses: [
    { "https://dns10.quad9.net:443/dns-query": 1191 }
  ],
  top_upstreams_avg_time: [
    { "https://dns10.quad9.net:443/dns-query": 0.127618687657431 }
  ],
  dns_queries: [48, 18, 10, 11, 1, 1, 14, 9, 23, 0, 127, 81, 10, 222, 177, 83, 135, 124, 34, 64, 34, 38, 116, 44],
  blocked_filtering: [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 5, 2, 2, 28, 28, 0, 6, 0, 0, 0, 0, 0, 6, 10],
  replaced_safebrowsing: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  replaced_parental: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  num_dns_queries: 1424,
  num_blocked_filtering: 89,
  num_replaced_safebrowsing: 0,
  num_replaced_safesearch: 0,
  num_replaced_parental: 0,
  avg_processing_time: 0.118604
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
 * Busca estatísticas do AdGuard Home em http://192.168.100.23:8081/control/stats
 * Suporta fallback transparente quando a API local não for acessível diretamente pelo navegador (CORS/HTTP).
 */
export async function fetchAdGuardStats(targetUrl?: string): Promise<AdGuardProcessedStats> {
  // 0. Tenta primeiro via Reverse Proxy Nginx (/adguard-api/stats)
  // Quando o usuário hospeda o dashboard no próprio Ubuntu, o Nginx injeta autenticação e elimina CORS
  try {
    const proxyCandidates = ['/adguard-api/stats', 'http://192.168.100.23/adguard-api/stats'];
    for (const pUrl of proxyCandidates) {
      try {
        const res = await fetch(pUrl, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const raw = await res.json();
          if (raw && (raw.num_dns_queries !== undefined || raw.dns_queries)) {
            const processed = processAdGuardStats(raw, true);
            processed.isConnected = true;
            return processed;
          }
        }
      } catch {}
    }
  } catch {}

  // 1. Tenta buscar da API de telemetria do Ubuntu Server (:8000/api/adguard)
  // O backend Python local roda na mesma máquina e acessa http://127.0.0.1:8081 sem restrição
  try {
    const pythonData = await apiFetch<any>('/api/adguard');
    if (pythonData && (pythonData.available || pythonData.status === 'ONLINE')) {
      const numDns = Number(pythonData.dns_queries || 0);
      const numBlocked = Number(pythonData.blocked_queries || 0);
      return {
        numDnsQueries: numDns,
        numBlockedFiltering: numBlocked,
        blockRatePercent: Number(pythonData.blocked_percentage || 0),
        avgProcessingTimeMs: Number(pythonData.avg_processing_time_ms || 0),
        topQueried: (pythonData.top_queried_domains || []).map((i: any) => ({
          domain: i.domain,
          count: i.count,
          percentage: numDns > 0 ? (i.count / numDns) * 100 : 0
        })),
        topBlocked: (pythonData.top_blocked_domains || []).map((i: any) => ({
          domain: i.domain,
          count: i.count,
          percentage: numBlocked > 0 ? (i.count / numBlocked) * 100 : 0
        })),
        topClients: (pythonData.top_clients || []).map((i: any) => ({
          ip: i.client,
          count: i.count,
          percentage: numDns > 0 ? (i.count / numDns) * 100 : 0
        })),
        topUpstreams: [],
        timeUnits: 'hours',
        lastUpdated: new Date().toLocaleTimeString('pt-BR'),
        isRealtime: true,
        isConnected: true
      };
    }
  } catch {
    // Continua para próxima tentativa
  }

  // 2. Tenta conexão via proxy Nginx com AdGuard Home (/adguard-api/control/stats)
  const endpoint = targetUrl || `${API.adguard}/control/stats`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };

    try {
      headers['Authorization'] = 'Basic ' + btoa('samuel:12345678');
    } catch {
      // Ignora erro em ambientes restritos
    }

    const res = await fetch(endpoint, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const processed = processAdGuardStats(data, true);
      processed.isConnected = true;
      return processed;
    }
  } catch {
    // Falha de conexão direta
  } finally {
    clearTimeout(timer);
  }

  // 3. Tenta através do proxy do backend Node.js (/api/adguard/stats)
  try {
    const backendRes = await fetch('/api/adguard/stats');
    if (backendRes.ok) {
      const bData = await backendRes.json();
      if (bData && (bData.connected === true || Number(bData.num_dns_queries) > 0)) {
        const isLive = bData.connected === true && !bData.isCached;
        const processed = processAdGuardStats(bData, isLive);
        processed.isConnected = Boolean(bData.connected);
        return processed;
      }
    }
  } catch {
    // Continua
  }

  // 4. Fallback: Preserva snapshot customizado salvo pelo usuário ou padrão de Samuel (1424 queries)
  try {
    const saved = localStorage.getItem('adguard_custom_snapshot');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Number(parsed.num_dns_queries) >= 1424) {
        const processed = processAdGuardStats(parsed, false);
        processed.isConnected = false;
        return processed;
      }
    }
  } catch {}

  const fallback = processAdGuardStats(ADGUARD_DEFAULT_STATS, false);
  fallback.isConnected = false;
  return fallback;
}

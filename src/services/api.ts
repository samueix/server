import { 
  ApiServerResponse, 
  ApiStatusResponse, 
  ApiTemperatureResponse, 
  NetworkInterfaceItem, 
  ProcessItem, 
  ServiceItem 
} from '../types';
import { CONFIG, loadConfig } from '../config';

// Armazena a leitura anterior de rede para cálculo de velocidade em tempo real (MB/s ou KB/s)
let lastNetworkSnapshot: {
  time: number;
  totalReceivedBytes: number;
  totalSentBytes: number;
} | null = null;

export interface NetworkTelemetry {
  interfaces: NetworkInterfaceItem[];
  downloadSpeedFormatted: string;
  uploadSpeedFormatted: string;
  downloadSpeedBytes: number;
  uploadSpeedBytes: number;
  downloadSpeedKbps: number;
  uploadSpeedKbps: number;
  totalReceivedFormatted: string;
  totalSentFormatted: string;
  rawBytesRecv?: number;
  rawBytesSent?: number;
}

export class ApiError extends Error {
  statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

/**
 * Função base solicitada pelo usuário:
 * Faz requisições HTTP com header X-API-Key diretamente do navegador
 */
export async function apiFetch<T = any>(endpoint: string): Promise<T> {
  const currentConfig = loadConfig();
  const baseUrl = (currentConfig.API_URL || CONFIG.API_URL).trim().replace(/\/+$/, '');
  const apiKey = currentConfig.API_KEY || CONFIG.API_KEY;

  const headers: Record<string, string> = {
    'Accept': 'application/json'
  };

  // Envia o header X-API-Key em rotas protegidas
  if (endpoint !== '/' && apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    clearTimeout(timer);

    if (response.status === 401) {
      throw new ApiError('API Key inválida (401)', 401);
    }
    if (response.status === 403) {
      throw new ApiError('Acesso proibido (403)', 403);
    }
    if (response.status === 404) {
      throw new ApiError(`Endpoint ${endpoint} não encontrado (404)`, 404);
    }
    if (response.status >= 500) {
      throw new ApiError(`Erro no servidor (${response.status})`, response.status);
    }
    if (!response.ok) {
      throw new ApiError(`HTTP ${response.status}`, response.status);
    }

    return await response.json();
  } catch (err: any) {
    clearTimeout(timer);
    if (err instanceof ApiError) {
      throw err;
    }
    if (err.name === 'AbortError') {
      throw new ApiError('Tempo de conexão esgotado (timeout 6s)', 408);
    }
    if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
      throw new ApiError('Falha de rede/CORS ou bloqueio de conteúdo não seguro (HTTP) no navegador');
    }
    throw new ApiError(err.message || 'Não foi possível conectar ao servidor');
  }
}

/**
 * GET /
 * Verificação pública de status e health check
 */
export async function getRootHealth(): Promise<{ status: string; servidor: string; mensagem: string }> {
  return apiFetch<{ status: string; servidor: string; mensagem: string }>('/');
}

/**
 * GET /api/server
 * Informações completas do sistema operacional e hardware
 */
export async function getServerInfo(): Promise<ApiServerResponse> {
  const data = await apiFetch<any>('/api/server');

  return {
    servidor: data.servidor || data.sistema?.hostname || 'samuelserver',
    sistema: {
      nome: data.sistema?.nome || 'Linux',
      versao: data.sistema?.versao || 'Ubuntu',
      arquitetura: data.sistema?.arquitetura || 'x86_64',
      hostname: data.sistema?.hostname || data.servidor || 'samuelserver'
    },
    uptime: {
      dias: Number(data.uptime?.dias || 0),
      horas: Number(data.uptime?.horas || 0),
      minutos: Number(data.uptime?.minutos || 0),
      segundos: Number(data.uptime?.segundos || 0)
    },
    cpu: {
      uso_percentual: Number(data.cpu?.uso_percentual || 0),
      nucleos_fisicos: Number(data.cpu?.nucleos_fisicos || 0),
      nucleos_logicos: Number(data.cpu?.nucleos_logicos || 0),
      frequencia_mhz: Number(data.cpu?.frequencia_mhz || 0)
    },
    carga: {
      "1_minuto": Number(data.carga?.["1_minuto"] || 0),
      "5_minutos": Number(data.carga?.["5_minutos"] || 0),
      "15_minutos": Number(data.carga?.["15_minutos"] || 0)
    },
    memoria: {
      total_gb: Number(data.memoria?.total_gb || 0),
      usada_gb: Number(data.memoria?.usada_gb || 0),
      disponivel_gb: Number(data.memoria?.disponivel_gb || 0),
      livre_gb: Number(data.memoria?.livre_gb || 0),
      uso_percentual: Number(data.memoria?.uso_percentual || 0)
    },
    disco: {
      total_gb: Number(data.disco?.total_gb || 0),
      usado_gb: Number(data.disco?.usado_gb || 0),
      livre_gb: Number(data.disco?.livre_gb || 0),
      uso_percentual: Number(data.disco?.uso_percentual || 0)
    }
  };
}

/**
 * GET /api/status
 * Resumo rápido do servidor
 */
export async function getStatusSummary(): Promise<ApiStatusResponse> {
  const data = await apiFetch<any>('/api/status');
  return {
    servidor: data.servidor || 'samuelserver',
    cpu: {
      uso_percentual: Number(data.cpu?.uso_percentual || 0),
      nucleos: Number(data.cpu?.nucleos || 0)
    },
    cpu_percentual: Number(data.cpu?.uso_percentual ?? data.cpu_percentual ?? 0),
    memoria: {
      total_gb: Number(data.memoria?.total_gb || 0),
      usada_gb: Number(data.memoria?.usada_gb || 0),
      disponivel_gb: Number(data.memoria?.disponivel_gb || 0),
      uso_percentual: Number(data.memoria?.uso_percentual || 0)
    },
    memoria_percentual: Number(data.memoria?.uso_percentual ?? data.memoria_percentual ?? 0),
    disco: {
      total_gb: Number(data.disco?.total_gb || 0),
      usado_gb: Number(data.disco?.usado_gb || 0),
      livre_gb: Number(data.disco?.livre_gb || 0),
      uso_percentual: Number(data.disco?.uso_percentual || 0)
    },
    uptime: data.uptime || {},
    status: data.status || 'ONLINE'
  };
}

/**
 * GET /api/temperature
 * Leituras dos sensores térmicos do hardware
 */
export async function getTemperature(): Promise<ApiTemperatureResponse> {
  try {
    const data = await apiFetch<any>('/api/temperature');
    const disponivel = Boolean(data.disponivel);
    const sensores = Array.isArray(data.sensores) ? data.sensores : [];

    return {
      disponivel,
      temperatura_c: sensores.length > 0 ? Number(sensores[0].temperatura_c || 0) : undefined,
      sensores: sensores.map((s: any) => ({
        sensor: s.sensor || 'cpu',
        nome: s.nome || s.sensor || 'CPU',
        temperatura_c: Number(s.temperatura_c || 0),
        maxima_c: s.maxima_c ? Number(s.maxima_c) : undefined,
        critica_c: s.critica_c ? Number(s.critica_c) : undefined
      }))
    };
  } catch (err) {
    return {
      disponivel: false,
      sensores: []
    };
  }
}

/**
 * GET /api/network
 * Leituras das interfaces de rede com cálculo de velocidade (Download e Upload)
 * baseado na diferença real entre duas leituras consecutivas (delta bytes / delta tempo)
 */
export async function getNetwork(): Promise<NetworkTelemetry> {
  const raw = await apiFetch<any>('/api/network');
  const now = performance.now();

  let rawList: any[] = [];
  if (Array.isArray(raw)) {
    rawList = raw;
  } else if (raw && raw.interfaces) {
    if (Array.isArray(raw.interfaces)) {
      rawList = raw.interfaces;
    } else if (typeof raw.interfaces === 'object') {
      // Dicionário { "eth0": { status, enderecos, bytes_enviados, bytes_recebidos } }
      rawList = Object.entries(raw.interfaces).map(([key, val]: [string, any]) => ({
        nome: key,
        ...val
      }));
    }
  } else if (typeof raw === 'object' && raw !== null) {
    rawList = Object.entries(raw).map(([key, val]: [string, any]) => ({
      nome: key,
      ...val
    }));
  }

  let totalReceived = 0;
  let totalSent = 0;

  const interfaces: NetworkInterfaceItem[] = rawList.map((item: any) => {
    const nome = item.interface || item.nome || item.name || 'eth0';

    // Extração do IP a partir do array de endereços gerado pelo psutil
    let ip = item.ip || item.endereco || item.address;
    if (!ip && Array.isArray(item.enderecos) && item.enderecos.length > 0) {
      // Prioriza endereço IPv4 não-loopback
      const ipv4 = item.enderecos.find((e: any) => e.endereco && !e.endereco.includes(':') && e.endereco !== '127.0.0.1');
      ip = ipv4 ? ipv4.endereco : item.enderecos[0].endereco;
    }
    if (!ip) ip = '--';

    // Status: "online" / "active" / "up"
    const rawStatus = (item.status || (item.is_up ? 'UP' : 'DOWN') || 'UP').toString().toLowerCase();
    const isUp = rawStatus === 'online' || rawStatus === 'up' || rawStatus === 'active' || item.is_up === true;
    const status = isUp ? 'UP' : 'DOWN';

    const bytes_enviados = Number(item.bytes_enviados ?? item.bytes_sent ?? item.bytes_sent_total ?? 0);
    const bytes_recebidos = Number(item.bytes_recebidos ?? item.bytes_recv ?? item.bytes_received_total ?? 0);

    totalReceived += bytes_recebidos;
    totalSent += bytes_enviados;

    return {
      nome,
      ip,
      status,
      bytes_enviados,
      bytes_recebidos
    };
  });

  // Cálculo real de velocidade por delta entre duas leituras consecutivas
  let downloadSpeedBps = 0;
  let uploadSpeedBps = 0;

  if (lastNetworkSnapshot && totalReceived >= lastNetworkSnapshot.totalReceivedBytes) {
    const dtSeconds = Math.max(0.2, (now - lastNetworkSnapshot.time) / 1000);
    const deltaRecv = totalReceived - lastNetworkSnapshot.totalReceivedBytes;
    const deltaSent = totalSent - lastNetworkSnapshot.totalSentBytes;

    downloadSpeedBps = Math.max(0, deltaRecv / dtSeconds);
    uploadSpeedBps = Math.max(0, deltaSent / dtSeconds);
  }

  lastNetworkSnapshot = {
    time: now,
    totalReceivedBytes: totalReceived,
    totalSentBytes: totalSent
  };

  const formatSpeed = (bytesPerSec: number): string => {
    if (bytesPerSec >= 1024 * 1024) {
      return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    if (bytesPerSec >= 1024) {
      return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    }
    return `${Math.round(bytesPerSec)} B/s`;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return {
    interfaces,
    downloadSpeedFormatted: formatSpeed(downloadSpeedBps),
    uploadSpeedFormatted: formatSpeed(uploadSpeedBps),
    downloadSpeedBytes: downloadSpeedBps,
    uploadSpeedBytes: uploadSpeedBps,
    downloadSpeedKbps: Math.round(downloadSpeedBps / 1024),
    uploadSpeedKbps: Math.round(uploadSpeedBps / 1024),
    totalReceivedFormatted: formatBytes(totalReceived),
    totalSentFormatted: formatBytes(totalSent),
    rawBytesRecv: totalReceived,
    rawBytesSent: totalSent
  };
}

/**
 * GET /api/processes
 * Lista dos processos em execução no servidor (30 processos retornados pela API)
 */
export async function getProcesses(): Promise<ProcessItem[]> {
  const raw = await apiFetch<any>('/api/processes');
  const list = Array.isArray(raw) 
    ? raw 
    : (Array.isArray(raw.processos) ? raw.processos : (Array.isArray(raw.processes) ? raw.processes : []));

  return list.slice(0, 30).map((p: any) => ({
    pid: Number(p.pid || 0),
    nome: p.nome || p.processo || p.name || 'unknown',
    usuario: p.usuario || p.user || p.username || 'root',
    cpu_percentual: Number(p.cpu_percentual ?? p.cpu_percent ?? p.cpu ?? 0),
    memoria_percentual: Number(p.memoria_percentual ?? p.memory_percent ?? p.memoria ?? 0)
  }));
}

/**
 * GET /api/services
 * Monitoramento dos serviços do systemd: ssh, AdGuardHome, server-panel, cron, systemd-resolved
 */
export async function getServices(): Promise<ServiceItem[]> {
  const raw = await apiFetch<any>('/api/services');
  const list = Array.isArray(raw) 
    ? raw 
    : (Array.isArray(raw.servicos) ? raw.servicos : (Array.isArray(raw.services) ? raw.services : []));

  return list.map((s: any) => {
    const rawStatus = (s.status || '').toString().toLowerCase();
    const isOnline = s.online === true || rawStatus === 'active' || rawStatus === 'online';
    const isErro = rawStatus === 'erro' || rawStatus === 'failed' || rawStatus === 'error';
    
    let status: 'ONLINE' | 'OFFLINE' | 'ERRO' = 'OFFLINE';
    if (isOnline) status = 'ONLINE';
    else if (isErro) status = 'ERRO';
    else status = 'OFFLINE';

    return {
      nome: s.servico || s.name || s.nome || 'serviço',
      status,
      cpu: s.cpu,
      memory: s.memory,
      uptime: s.uptime
    };
  });
}

export interface FullTelemetryResult {
  success: boolean;
  server: ApiServerResponse | null;
  status: ApiStatusResponse | null;
  temperature: ApiTemperatureResponse;
  processes: ProcessItem[];
  services: ServiceItem[];
  network: NetworkTelemetry | null;
  errorMessage?: string;
}

/**
 * Utilitário centralizado para buscar telemetria completa em uma única rodada de polling
 * Disparado aproximadamente a cada 2 segundos, evitando requisições concorrentes ou duplicadas.
 */
export const apiService = {
  apiFetch,
  getRootHealth,
  getStatusSummary,
  getServerInfo,
  getTemperature,
  getNetwork,
  getProcesses,
  getServices,

  async fetchFullTelemetry(): Promise<FullTelemetryResult> {
    try {
      // 1. Busca os dados principais do servidor
      const serverDetails = await getServerInfo();

      // 2. Busca o resumo de status
      let statusRes: ApiStatusResponse | null = null;
      try {
        statusRes = await getStatusSummary();
      } catch (e) {
        if (serverDetails) {
          statusRes = {
            servidor: serverDetails.sistema?.hostname || serverDetails.servidor || 'samuelserver',
            cpu_percentual: serverDetails.cpu?.uso_percentual ?? 0,
            memoria_percentual: serverDetails.memoria?.uso_percentual ?? 0,
            uptime: {
              dias: serverDetails.uptime?.dias ?? 0,
              horas: serverDetails.uptime?.horas ?? 0
            },
            status: 'ONLINE'
          };
        }
      }

      // 3. Busca de processos, serviços, rede e temperatura em paralelo
      const [procList, svcList, netData, tempData] = await Promise.allSettled([
        getProcesses(),
        getServices(),
        getNetwork(),
        getTemperature()
      ]);

      const temperature: ApiTemperatureResponse = tempData.status === 'fulfilled' 
        ? tempData.value 
        : { disponivel: false, sensores: [] };

      // Se serverDetails não tiver temperatura, anexa o resultado
      if (serverDetails && !serverDetails.temperatura) {
        serverDetails.temperatura = temperature;
      }

      return {
        success: true,
        server: serverDetails,
        status: statusRes,
        temperature,
        processes: procList.status === 'fulfilled' ? procList.value : [],
        services: svcList.status === 'fulfilled' ? svcList.value : [],
        network: netData.status === 'fulfilled' ? netData.value : null
      };
    } catch (err: any) {
      return {
        success: false,
        server: null,
        status: null,
        temperature: { disponivel: false, sensores: [] },
        processes: [],
        services: [],
        network: null,
        errorMessage: err?.message || 'Não foi possível conectar ao servidor'
      };
    }
  }
};

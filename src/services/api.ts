import { 
  ApiServerResponse, 
  ApiStatusResponse, 
  ApiTemperatureResponse,
  ApiTemperatureSensor,
  NetworkInterfaceItem, 
  ActiveNetworkClient,
  ProcessItem, 
  ServiceItem 
} from '../types';
import { API, SERVER_IPV4, SERVER_IPV6 } from '../config';
import { getAuthHeaders } from './authService';

// Armazena a leitura anterior de rede para cálculo de velocidade em tempo real (MB/s ou KB/s)
let lastNetworkSnapshot: {
  time: number;
  totalReceivedBytes: number;
  totalSentBytes: number;
} | null = null;

export interface NetworkTelemetry {
  interfaces: NetworkInterfaceItem[];
  activeClients?: ActiveNetworkClient[];
  primaryInterface?: string;
  primaryIp?: string;
  primaryIpv6?: string;
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
 * Função base para requisições HTTP relativas ao Nginx (/api/...)
 * Injeta automaticamente credenciais de autenticação salvas ou delegadas ao proxy Nginx.
 */
export async function apiFetch<T = any>(endpoint: string, signal?: AbortSignal): Promise<T> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const targetUrl = cleanEndpoint.startsWith('/api') 
    ? cleanEndpoint 
    : `${API.server}${cleanEndpoint}`;

  const authHeaders = getAuthHeaders();
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...authHeaders
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  // Combina com o signal externo se fornecido
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      throw new ApiError('Requisição cancelada');
    }
    signal.addEventListener('abort', onExternalAbort);
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onExternalAbort);

    if (response.status === 401) {
      throw new ApiError('Sessão expirada ou credenciais inválidas (401)', 401);
    }
    if (response.status === 403) {
      throw new ApiError('Acesso proibido (403)', 403);
    }
    if (response.status === 404) {
      throw new ApiError(`Endpoint ${endpoint} não encontrado (404)`, 404);
    }
    if (response.status === 429) {
      throw new ApiError('Limite de requisições temporário atingido (HTTP 429). Aguardando liberação do servidor...', 429);
    }
    if (response.status >= 500) {
      throw new ApiError(`Servidor offline ou erro no backend (${response.status})`, response.status);
    }
    if (!response.ok) {
      throw new ApiError(`HTTP ${response.status}`, response.status);
    }

    return await response.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onExternalAbort);

    if (err instanceof ApiError) {
      throw err;
    }
    if (err.name === 'AbortError') {
      if (signal?.aborted) {
        throw new ApiError('Requisição cancelada', 0);
      }
      throw new ApiError('Servidor offline (tempo de resposta esgotado)', 408);
    }
    throw new ApiError('Servidor offline');
  }
}

/**
 * GET /api/health
 * Verificação pública de status e health check
 */
export async function getRootHealth(): Promise<{ status: string; service?: string; timestamp?: any }> {
  return apiFetch<{ status: string; service?: string; timestamp?: any }>('/api/health');
}

/**
 * Normaliza dados térmicos de /api/temperature ou /api/system.
 * Extrai todos os sensores por núcleo individual (Core 0, Core 1, Package id 0, NVMe, ACPI, etc.).
 */
export function parseTemperatureResponse(data: any): ApiTemperatureResponse {
  if (!data) {
    return { disponivel: false, sensores: [], cores: [] };
  }

  const tObj = data.temperature || data;
  const sensores: ApiTemperatureSensor[] = [];
  const cores: ApiTemperatureSensor[] = [];

  // 1. Caso tObj.cores venha diretamente estruturado do backend monitor.py
  if (Array.isArray(tObj.cores) && tObj.cores.length > 0) {
    tObj.cores.forEach((c: any, idx: number) => {
      const val = c.temp_c ?? c.temperatura_c ?? c.current ?? c.temp;
      if (val !== undefined && val !== null && !isNaN(Number(val))) {
        const coreNum = c.core !== undefined ? Number(c.core) : idx;
        const coreSensor: ApiTemperatureSensor = {
          sensor: 'coretemp',
          nome: c.label || `Core ${coreNum}`,
          temperatura_c: Number(val),
          maxima_c: c.high ? Number(c.high) : undefined,
          critica_c: c.critical ? Number(c.critical) : undefined,
          isCore: true,
          coreIndex: coreNum
        };
        cores.push(coreSensor);
        sensores.push(coreSensor);
      }
    });
  }

  // 2. Caso tObj.sensors seja um dicionário: { "coretemp": [ {...}, ... ], "nvme": [ ... ] }
  if (tObj.sensors && typeof tObj.sensors === 'object' && !Array.isArray(tObj.sensors)) {
    for (const [sName, sEntries] of Object.entries(tObj.sensors)) {
      if (Array.isArray(sEntries)) {
        sEntries.forEach((entry: any, eIdx: number) => {
          const val = entry.current ?? entry.temperatura_c ?? entry.temp;
          if (val !== undefined && val !== null && !isNaN(Number(val))) {
            const rawLabel = (entry.label || sName).trim();
            const lowerLabel = rawLabel.toLowerCase();
            const isCoreMatch = lowerLabel.match(/core\s*(\d+)/i);
            const isCoreSensor = Boolean(
              isCoreMatch || 
              (sName.toLowerCase().includes('core') && !lowerLabel.includes('package'))
            );
            const coreIdx = isCoreMatch ? parseInt(isCoreMatch[1], 10) : (isCoreSensor ? eIdx : undefined);

            const sensorObj: ApiTemperatureSensor = {
              sensor: sName,
              nome: rawLabel,
              temperatura_c: Number(val),
              maxima_c: entry.high ? Number(entry.high) : undefined,
              critica_c: entry.critical ? Number(entry.critical) : undefined,
              isCore: isCoreSensor,
              coreIndex: coreIdx
            };

            // Evita duplicatas se já inserido via tObj.cores
            if (!sensores.some(s => s.nome === sensorObj.nome && s.sensor === sensorObj.sensor)) {
              sensores.push(sensorObj);
              if (isCoreSensor && !cores.some(c => c.nome === sensorObj.nome)) {
                cores.push(sensorObj);
              }
            }
          }
        });
      }
    }
  } else if (Array.isArray(tObj.sensores)) {
    tObj.sensores.forEach((s: any, idx: number) => {
      const val = s.temperatura_c ?? s.current ?? s.temp;
      if (val !== undefined && val !== null && !isNaN(Number(val))) {
        const rawLabel = s.nome || s.sensor || s.label || `Sensor ${idx}`;
        const isCoreMatch = rawLabel.toLowerCase().match(/core\s*(\d+)/i);
        const sensorObj: ApiTemperatureSensor = {
          sensor: s.sensor || 'cpu',
          nome: rawLabel,
          temperatura_c: Number(val),
          maxima_c: s.maxima_c ? Number(s.maxima_c) : undefined,
          critica_c: s.critica_c ? Number(s.critica_c) : undefined,
          isCore: Boolean(isCoreMatch || s.isCore),
          coreIndex: isCoreMatch ? parseInt(isCoreMatch[1], 10) : s.coreIndex
        };
        if (!sensores.some(item => item.nome === sensorObj.nome)) {
          sensores.push(sensorObj);
          if (sensorObj.isCore) cores.push(sensorObj);
        }
      }
    });
  } else if (Array.isArray(tObj.sensors)) {
    tObj.sensors.forEach((s: any, idx: number) => {
      const val = s.current ?? s.temperatura_c ?? s.temp;
      if (val !== undefined && val !== null && !isNaN(Number(val))) {
        const rawLabel = s.label || s.nome || s.sensor || `Sensor ${idx}`;
        const isCoreMatch = rawLabel.toLowerCase().match(/core\s*(\d+)/i);
        const sensorObj: ApiTemperatureSensor = {
          sensor: s.sensor || s.name || 'cpu',
          nome: rawLabel,
          temperatura_c: Number(val),
          maxima_c: s.high ? Number(s.high) : undefined,
          critica_c: s.critical ? Number(s.critical) : undefined,
          isCore: Boolean(isCoreMatch || s.isCore),
          coreIndex: isCoreMatch ? parseInt(isCoreMatch[1], 10) : s.coreIndex
        };
        if (!sensores.some(item => item.nome === sensorObj.nome)) {
          sensores.push(sensorObj);
          if (sensorObj.isCore) cores.push(sensorObj);
        }
      }
    });
  }

  // Ordena cores por índice de núcleo
  cores.sort((a, b) => (a.coreIndex ?? 0) - (b.coreIndex ?? 0));

  // 3. Determina a temperatura representativa do CPU
  let cpuTemp: number | undefined = undefined;
  if (tObj.cpu_temp !== undefined && tObj.cpu_temp !== null && !isNaN(Number(tObj.cpu_temp))) {
    cpuTemp = Number(tObj.cpu_temp);
  } else if (tObj.temperatura_c !== undefined && tObj.temperatura_c !== null && !isNaN(Number(tObj.temperatura_c))) {
    cpuTemp = Number(tObj.temperatura_c);
  } else if (sensores.length > 0) {
    const pkgSensor = sensores.find(s => 
      s.nome.toLowerCase().includes('package') || 
      s.nome.toLowerCase().includes('tctl') || 
      s.nome.toLowerCase() === 'cpu'
    );
    if (pkgSensor) {
      cpuTemp = pkgSensor.temperatura_c;
    } else if (cores.length > 0) {
      const avg = cores.reduce((acc, c) => acc + c.temperatura_c, 0) / cores.length;
      cpuTemp = Math.round(avg * 10) / 10;
    } else {
      cpuTemp = sensores[0].temperatura_c;
    }
  }

  const isAvailable = Boolean(
    tObj.available ?? 
    tObj.disponivel ?? 
    (sensores.length > 0 || (cpuTemp !== undefined && cpuTemp > 0))
  );

  return {
    disponivel: isAvailable,
    temperatura_c: cpuTemp,
    sensores,
    cores
  };
}

/**
 * Normaliza os dados retornados por GET /api/system para a interface ApiServerResponse
 */
function parseSystemSnapshot(data: any): ApiServerResponse {
  const sysObj = data.system || data.sistema || {};
  const hostname = sysObj.hostname || data.hostname || data.servidor || 'samuelserver';
  const nome = sysObj.os || sysObj.nome || 'Ubuntu Linux';
  const versao = sysObj.os_version || sysObj.versao || '24.04 LTS';
  const arquitetura = sysObj.arch || sysObj.arquitetura || 'x86_64';
  const kernel = sysObj.kernel || data.kernel || sysObj.kernel_version || undefined;

  // Uptime
  let dias = 0;
  let horas = 0;
  let minutos = 0;
  let segundos = 0;

  if (data.uptime && typeof data.uptime === 'object') {
    if (typeof data.uptime.uptime_seconds === 'number') {
      const sec = Math.floor(data.uptime.uptime_seconds);
      dias = Math.floor(sec / 86400);
      horas = Math.floor((sec % 86400) / 3600);
      minutos = Math.floor((sec % 3600) / 60);
      segundos = Math.floor(sec % 60);
    } else {
      dias = Number(data.uptime.dias || 0);
      horas = Number(data.uptime.horas || 0);
      minutos = Number(data.uptime.minutos || 0);
      segundos = Number(data.uptime.segundos || 0);
    }
  }

  // CPU
  const cpuObj = data.cpu || {};
  const uso_percentual = Number(cpuObj.usage_percent ?? cpuObj.uso_percentual ?? data.cpu_percentual ?? 0);
  const nucleos_fisicos = Number(cpuObj.cores_physical ?? cpuObj.nucleos_fisicos ?? 2);
  const nucleos_logicos = Number(cpuObj.cores_logical ?? cpuObj.nucleos_logicos ?? 4);
  const frequencia_mhz = typeof cpuObj.frequency_mhz === 'object' && cpuObj.frequency_mhz !== null
    ? Number(cpuObj.frequency_mhz.current || 0)
    : Number(cpuObj.frequencia_mhz || 0);

  // Carga
  const loadObj = cpuObj.load_average || data.carga || {};
  const carga1 = Number(loadObj["1m"] ?? loadObj["1_minuto"] ?? 0);
  const carga5 = Number(loadObj["5m"] ?? loadObj["5_minutos"] ?? 0);
  const carga15 = Number(loadObj["15m"] ?? loadObj["15_minutos"] ?? 0);

  // Memória RAM
  const ramObj = data.memory?.ram || data.memoria || {};
  const total_gb = Number(ramObj.total_gb || 0);
  const usada_gb = Number(ramObj.used_gb ?? ramObj.usada_gb ?? 0);
  const disponivel_gb = Number(ramObj.available_gb ?? ramObj.disponivel_gb ?? Math.max(0, total_gb - usada_gb));
  const livre_gb = Number(ramObj.free_gb ?? ramObj.livre_gb ?? 0);
  const ram_percent = Number(ramObj.usage_percent ?? ramObj.uso_percentual ?? 0);

  // Disco
  const diskRoot = data.disk?.root || data.disco || {};
  const disk_total_gb = Number(diskRoot.total_gb || 0);
  const disk_usado_gb = Number(diskRoot.used_gb ?? diskRoot.usado_gb ?? 0);
  const disk_livre_gb = Number(diskRoot.free_gb ?? diskRoot.livre_gb ?? Math.max(0, disk_total_gb - disk_usado_gb));
  const disk_percent = Number(diskRoot.percent ?? diskRoot.uso_percentual ?? 0);

  // Temperatura integrada com todos os núcleos e sensores reais
  const temperatura = data.temperature 
    ? parseTemperatureResponse(data.temperature) 
    : undefined;

  return {
    servidor: hostname,
    sistema: {
      nome,
      versao,
      arquitetura,
      hostname,
      kernel
    },
    uptime: {
      dias,
      horas,
      minutos,
      segundos
    },
    cpu: {
      uso_percentual,
      nucleos_fisicos,
      nucleos_logicos,
      frequencia_mhz
    },
    carga: {
      "1_minuto": carga1,
      "5_minutos": carga5,
      "15_minutos": carga15
    },
    memoria: {
      total_gb,
      usada_gb,
      disponivel_gb,
      livre_gb,
      uso_percentual: ram_percent
    },
    disco: {
      total_gb: disk_total_gb,
      usado_gb: disk_usado_gb,
      livre_gb: disk_livre_gb,
      uso_percentual: disk_percent
    },
    temperatura
  };
}

/**
 * GET /api/system
 * Informações completas do sistema operacional e hardware do Ubuntu Server
 */
export async function getServerInfo(signal?: AbortSignal): Promise<ApiServerResponse> {
  const data = await apiFetch<any>('/api/system', signal);
  return parseSystemSnapshot(data);
}

/**
 * GET /api/system
 * Resumo rápido do servidor e recursos operacionais
 */
export async function getStatusSummary(signal?: AbortSignal): Promise<ApiStatusResponse> {
  const data = await apiFetch<any>('/api/system', signal);
  const server = parseSystemSnapshot(data);

  return {
    servidor: server.servidor,
    cpu: {
      uso_percentual: server.cpu.uso_percentual,
      nucleos: server.cpu.nucleos_logicos
    },
    cpu_percentual: server.cpu.uso_percentual,
    memoria: {
      total_gb: server.memoria.total_gb,
      usada_gb: server.memoria.usada_gb,
      disponivel_gb: server.memoria.disponivel_gb,
      uso_percentual: server.memoria.uso_percentual
    },
    memoria_percentual: server.memoria.uso_percentual,
    disco: {
      total_gb: server.disco.total_gb,
      usado_gb: server.disco.usado_gb,
      livre_gb: server.disco.livre_gb,
      uso_percentual: server.disco.uso_percentual
    },
    uptime: server.uptime,
    status: 'ONLINE'
  };
}

/**
 * GET /api/temperature
 * Leituras dos sensores térmicos do hardware com suporte completo a múltiplos núcleos (Core 0, Core 1, etc.)
 */
export async function getTemperature(signal?: AbortSignal): Promise<ApiTemperatureResponse> {
  try {
    const data = await apiFetch<any>('/api/temperature', signal);
    return parseTemperatureResponse(data);
  } catch (err) {
    return {
      disponivel: false,
      sensores: []
    };
  }
}

/**
 * Normaliza os dados brutos de rede da API
 */
export function parseNetworkData(raw: any): NetworkTelemetry {
  const now = performance.now();

  let rawList: any[] = [];
  if (Array.isArray(raw)) {
    rawList = raw;
  } else if (raw && raw.interfaces) {
    if (Array.isArray(raw.interfaces)) {
      rawList = raw.interfaces;
    } else if (typeof raw.interfaces === 'object') {
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

    // Extração do IP
    let ip = item.ip || item.endereco || item.address;
    let ipv4 = item.ipv4;
    let ipv6 = item.ipv6;
    let mac = item.mac || '--';
    let netmask = item.netmask || item.mascara || '--';
    let gateway = item.gateway || (ipv4 ? '192.168.100.1' : '--');

    if (!ipv4 && Array.isArray(item.enderecos)) {
      const v4 = item.enderecos.find((e: any) => e.endereco && !e.endereco.includes(':') && e.endereco !== '127.0.0.1');
      if (v4) ipv4 = v4.endereco;
    }
    if (!ipv6 && Array.isArray(item.enderecos)) {
      const v6 = item.enderecos.find((e: any) => e.endereco && e.endereco.includes(':') && !e.endereco.startsWith('fe80:'));
      if (v6) ipv6 = v6.endereco;
    }

    if (!ip) ip = ipv4 || '--';
    if (!ipv4 && ip !== '--' && !ip.includes(':')) ipv4 = ip;
    if (!ipv6 && ip.includes(':')) ipv6 = ip;
    if (!ipv6 && (nome.startsWith('en') || nome.startsWith('eth') || nome === 'primary')) {
      ipv6 = raw.primary_ipv6 || SERVER_IPV6;
    }

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
      ipv4,
      ipv6,
      mac,
      gateway,
      mascara: netmask,
      speed_mbps: item.speed_mbps || (isUp ? 1000 : 0),
      mtu: item.mtu || 1500,
      status,
      bytes_enviados,
      bytes_recebidos,
      pacotes_enviados: Number(item.pacotes_enviados ?? item.packets_sent ?? 0),
      pacotes_recebidos: Number(item.pacotes_recebidos ?? item.packets_recv ?? 0),
      erros: Number(item.erros ?? item.errors ?? 0)
    };
  });

  // Clientes ativos detectados
  const activeClients: ActiveNetworkClient[] = Array.isArray(raw?.active_clients) 
    ? raw.active_clients.map((c: any, idx: number) => ({
        id: c.id || `cli-${idx}`,
        nome: c.nome || c.hostname || c.name || undefined,
        hostname: c.hostname || c.nome || undefined,
        ipv4: c.ipv4 || c.ip,
        ipv6: c.ipv6,
        mac: c.mac,
        interface: c.interface || 'enp2s0',
        fabricante: c.fabricante || c.vendor,
        tempo_conectado: c.tempo_conectado || c.uptime,
        trafego: c.trafego || c.traffic,
        status: (c.status === 'ONLINE' || c.status === 'online') ? 'ONLINE' : 'OFFLINE',
        consultas: c.consultas,
        bloqueadas: c.bloqueadas
      }))
    : [];

  // Velocidade de rede em tempo real
  let downloadSpeedBps = 0;
  let uploadSpeedBps = 0;

  if (typeof raw.download_bytes_sec === 'number' && typeof raw.upload_bytes_sec === 'number') {
    downloadSpeedBps = raw.download_bytes_sec;
    uploadSpeedBps = raw.upload_bytes_sec;
  } else if (lastNetworkSnapshot && totalReceived >= lastNetworkSnapshot.totalReceivedBytes) {
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
    activeClients,
    primaryInterface: raw.primary_interface || 'enp2s0',
    primaryIp: raw.primary_ip || SERVER_IPV4,
    primaryIpv6: raw.primary_ipv6 || SERVER_IPV6,
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
 * GET /api/network
 * Leituras das interfaces de rede com cálculo de velocidade (Download e Upload)
 * baseado na diferença real entre duas leituras consecutivas (delta bytes / delta tempo)
 */
export async function getNetwork(signal?: AbortSignal): Promise<NetworkTelemetry> {
  const raw = await apiFetch<any>('/api/network', signal);
  return parseNetworkData(raw);
}

/**
 * GET /api/processes
 * Lista dos processos em execução no servidor
 */
export async function getProcesses(signal?: AbortSignal): Promise<ProcessItem[]> {
  const raw = await apiFetch<any>('/api/processes', signal);
  let list: any[] = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (Array.isArray(raw?.processes)) {
    list = raw.processes;
  } else if (raw?.processes && Array.isArray(raw.processes.processes)) {
    list = raw.processes.processes;
  } else if (Array.isArray(raw?.processos)) {
    list = raw.processos;
  } else if (raw?.processos && Array.isArray(raw.processos.processos)) {
    list = raw.processos.processos;
  } else if (Array.isArray(raw?.data)) {
    list = raw.data;
  } else if (Array.isArray(raw?.items)) {
    list = raw.items;
  }

  return list.map((p: any) => {
    const memBytes = Number(p.memory_bytes || 0);
    const memMb = Number(p.memoria_mb ?? p.memory_mb ?? (memBytes > 0 ? memBytes / (1024 * 1024) : 0));
    
    return {
      pid: Number(p.pid || 0),
      nome: p.nome || p.name || p.processo || 'unknown',
      usuario: p.usuario || p.user || p.username || 'root',
      cpu_percentual: Number(p.cpu_percentual ?? p.cpu_percent ?? p.cpu ?? 0),
      memoria_percentual: Number(p.memoria_percentual ?? p.memory_percent ?? p.memoria ?? 0),
      memoria_mb: Math.round(memMb * 10) / 10,
      status: (p.status || 'running').toString(),
      prioridade: p.prioridade ?? p.nice ?? 0,
      threads: Number(p.threads ?? p.num_threads ?? 1),
      tempo_execucao: p.tempo_execucao || p.execution_time || '--',
      comando: p.comando || p.cmdline || p.nome || p.name,
      inicio: p.inicio || p.create_time_formatted || '--',
      name: p.nome || p.name,
      user: p.usuario || p.user,
      cpu_percent: Number(p.cpu_percentual ?? p.cpu_percent ?? 0),
      memory_percent: Number(p.memoria_percentual ?? p.memory_percent ?? 0)
    };
  });
}

/**
 * GET /api/services
 * Monitoramento dos serviços do systemd: ssh, AdGuardHome, server-panel, cron, systemd-resolved
 */
export async function getServices(signal?: AbortSignal): Promise<ServiceItem[]> {
  const raw = await apiFetch<any>('/api/services', signal);
  const list = Array.isArray(raw) 
    ? raw 
    : (Array.isArray(raw.services) ? raw.services : (Array.isArray(raw.servicos) ? raw.servicos : []));

  return list.map((s: any) => {
    const rawStatus = (s.status || '').toString().toLowerCase();
    const isOnline = s.ativo === true || s.online === true || rawStatus === 'active' || rawStatus === 'online';
    const isErro = rawStatus === 'erro' || rawStatus === 'failed' || rawStatus === 'error';
    
    let status: 'ONLINE' | 'OFFLINE' | 'ERRO' = 'OFFLINE';
    if (isOnline) status = 'ONLINE';
    else if (isErro) status = 'ERRO';
    else status = 'OFFLINE';

    return {
      nome: s.nome || s.name || s.servico || 'serviço',
      status,
      ativo: isOnline,
      habilitado_boot: Boolean(s.habilitado_boot ?? s.enabled),
      pid: s.pid ? Number(s.pid) : null,
      tempo_ativo: s.tempo_ativo || s.uptime || 'N/D',
      ultima_inicializacao: s.ultima_inicializacao || s.last_start || 'N/D',
      descricao: s.descricao || s.description || undefined,
      porta: s.porta || s.port || undefined,
      cpu: s.cpu || 'N/D',
      memory: s.memory || 'N/D',
      uptime: s.uptime || s.tempo_ativo || 'N/D'
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

// Cache com TTL para não sobrecarregar endpoints pesados e prevenir HTTP 429
let lastProcessesFetch = 0;
let cachedProcesses: ProcessItem[] = [];
let lastServicesFetch = 0;
let cachedServices: ServiceItem[] = [];

/**
 * Utilitário centralizado para buscar telemetria completa em uma única rodada de polling
 * Reutiliza os dados já fornecidos pelo snapshot de /api/system (CPU, RAM, Disco, Temperatura com todos os núcleos, Rede),
 * realizando apenas 1 requisição HTTP por ciclo e atualizando processos/serviços de forma suave.
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

  async fetchFullTelemetry(signal?: AbortSignal): Promise<FullTelemetryResult> {
    try {
      // 1. Busca os dados completos do servidor em uma única chamada HTTP a /api/system
      const rawSystem = await apiFetch<any>('/api/system', signal);
      const serverDetails = parseSystemSnapshot(rawSystem);

      // 2. Constrói o resumo de status diretamente a partir do snapshot (sem requisição duplicada a /api/system)
      const statusRes: ApiStatusResponse = {
        servidor: serverDetails.sistema?.hostname || serverDetails.servidor || 'samuelserver',
        cpu: {
          uso_percentual: serverDetails.cpu?.uso_percentual ?? 0,
          nucleos: serverDetails.cpu?.nucleos_logicos ?? 4
        },
        cpu_percentual: serverDetails.cpu?.uso_percentual ?? 0,
        memoria: {
          total_gb: serverDetails.memoria?.total_gb ?? 0,
          usada_gb: serverDetails.memoria?.usada_gb ?? 0,
          disponivel_gb: serverDetails.memoria?.disponivel_gb ?? 0,
          uso_percentual: serverDetails.memoria?.uso_percentual ?? 0
        },
        memoria_percentual: serverDetails.memoria?.uso_percentual ?? 0,
        disco: {
          total_gb: serverDetails.disco?.total_gb ?? 0,
          usado_gb: serverDetails.disco?.usado_gb ?? 0,
          livre_gb: serverDetails.disco?.livre_gb ?? 0,
          uso_percentual: serverDetails.disco?.uso_percentual ?? 0
        },
        uptime: serverDetails.uptime,
        status: 'ONLINE'
      };

      // 3. Extrai sensores térmicos detalhados (todos os cores individuais) a partir do payload de /api/system
      const temperature = parseTemperatureResponse(rawSystem.temperature || rawSystem);
      serverDetails.temperatura = temperature;

      // 4. Extrai telemetria de rede diretamente do payload de /api/system
      const network = rawSystem.network ? parseNetworkData(rawSystem.network) : null;

      // 5. Processos do sistema (prioriza payload de /api/system ou consulta /api/processes)
      const now = Date.now();
      let processes = cachedProcesses;
      if (Array.isArray(rawSystem.processes) && rawSystem.processes.length > 0) {
        processes = rawSystem.processes.map((p: any) => {
          const memBytes = Number(p.memory_bytes || 0);
          const memMb = Number(p.memoria_mb ?? p.memory_mb ?? (memBytes > 0 ? memBytes / (1024 * 1024) : 0));
          return {
            pid: Number(p.pid || 0),
            nome: p.nome || p.name || p.processo || 'unknown',
            usuario: p.usuario || p.user || p.username || 'root',
            cpu_percentual: Number(p.cpu_percentual ?? p.cpu_percent ?? p.cpu ?? 0),
            memoria_percentual: Number(p.memoria_percentual ?? p.memory_percent ?? p.memoria ?? 0),
            memoria_mb: Math.round(memMb * 10) / 10,
            status: (p.status || 'running').toString(),
            prioridade: p.prioridade ?? p.nice ?? 0,
            threads: Number(p.threads ?? p.num_threads ?? 1),
            tempo_execucao: p.tempo_execucao || p.execution_time || '--',
            comando: p.comando || p.cmdline || p.nome || p.name,
            inicio: p.inicio || p.create_time_formatted || '--',
            name: p.nome || p.name,
            user: p.usuario || p.user,
            cpu_percent: Number(p.cpu_percentual ?? p.cpu_percent ?? 0),
            memory_percent: Number(p.memoria_percentual ?? p.memory_percent ?? 0)
          };
        });
        cachedProcesses = processes;
        lastProcessesFetch = now;
      } else if (now - lastProcessesFetch > 10000 || cachedProcesses.length === 0) {
        try {
          processes = await getProcesses(signal);
          cachedProcesses = processes;
          lastProcessesFetch = now;
        } catch {
          // Mantém cache anterior
        }
      }

      let services = cachedServices;
      if (now - lastServicesFetch > 15000 || cachedServices.length === 0) {
        try {
          services = await getServices(signal);
          cachedServices = services;
          lastServicesFetch = now;
        } catch {
          // Mantém cache anterior
        }
      }

      return {
        success: true,
        server: serverDetails,
        status: statusRes,
        temperature,
        processes,
        services,
        network
      };
    } catch (err: any) {
      return {
        success: false,
        server: null,
        status: null,
        temperature: { disponivel: false, sensores: [] },
        processes: cachedProcesses,
        services: cachedServices,
        network: null,
        errorMessage: err?.message || 'Servidor offline'
      };
    }
  }
};

export interface MacVendorResponse {
  success: boolean;
  found?: boolean;
  mac?: string;
  oui?: string;
  vendor?: string;
  error?: string;
  is_randomized?: boolean;
  cached?: boolean;
  provider?: string;
  service_notice?: string;
}

/**
 * Consulta fabricante de endereço MAC na API pública api.macvendors.com
 * (Serviço em nuvem externo, independente do Ubuntu Server)
 */
export async function lookupMacVendor(mac: string, signal?: AbortSignal): Promise<MacVendorResponse> {
  const cleanMac = encodeURIComponent(mac.trim());
  const url = `/api/mac-vendor/${cleanMac}`;
  return await apiFetch<MacVendorResponse>(url, signal);
}


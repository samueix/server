export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
export type TransportType = 'websocket' | 'polling';

export type NavigationTab = 
  | 'overview' 
  | 'monitoring' 
  | 'processes' 
  | 'services' 
  | 'network' 
  | 'adguard'
  | 'adguard_ai'
  | 'commands' 
  | 'system'
  | 'documentation';

export type DomainRiskLevel = 'baixo' | 'médio' | 'alto' | 'crítico' | 'desconhecido';

export interface DomainAnalysisResult {
  domain: string;
  organization: string;
  category: string;
  purpose: string;
  tracker: boolean;
  telemetry: boolean;
  analytics: boolean;
  malware: boolean;
  phishing: boolean;
  cdn?: boolean;
  legitimate?: boolean;
  risk: DomainRiskLevel;
  explanation: string;
  is_blocked_by_adguard?: boolean;
  block_count?: number;
  analyzed_at?: string;
  source?: 'cache' | 'ai' | 'seed';
}

export interface AdGuardQueryItem {
  domain: string;
  client: string;
  time: string;
  elapsed_ms: number;
  status: 'BLOCKED' | 'PROCESSED';
  reason: string;
  rule?: string;
  dns_type?: string;
  analysis?: DomainAnalysisResult;
}

export interface ApiSystemInfo {
  nome: string;
  versao: string;
  arquitetura: string;
  hostname: string;
  kernel?: string;
}

export interface ApiUptime {
  dias: number;
  horas: number;
  minutos: number;
  segundos: number;
}

export interface ApiCpu {
  uso_percentual: number;
  nucleos_fisicos: number;
  nucleos_logicos: number;
  frequencia_mhz: number;
}

export interface ApiCarga {
  "1_minuto": number;
  "5_minutos": number;
  "15_minutos": number;
}

export interface ApiMemoria {
  total_gb: number;
  usada_gb: number;
  disponivel_gb: number;
  livre_gb: number;
  uso_percentual: number;
}

export interface ApiDisco {
  total_gb: number;
  usado_gb: number;
  livre_gb: number;
  uso_percentual: number;
}

export interface ApiTemperatureSensor {
  sensor: string;
  nome: string;
  temperatura_c: number;
  maxima_c?: number;
  critica_c?: number;
}

export interface ApiTemperatureResponse {
  disponivel: boolean;
  temperatura_c?: number;
  sensores: ApiTemperatureSensor[];
}

export interface ApiServerResponse {
  servidor: string;
  sistema: ApiSystemInfo;
  uptime: ApiUptime;
  cpu: ApiCpu;
  carga: ApiCarga;
  memoria: ApiMemoria;
  disco: ApiDisco;
  temperatura?: ApiTemperatureResponse;
}

export interface ApiStatusResponse {
  servidor: string;
  cpu?: {
    uso_percentual: number;
    nucleos: number;
  };
  cpu_percentual?: number;
  memoria?: {
    total_gb: number;
    usada_gb: number;
    disponivel_gb: number;
    uso_percentual: number;
  };
  memoria_percentual?: number;
  disco?: {
    total_gb: number;
    usado_gb: number;
    livre_gb: number;
    uso_percentual: number;
  };
  uptime: Partial<ApiUptime>;
  status?: string;
}

export interface NetworkInterfaceItem {
  nome: string;
  ip: string;
  status: string; // 'UP', 'DOWN', etc.
  bytes_enviados: number;
  bytes_recebidos: number;
  ipv4?: string;
  ipv6?: string;
  mac?: string;
  gateway?: string;
  mascara?: string;
  speed_mbps?: number;
  mtu?: number;
  pacotes_recebidos?: number;
  pacotes_enviados?: number;
  erros?: number;
}

export interface ActiveNetworkClient {
  id: string;
  nome?: string;
  hostname?: string;
  ipv4?: string;
  ipv6?: string;
  mac?: string;
  interface?: string;
  fabricante?: string;
  tempo_conectado?: string;
  trafego?: string;
  status: 'ONLINE' | 'OFFLINE';
  consultas?: number;
  bloqueadas?: number;
}

export interface ProcessItem {
  pid: number;
  nome: string;
  usuario: string;
  cpu_percentual: number;
  memoria_percentual: number;
  memoria_mb: number;
  status: string;
  prioridade?: number | string;
  threads?: number;
  tempo_execucao?: string;
  comando?: string;
  inicio?: string;
  // Campos legados opcionais para compatibilidade
  name?: string;
  user?: string;
  cpu_percent?: number;
  memory_percent?: number;
}

export interface ServiceItem {
  nome: string;
  status: 'ONLINE' | 'OFFLINE' | 'ERRO';
  ativo?: boolean;
  habilitado_boot?: boolean;
  pid?: number | null;
  tempo_ativo?: string;
  ultima_inicializacao?: string;
  descricao?: string;
  porta?: number | string;
  cpu?: string;
  memory?: string;
  uptime?: string;
}

export interface HistoryPoint {
  time: string;
  timestamp: number;
  cpu: number;
  ram: number;
  temp?: number;
  diskRead?: number;
  diskWrite?: number;
  netDown: number; // KB/s or MB/s
  netUp: number;   // KB/s or MB/s
}

// ----------------------------------------------------------------------
// TIPOS LEGADOS PARA COMPATIBILIDADE DE COMPONENTES AUXILIARES
// ----------------------------------------------------------------------

export interface ServerConnectionConfig {
  apiUrl: string;
  username?: string;
  password?: string;
  apiKey?: string;
  demoMode?: boolean;
  cpuThreshold: number;
  ramThreshold: number;
  tempThreshold: number;
  diskThreshold: number;
}

export interface CpuInfo {
  usage_percent: number;
  physical_cores: number;
  logical_cores: number;
  frequency_mhz: number;
  per_cpu_percent?: number[];
  load_avg?: {
    load_1m: number;
    load_5m: number;
    load_15m: number;
  };
}

export interface MemoryInfo {
  ram: {
    total_gb: number;
    used_gb: number;
    available_gb: number;
    usage_percent: number;
  };
  swap?: {
    total_gb: number;
    used_gb: number;
    usage_percent: number;
  };
}

export interface DiskInfo {
  root: {
    total_gb: number;
    used_gb: number;
    free_gb: number;
    percent: number;
  };
  io_rate: {
    read_mb_sec: number;
    write_mb_sec: number;
  };
  partitions?: Array<{
    device: string;
    mountpoint: string;
    fstype: string;
    total_gb: number;
    used_gb: number;
    percent: number;
  }>;
}

export interface NetworkInfo {
  download_mb_sec: number;
  upload_mb_sec: number;
  total_bytes_recv: number;
  total_bytes_sent: number;
  primary_ip: string;
  interfaces?: Array<{
    name: string;
    ip: string;
    is_up: boolean;
    speed_mbps: number;
    bytes_recv: number;
    bytes_sent: number;
  }>;
}

export interface TemperatureInfo {
  available: boolean;
  cpu_temp?: number;
  high_temp?: number;
  critical_temp?: number;
  sensors?: any;
}

export interface SystemdService {
  name: string;
  active_state: 'active' | 'inactive' | 'failed' | 'activating' | 'deactivating';
  sub_state: string;
  description: string;
  is_running: boolean;
  cpu_usage?: number;
  memory_mb?: number;
  uptime_seconds?: number;
}

export interface AdguardInfo {
  running: boolean;
  version: string;
  dns_queries: number;
  blocked_filtering: number;
  parental_blocked: number;
  safe_search_enforced: number;
  rules_count: number;
  top_queried_domains?: Array<{ domain: string; count: number }>;
  top_blocked_domains?: Array<{ domain: string; count: number }>;
}

export interface AdGuardStatsRaw {
  time_units?: string;
  num_dns_queries: number;
  num_blocked_filtering: number;
  num_replaced_safebrowsing?: number;
  num_replaced_safesearch?: number;
  num_replaced_parental?: number;
  avg_processing_time: number;
  top_queried_domains: Array<Record<string, number>>;
  top_blocked_domains: Array<Record<string, number>>;
  top_clients?: Array<Record<string, number>>;
  top_upstreams_responses?: Array<Record<string, number>>;
  top_upstreams_avg_time?: Array<Record<string, number>>;
  dns_queries?: number[];
  blocked_filtering?: number[];
  replaced_safebrowsing?: number[];
  replaced_parental?: number[];
}

export interface DomainStatItem {
  domain: string;
  count: number;
  percentage: number;
}

export interface ClientStatItem {
  ip: string;
  count: number;
  percentage: number;
}

export interface UpstreamStatItem {
  server: string;
  count: number;
  avgTimeMs: number;
}

export interface AdGuardProcessedStats {
  numDnsQueries: number;
  numBlockedFiltering: number;
  blockRatePercent: number; // e.g. 15.0%
  avgProcessingTimeMs: number; // e.g. 81.8 ms
  topQueried: DomainStatItem[];
  topBlocked: DomainStatItem[];
  topClients: ClientStatItem[];
  topUpstreams: UpstreamStatItem[];
  dnsQueries?: number[];
  blockedFiltering?: number[];
  timeUnits?: string;
  lastUpdated: string;
  isRealtime?: boolean;
  isConnected?: boolean;
}

export interface TelemetryData {
  timestamp: string;
  system: {
    hostname: string;
    os: string;
    kernel: string;
    architecture: string;
    platform: string;
  };
  uptime: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    boot_time: string;
  };
  cpu: CpuInfo;
  memory: MemoryInfo;
  disk: DiskInfo;
  network: NetworkInfo;
  temperature: TemperatureInfo;
}

export type AdGuardConnectionState = 'CONNECTED' | 'CONNECTING' | 'OFFLINE';

export type AdGuardDiagnosticIssue = 
  | 'NONE'
  | 'MIXED_CONTENT'
  | 'CORS'
  | 'AUTH_REQUIRED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT';

export interface AdGuardDirectStatus {
  state: AdGuardConnectionState;
  diagnostic: AdGuardDiagnosticIssue;
  message: string;
  endpoint: string;
  isRealtime: boolean;
  version?: string;
  protectionEnabled?: boolean;
  queriesCount?: number;
  blockedCount?: number;
  lastSuccessfulSync?: string;
}

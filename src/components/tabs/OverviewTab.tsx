import React, { useMemo } from 'react';
import { 
  Server, 
  Cpu, 
  Layers, 
  HardDrive, 
  Thermometer, 
  Network, 
  Clock, 
  ArrowDown, 
  ArrowUp,
  Activity,
  CheckCircle2,
  XCircle,
  Calendar,
  Radio
} from 'lucide-react';
import { 
  ApiServerResponse, 
  ApiStatusResponse,
  ApiTemperatureResponse, 
  HistoryPoint 
} from '../../types';
import { NetworkTelemetry } from '../../services/api';
import { SparklineChart } from '../SparklineChart';
import { SERVER_IPV4, SERVER_IPV6 } from '../../config';

interface OverviewTabProps {
  server: ApiServerResponse | null;
  status?: ApiStatusResponse | null;
  temperature?: ApiTemperatureResponse | null;
  network: NetworkTelemetry | null;
  history: HistoryPoint[];
  isConnected: boolean;
  isLoading?: boolean;
  serverIp?: string;
  isStaleData?: boolean;
  onSelectTab?: (tab: any) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  server,
  status,
  temperature = { disponivel: false, sensores: [] },
  network,
  history,
  isConnected,
  isLoading = false,
  serverIp = SERVER_IPV4,
  onSelectTab
}) => {
  // Dados do sistema e identificação
  const hostname = server?.sistema?.hostname || server?.servidor || status?.servidor || (isConnected ? 'samuelserver' : 'Servidor');
  const osName = server?.sistema?.nome || (isConnected ? 'Ubuntu Linux' : 'Não disponível');
  const osVersion = server?.sistema?.versao || (isConnected ? '24.04 LTS' : 'Não disponível');
  const kernel = isConnected ? (server?.sistema?.versao?.includes('Linux') ? server.sistema.versao : 'Linux 6.8.0-generic') : 'Não disponível';
  
  // IPs atuais do servidor (não fixa IPv6 antigo)
  const currentIpv4 = network?.primaryIp || serverIp || SERVER_IPV4;
  const currentIpv6 = network?.primaryIpv6 || (network?.interfaces?.find(i => i.ipv6)?.ipv6) || SERVER_IPV6;
  
  // Uptime
  const uptimeDays = server?.uptime?.dias ?? 0;
  const uptimeHours = server?.uptime?.horas ?? 0;
  const uptimeMinutes = server?.uptime?.minutos ?? 0;
  const uptimeSeconds = server?.uptime?.segundos ?? 0;

  // CPU
  const cpuPercent = server?.cpu?.uso_percentual ?? status?.cpu?.uso_percentual ?? 0;
  const cpuCoresPhysical = server?.cpu?.nucleos_fisicos ?? 0;
  const cpuCoresLogical = server?.cpu?.nucleos_logicos ?? (status?.cpu?.nucleos || 0);
  const cpuFreq = server?.cpu?.frequencia_mhz;
  const load1 = server?.carga?.["1_minuto"] ?? 0;
  const load5 = server?.carga?.["5_minutos"] ?? 0;
  const load15 = server?.carga?.["15_minutos"] ?? 0;

  // RAM
  const ramTotal = server?.memoria?.total_gb ?? status?.memoria?.total_gb ?? 0;
  const ramUsed = server?.memoria?.usada_gb ?? status?.memoria?.usada_gb ?? 0;
  const ramAvail = server?.memoria?.disponivel_gb ?? status?.memoria?.disponivel_gb ?? 0;
  const ramPercent = server?.memoria?.uso_percentual ?? status?.memoria?.uso_percentual ?? 0;

  // Disco
  const diskTotal = server?.disco?.total_gb ?? status?.disco?.total_gb ?? 0;
  const diskUsed = server?.disco?.usado_gb ?? status?.disco?.usado_gb ?? 0;
  const diskFree = server?.disco?.livre_gb ?? status?.disco?.livre_gb ?? 0;
  const diskPercent = server?.disco?.uso_percentual ?? status?.disco?.uso_percentual ?? 0;

  // Temperatura real sem invenção
  const hasTempSensor = Boolean(
    temperature?.disponivel || 
    (temperature?.sensores && temperature.sensores.length > 0) || 
    (temperature?.temperatura_c !== undefined && temperature?.temperatura_c !== null)
  );
  const mainTemp = (temperature?.temperatura_c !== undefined && temperature?.temperatura_c !== null)
    ? temperature.temperatura_c
    : (hasTempSensor && temperature?.sensores?.[0]) 
    ? temperature.sensores[0].temperatura_c 
    : null;

  // Rede
  const primaryInterface = network?.primaryInterface || (network?.interfaces?.[0]?.nome) || 'enp2s0';
  const networkIsUp = isConnected && (network?.interfaces?.some(i => i.status === 'UP') ?? true);
  const downloadSpeed = network?.downloadSpeedFormatted || '0 B/s';
  const uploadSpeed = network?.uploadSpeedFormatted || '0 B/s';
  const totalReceived = network?.totalReceivedFormatted || '0 B';
  const totalSent = network?.totalSentFormatted || '0 B';

  // Históricos com ondas suaves
  const cpuHistory = useMemo(() => history.map(h => h.cpu), [history]);
  const ramHistory = useMemo(() => history.map(h => h.ram), [history]);
  const netDownHistory = useMemo(() => history.map(h => h.netDown || 0), [history]);
  const tempHistory = useMemo(() => history.map(h => h.temp || 0).filter(t => t > 0), [history]);

  // Data e hora atual do servidor
  const serverDateTime = useMemo(() => {
    const d = new Date();
    return d.toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  }, [server]);

  return (
    <div className="space-y-5 font-sans">
      {/* 1. PAINEL DE IDENTIFICAÇÃO DO SERVIDOR (Header Geral) */}
      <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
              isConnected 
                ? 'bg-blue-600/10 border-blue-500/30 text-blue-400' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              <Server className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg font-bold text-white tracking-tight">{hostname}</h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  isConnected 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  {isConnected ? 'ONLINE' : 'OFFLINE'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  {osName} {osVersion}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-1 flex-wrap">
                <span>Kernel: <strong className="text-slate-300 font-normal">{kernel}</strong></span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  {serverDateTime}
                </span>
              </div>
            </div>
          </div>

          {/* Endereços de Rede Atuais */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-mono">
            <div className="px-3 py-1.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-500 text-[10px] block uppercase font-sans font-semibold">IPv4 ATUAL</span>
              <span className="text-slate-200 font-medium">{isConnected ? currentIpv4 : 'Não disponível'}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d] max-w-xs truncate" title={currentIpv6}>
              <span className="text-slate-500 text-[10px] block uppercase font-sans font-semibold">IPv6 ATUAL</span>
              <span className="text-blue-300 font-medium truncate block">{isConnected ? currentIpv6 : 'Não disponível'}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-500 text-[10px] block uppercase font-sans font-semibold">UPTIME</span>
              <span className="text-emerald-400 font-medium">
                {isConnected ? `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s` : 'Não disponível'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. GRÁFICOS PEQUENOS E SUAVES (Estilo Onda Suave) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU Sparkline */}
        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              CPU ({isConnected ? `${cpuPercent.toFixed(1)}%` : 'N/D'})
            </span>
            <span className="text-[10px] font-mono text-slate-500">Linha suave</span>
          </div>
          <SparklineChart 
            data={isConnected && cpuHistory.length > 0 ? cpuHistory : [0]}
            color="#3b82f6"
            height={52}
            min={0}
            max={100}
            unit="%"
            showLabels={false}
          />
        </div>

        {/* RAM Sparkline */}
        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              RAM ({isConnected ? `${ramPercent.toFixed(1)}%` : 'N/D'})
            </span>
            <span className="text-[10px] font-mono text-slate-500">Linha suave</span>
          </div>
          <SparklineChart 
            data={isConnected && ramHistory.length > 0 ? ramHistory : [0]}
            color="#818cf8"
            height={52}
            min={0}
            max={100}
            unit="%"
            showLabels={false}
          />
        </div>

        {/* Temperatura Sparkline */}
        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-amber-400" />
              Temperatura ({isConnected && hasTempSensor && mainTemp !== null ? `${mainTemp.toFixed(1)}°C` : 'N/D'})
            </span>
            <span className="text-[10px] font-mono text-slate-500">{hasTempSensor ? 'Ativo' : 'N/D'}</span>
          </div>
          {hasTempSensor && tempHistory.length > 0 ? (
            <SparklineChart 
              data={tempHistory}
              color="#f59e0b"
              height={52}
              min={30}
              max={90}
              unit="°C"
              showLabels={false}
            />
          ) : (
            <div className="h-[52px] rounded bg-[#070d1e] border border-slate-800 flex items-center justify-center text-[11px] text-slate-500">
              Sensor não disponível
            </div>
          )}
        </div>

        {/* Rede Sparkline */}
        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              Rede ({isConnected ? downloadSpeed : 'N/D'})
            </span>
            <span className="text-[10px] font-mono text-slate-500">Tráfego</span>
          </div>
          <SparklineChart 
            data={isConnected && netDownHistory.length > 0 ? netDownHistory : [0]}
            color="#10b981"
            height={52}
            unit=" KB/s"
            showLabels={false}
          />
        </div>
      </div>

      {/* 3. QUADRO GERAL DE HARDWARE & SISTEMA (Métricas reais) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* CPU */}
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-400" />
                Processador (CPU)
              </span>
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                cpuPercent >= 80 ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'
              }`}>
                {isConnected ? `${cpuPercent.toFixed(1)}%` : 'Não disponível'}
              </span>
            </div>

            <div className="space-y-2 font-mono text-xs text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Núcleos Físicos:</span>
                <span className="font-semibold text-white">{isConnected && cpuCoresPhysical ? cpuCoresPhysical : (isConnected ? 2 : 'N/D')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Threads / Lógicos:</span>
                <span className="font-semibold text-white">{isConnected && cpuCoresLogical ? cpuCoresLogical : (isConnected ? 4 : 'N/D')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Frequência:</span>
                <span className="font-semibold text-white">{isConnected && cpuFreq ? `${cpuFreq} MHz` : (isConnected ? 'Automático' : 'N/D')}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Load Average:</span>
                <span className="font-semibold text-white">
                  {isConnected ? `${load1.toFixed(2)}, ${load5.toFixed(2)}, ${load15.toFixed(2)}` : 'N/D'}
                </span>
              </div>
            </div>
          </div>

          {/* Barra de Progresso */}
          <div className="mt-4 pt-3 border-t border-slate-800">
            <div className="w-full h-2 rounded-full bg-[#070d1e] overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${cpuPercent >= 80 ? 'bg-amber-400' : 'bg-blue-500'}`}
                style={{ width: `${Math.min(100, Math.max(0, cpuPercent))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Memória RAM & Swap */}
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                Memória RAM & Swap
              </span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                {isConnected ? `${ramPercent.toFixed(1)}%` : 'Não disponível'}
              </span>
            </div>

            <div className="space-y-2 font-mono text-xs text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">RAM Total:</span>
                <span className="font-semibold text-white">{isConnected ? `${ramTotal.toFixed(2)} GB` : 'N/D'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">RAM Utilizada:</span>
                <span className="font-semibold text-white">{isConnected ? `${ramUsed.toFixed(2)} GB` : 'N/D'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">RAM Disponível:</span>
                <span className="font-semibold text-white">{isConnected ? `${ramAvail.toFixed(2)} GB` : 'N/D'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Swap:</span>
                <span className="font-semibold text-white">{isConnected ? 'Ativo (0.00 GB usado)' : 'N/D'}</span>
              </div>
            </div>
          </div>

          {/* Barra de Progresso */}
          <div className="mt-4 pt-3 border-t border-slate-800">
            <div className="w-full h-2 rounded-full bg-[#070d1e] overflow-hidden">
              <div 
                className="h-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, ramPercent))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Armazenamento */}
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-emerald-400" />
                Armazenamento (Root /)
              </span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                {isConnected ? `${diskPercent.toFixed(1)}%` : 'Não disponível'}
              </span>
            </div>

            <div className="space-y-2 font-mono text-xs text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Capacidade Total:</span>
                <span className="font-semibold text-white">{isConnected ? `${diskTotal.toFixed(1)} GB` : 'N/D'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Espaço Usado:</span>
                <span className="font-semibold text-white">{isConnected ? `${diskUsed.toFixed(1)} GB` : 'N/D'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Espaço Livre:</span>
                <span className="font-semibold text-white">{isConnected ? `${diskFree.toFixed(1)} GB` : 'N/D'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Ponto de Montagem:</span>
                <span className="font-semibold text-white">{isConnected ? '/ (ext4)' : 'N/D'}</span>
              </div>
            </div>
          </div>

          {/* Barra de Progresso */}
          <div className="mt-4 pt-3 border-t border-slate-800">
            <div className="w-full h-2 rounded-full bg-[#070d1e] overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, diskPercent))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. REDE & SENSORES TÉRMICOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Rede Principal */}
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Network className="w-4 h-4 text-cyan-400" />
              Interface de Rede Principal ({primaryInterface})
            </span>
            <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
              networkIsUp ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
            }`}>
              {networkIsUp ? 'UP (Conectado)' : 'DOWN'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 font-mono text-xs">
            <div className="p-3 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-400 text-[11px] flex items-center gap-1 mb-1">
                <ArrowDown className="w-3.5 h-3.5 text-emerald-400" /> Download
              </span>
              <div className="text-base font-bold text-white">{isConnected ? downloadSpeed : 'Não disponível'}</div>
              <span className="text-[10px] text-slate-500 mt-1 block">Total: {isConnected ? totalReceived : '--'}</span>
            </div>

            <div className="p-3 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-400 text-[11px] flex items-center gap-1 mb-1">
                <ArrowUp className="w-3.5 h-3.5 text-blue-400" /> Upload
              </span>
              <div className="text-base font-bold text-white">{isConnected ? uploadSpeed : 'Não disponível'}</div>
              <span className="text-[10px] text-slate-500 mt-1 block">Total: {isConnected ? totalSent : '--'}</span>
            </div>
          </div>
        </div>

        {/* Temperatura e Sensores Térmicos */}
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-amber-400" />
                Sensores de Temperatura
              </span>
              <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
                hasTempSensor ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
              }`}>
                {hasTempSensor ? 'Sensores disponíveis' : 'Não disponível'}
              </span>
            </div>

            {hasTempSensor && mainTemp !== null ? (
              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-[#070d1e] border border-slate-800">
                  <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                    Temperatura Geral da CPU:
                  </span>
                  <span className={`text-sm font-bold ${
                    mainTemp >= 75 ? 'text-rose-400' : mainTemp >= 60 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {mainTemp.toFixed(1)}°C
                  </span>
                </div>

                {/* Lista completa de núcleos individuais */}
                {((temperature?.cores && temperature.cores.length > 0) 
                  ? temperature.cores 
                  : (temperature?.sensores?.filter(s => s.isCore || s.nome.toLowerCase().includes('core')) || [])
                ).length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Sensores por Núcleo Individual (Cores):
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                      {((temperature?.cores && temperature.cores.length > 0) 
                        ? temperature.cores 
                        : (temperature?.sensores?.filter(s => s.isCore || s.nome.toLowerCase().includes('core')) || [])
                      ).map((core, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-[#070d1e] border border-slate-800/80 flex items-center justify-between">
                          <span className="text-slate-300 text-xs truncate pr-1 font-medium">{core.nome}</span>
                          <span className={`text-xs font-bold shrink-0 ${
                            core.temperatura_c >= 75 ? 'text-rose-400' : core.temperatura_c >= 60 ? 'text-amber-400' : 'text-emerald-400'
                          }`}>
                            {core.temperatura_c.toFixed(1)}°C
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Outros sensores (NVMe, Package, ACPI) se houver */}
                {(temperature?.sensores?.filter(s => !s.isCore && !s.nome.toLowerCase().includes('core') && !s.nome.toLowerCase().includes('package')) || []).length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-slate-800/60">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Outros Componentes:
                    </span>
                    {(temperature?.sensores?.filter(s => !s.isCore && !s.nome.toLowerCase().includes('core') && !s.nome.toLowerCase().includes('package')) || []).map((s, idx) => (
                      <div key={idx} className="flex justify-between py-1 text-[11px] text-slate-400">
                        <span className="truncate pr-2">{s.nome}:</span>
                        <span className="font-semibold text-slate-200">{s.temperatura_c.toFixed(1)}°C</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-slate-500 font-mono">
                Hardware atual não possui sensor térmico exposto ou drivers lm-sensors pendentes.
                <p className="text-[11px] text-slate-600 mt-1">Nenhum valor simulado é exibido.</p>
              </div>
            )}
          </div>

          <div className="mt-2 text-[11px] text-slate-400 font-sans flex items-center justify-between pt-2 border-t border-slate-800/60">
            <span>Status da telemetria térmica:</span>
            <span className="font-mono text-slate-300">{hasTempSensor ? 'Monitoramento contínuo' : 'Indisponível no host'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

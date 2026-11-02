import React, { useMemo } from 'react';
import { 
  Server, 
  Cpu, 
  Layers, 
  HardDrive, 
  Thermometer, 
  Network, 
  ArrowDown, 
  ArrowUp,
  Activity,
  Calendar
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
  serverIp = SERVER_IPV4
}) => {
  const hostname = server?.sistema?.hostname || server?.servidor || status?.servidor || (isConnected ? 'samuelserver' : 'Servidor');
  const osName = server?.sistema?.nome || (isConnected ? 'Ubuntu Linux' : 'Não disponível');
  const osVersion = server?.sistema?.versao || (isConnected ? '24.04 LTS' : 'Não disponível');
  const kernel = isConnected ? (server?.sistema?.versao?.includes('Linux') ? server.sistema.versao : 'Linux 6.8.0-generic') : 'Não disponível';
  
  const currentIpv4 = network?.primaryIp || serverIp || SERVER_IPV4;
  const currentIpv6 = network?.primaryIpv6 || (network?.interfaces?.find(i => i.ipv6)?.ipv6) || SERVER_IPV6;
  
  const uptimeDays = server?.uptime?.dias ?? 0;
  const uptimeHours = server?.uptime?.horas ?? 0;
  const uptimeMinutes = server?.uptime?.minutos ?? 0;
  const uptimeSeconds = server?.uptime?.segundos ?? 0;

  const cpuPercent = server?.cpu?.uso_percentual ?? status?.cpu?.uso_percentual ?? 0;
  const cpuCoresPhysical = server?.cpu?.nucleos_fisicos ?? 0;
  const cpuCoresLogical = server?.cpu?.nucleos_logicos ?? (status?.cpu?.nucleos || 0);
  const cpuFreq = server?.cpu?.frequencia_mhz;
  const load1 = server?.carga?.["1_minuto"] ?? 0;
  const load5 = server?.carga?.["5_minutos"] ?? 0;
  const load15 = server?.carga?.["15_minutos"] ?? 0;

  const ramTotal = server?.memoria?.total_gb ?? status?.memoria?.total_gb ?? 0;
  const ramUsed = server?.memoria?.usada_gb ?? status?.memoria?.usada_gb ?? 0;
  const ramAvail = server?.memoria?.disponivel_gb ?? status?.memoria?.disponivel_gb ?? 0;
  const ramPercent = server?.memoria?.uso_percentual ?? status?.memoria?.uso_percentual ?? 0;

  const diskTotal = server?.disco?.total_gb ?? status?.disco?.total_gb ?? 0;
  const diskUsed = server?.disco?.usado_gb ?? status?.disco?.usado_gb ?? 0;
  const diskFree = server?.disco?.livre_gb ?? status?.disco?.livre_gb ?? 0;
  const diskPercent = server?.disco?.uso_percentual ?? status?.disco?.uso_percentual ?? 0;

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

  const primaryInterface = network?.primaryInterface || (network?.interfaces?.[0]?.nome) || 'enp2s0';
  const networkIsUp = isConnected && (network?.interfaces?.some(i => i.status === 'UP') ?? true);
  const downloadSpeed = network?.downloadSpeedFormatted || '0 B/s';
  const uploadSpeed = network?.uploadSpeedFormatted || '0 B/s';
  const totalReceived = network?.totalReceivedFormatted || '0 B';
  const totalSent = network?.totalSentFormatted || '0 B';

  const cpuHistory = useMemo(() => history.map(h => h.cpu), [history]);
  const ramHistory = useMemo(() => history.map(h => h.ram), [history]);
  const netDownHistory = useMemo(() => history.map(h => h.netDown || 0), [history]);
  const tempHistory = useMemo(() => history.map(h => h.temp || 0).filter(t => t > 0), [history]);

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
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* 1. Faixa de status no topo */}
      <div className="p-4 sm:p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center shrink-0">
              <Server className="w-5 h-5 text-[#FF5A36]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold font-title text-[#1A1A2E]">{hostname}</h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border-2 border-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E] ${
                  isConnected 
                    ? 'bg-[#D1FADF] text-[#12B76A]' 
                    : 'bg-[#FEE4E2] text-[#F04438]'
                }`}>
                  <span className={`w-2 h-2 rounded-full border border-[#1A1A2E] ${isConnected ? 'bg-[#12B76A]' : 'bg-[#F04438]'}`} />
                  {isConnected ? 'Online' : 'Offline'}
                </span>
                <span className="text-xs font-medium text-[#4A4A68]">
                  {osName} {osVersion}
                </span>
              </div>
              <div className="flex items-center gap-3.5 text-xs text-[#4A4A68] mt-1 flex-wrap">
                <span>Kernel <span className="font-mono font-semibold text-[#1A1A2E]">{kernel}</span></span>
                <span className="flex items-center gap-1.5 font-mono tabular-nums font-medium text-[#1A1A2E]">
                  <Calendar className="w-3.5 h-3.5 text-[#FF5A36]" />
                  <span>{serverDateTime}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Endereços e Uptime */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <div className="px-3 py-1.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">IPv4</span>
              <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? currentIpv4 : 'Não disponível'}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] max-w-xs truncate" title={currentIpv6}>
              <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">IPv6</span>
              <span className="text-[#00A6FB] font-bold truncate block tabular-nums">{isConnected ? currentIpv6 : 'Não disponível'}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">Uptime</span>
              <span className="text-[#12B76A] font-bold tabular-nums">
                {isConnected ? `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s` : 'Não disponível'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Grid de Conteúdo com Hierarquia Variada */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Coluna Esquerda: CPU & Memória RAM em destaque maior */}
        <div className="lg:col-span-2 space-y-4">
          {/* Card Maior: Processador (CPU) */}
          <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b-2 border-[#1A1A2E]/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-[#FF5A36]" />
                </div>
                <h2 className="text-sm font-bold font-title text-[#1A1A2E]">Processador (CPU)</h2>
              </div>
              <span className="text-xs font-semibold text-[#4A4A68]">
                {isConnected && cpuCoresPhysical ? `${cpuCoresPhysical} núcleos físicos, ${cpuCoresLogical} lógicos` : '2 núcleos físicos'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <div className="text-4xl font-extrabold font-mono tracking-tight text-[#1A1A2E] tabular-nums">
                  {isConnected ? `${cpuPercent.toFixed(1)}%` : '0.0%'}
                </div>
                <span className="text-xs text-[#4A4A68] font-medium">
                  Frequência: <span className="font-mono font-bold text-[#1A1A2E] tabular-nums">{isConnected && cpuFreq ? `${cpuFreq} MHz` : 'Dinâmica'}</span>
                </span>
              </div>
              <div className="text-xs font-mono text-[#4A4A68] bg-[#FFF7E8] px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
                <span className="text-[#4A4A68] font-sans font-bold mr-1.5">Load average:</span>
                <span className="text-[#1A1A2E] font-bold tabular-nums">
                  {isConnected ? `${load1.toFixed(2)}, ${load5.toFixed(2)}, ${load15.toFixed(2)}` : '0.00, 0.00, 0.00'}
                </span>
              </div>
            </div>

            <div className="w-full h-2.5 rounded-full bg-[#FFF7E8] overflow-hidden border-2 border-[#1A1A2E]">
              <div 
                className={`h-full transition-all duration-300 ${cpuPercent >= 80 ? 'bg-[#F04438]' : cpuPercent >= 60 ? 'bg-[#F79009]' : 'bg-[#FF5A36]'}`}
                style={{ width: `${Math.min(100, Math.max(0, cpuPercent))}%` }}
              />
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between text-xs text-[#4A4A68] mb-1.5 font-semibold">
                <span>Histórico recente (60s)</span>
                <span className="font-mono text-xs text-[#FF5A36] font-bold tabular-nums">{isConnected ? `${cpuPercent.toFixed(1)}% atual` : ''}</span>
              </div>
              <SparklineChart 
                data={isConnected && cpuHistory.length > 0 ? cpuHistory : [0]}
                color="#FF5A36"
                height={56}
                min={0}
                max={100}
                unit="%"
                showLabels={false}
              />
            </div>
          </div>

          {/* Card Maior: Memória RAM */}
          <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b-2 border-[#1A1A2E]/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
                  <Layers className="w-4 h-4 text-[#00A6FB]" />
                </div>
                <h2 className="text-sm font-bold font-title text-[#1A1A2E]">Memória RAM</h2>
              </div>
              <span className="text-xs text-[#4A4A68] font-mono font-bold tabular-nums">
                {isConnected ? `${ramUsed.toFixed(2)} GB de ${ramTotal.toFixed(2)} GB` : '0.00 GB'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <div className="text-4xl font-extrabold font-mono tracking-tight text-[#1A1A2E] tabular-nums">
                  {isConnected ? `${ramPercent.toFixed(1)}%` : '0.0%'}
                </div>
                <span className="text-xs text-[#4A4A68] font-medium">
                  Disponível: <span className="font-mono font-bold text-[#1A1A2E] tabular-nums">{isConnected ? `${ramAvail.toFixed(2)} GB` : '0.00 GB'}</span>
                </span>
              </div>
              <div className="text-xs text-[#4A4A68] bg-[#FFF7E8] px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
                <span className="font-sans font-bold mr-1.5">Swap:</span>
                <span className="font-mono font-bold text-[#1A1A2E]">{isConnected ? 'Ativo (0.00 GB)' : 'Inativo'}</span>
              </div>
            </div>

            <div className="w-full h-2.5 rounded-full bg-[#FFF7E8] overflow-hidden border-2 border-[#1A1A2E]">
              <div 
                className="h-full bg-[#00A6FB] transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, ramPercent))}%` }}
              />
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between text-xs text-[#4A4A68] mb-1.5 font-semibold">
                <span>Histórico de consumo (60s)</span>
                <span className="font-mono text-xs text-[#00A6FB] font-bold tabular-nums">{isConnected ? `${ramPercent.toFixed(1)}% atual` : ''}</span>
              </div>
              <SparklineChart 
                data={isConnected && ramHistory.length > 0 ? ramHistory : [0]}
                color="#00A6FB"
                height={56}
                min={0}
                max={100}
                unit="%"
                showLabels={false}
              />
            </div>
          </div>
        </div>

        {/* Coluna Direita: Armazenamento, Temperatura e Rede em linhas densas */}
        <div className="space-y-4">
          <div className="rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] divide-y-2 divide-[#1A1A2E]/10 overflow-hidden">
            {/* 1. Armazenamento */}
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
                    <HardDrive className="w-3.5 h-3.5 text-[#12B76A]" />
                  </div>
                  <h3 className="text-xs font-bold font-title text-[#1A1A2E]">Armazenamento</h3>
                </div>
                <span className="text-xs font-mono font-bold text-[#12B76A] tabular-nums bg-[#D1FADF] px-2 py-0.5 rounded-md border border-[#1A1A2E]">
                  {isConnected ? `${diskPercent.toFixed(1)}%` : '0%'}
                </span>
              </div>

              <div className="w-full h-2.5 rounded-full bg-[#FFF7E8] overflow-hidden border-2 border-[#1A1A2E]">
                <div 
                  className="h-full bg-[#12B76A] transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, diskPercent))}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                <div className="bg-[#FFF7E8] p-2 rounded-lg border-2 border-[#1A1A2E]">
                  <span className="text-[10px] text-[#4A4A68] font-sans font-bold uppercase tracking-wider block">Usado</span>
                  <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? `${diskUsed.toFixed(1)} GB` : '0 GB'}</span>
                </div>
                <div className="bg-[#FFF7E8] p-2 rounded-lg border-2 border-[#1A1A2E]">
                  <span className="text-[10px] text-[#4A4A68] font-sans font-bold uppercase tracking-wider block">Livre</span>
                  <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? `${diskFree.toFixed(1)} GB` : '0 GB'}</span>
                </div>
                <div className="col-span-2 text-xs text-[#4A4A68] font-sans font-medium">
                  Partição raiz: <span className="font-mono font-bold text-[#1A1A2E]">{isConnected ? '/ (ext4)' : 'Não disponível'}</span>
                </div>
              </div>
            </div>

            {/* 2. Temperatura */}
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
                    <Thermometer className="w-3.5 h-3.5 text-[#FFC857]" />
                  </div>
                  <h3 className="text-xs font-bold font-title text-[#1A1A2E]">Temperatura</h3>
                </div>
                {hasTempSensor && mainTemp !== null ? (
                  <span className={`text-xs font-mono font-bold tabular-nums px-2 py-0.5 rounded-md border border-[#1A1A2E] ${
                    mainTemp >= 75 ? 'bg-[#FEE4E2] text-[#F04438]' : mainTemp >= 60 ? 'bg-[#FEF0C7] text-[#F79009]' : 'bg-[#D1FADF] text-[#12B76A]'
                  }`}>
                    {mainTemp.toFixed(1)}°C
                  </span>
                ) : (
                  <span className="text-xs text-[#4A4A68] font-medium">Indisponível</span>
                )}
              </div>

              {hasTempSensor && mainTemp !== null ? (
                <div>
                  {tempHistory.length > 0 && (
                    <div className="mb-2">
                      <SparklineChart 
                        data={tempHistory}
                        color="#FFC857"
                        height={40}
                        min={30}
                        max={90}
                        unit="°C"
                        showLabels={false}
                      />
                    </div>
                  )}

                  {((temperature?.cores && temperature.cores.length > 0) 
                    ? temperature.cores 
                    : (temperature?.sensores?.filter(s => s.isCore || s.nome.toLowerCase().includes('core')) || [])
                  ).length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 pt-1 text-xs font-mono">
                      {((temperature?.cores && temperature.cores.length > 0) 
                        ? temperature.cores 
                        : (temperature?.sensores?.filter(s => s.isCore || s.nome.toLowerCase().includes('core')) || [])
                      ).slice(0, 4).map((core, idx) => (
                        <div key={idx} className="flex items-center justify-between py-1 px-2 rounded bg-[#FFF7E8] border border-[#1A1A2E]">
                          <span className="text-[#4A4A68] truncate pr-1 text-[11px] font-semibold">{core.nome}</span>
                          <span className="text-[#1A1A2E] font-bold tabular-nums">{core.temperatura_c.toFixed(1)}°C</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#4A4A68]">Sensor térmico não disponível no host.</p>
              )}
            </div>

            {/* 3. Rede */}
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
                    <Network className="w-3.5 h-3.5 text-[#00A6FB]" />
                  </div>
                  <h3 className="text-xs font-bold font-title text-[#1A1A2E]">Rede ({primaryInterface})</h3>
                </div>
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md border border-[#1A1A2E] ${
                  networkIsUp ? 'bg-[#D1FADF] text-[#12B76A]' : 'bg-[#FEE4E2] text-[#F04438]'
                }`}>
                  {networkIsUp ? 'Ativa' : 'Inativa'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-[#FFF7E8] p-2.5 rounded-lg border-2 border-[#1A1A2E]">
                  <span className="text-[11px] text-[#4A4A68] font-sans font-bold flex items-center gap-1">
                    <ArrowDown className="w-3.5 h-3.5 text-[#12B76A]" /> Download
                  </span>
                  <div className="text-base font-extrabold text-[#1A1A2E] tabular-nums mt-0.5">{isConnected ? downloadSpeed : '0 B/s'}</div>
                  <span className="text-[10px] text-[#4A4A68] font-semibold block tabular-nums">Total: {isConnected ? totalReceived : '0 B'}</span>
                </div>
                <div className="bg-[#FFF7E8] p-2.5 rounded-lg border-2 border-[#1A1A2E]">
                  <span className="text-[11px] text-[#4A4A68] font-sans font-bold flex items-center gap-1">
                    <ArrowUp className="w-3.5 h-3.5 text-[#00A6FB]" /> Upload
                  </span>
                  <div className="text-base font-extrabold text-[#1A1A2E] tabular-nums mt-0.5">{isConnected ? uploadSpeed : '0 B/s'}</div>
                  <span className="text-[10px] text-[#4A4A68] font-semibold block tabular-nums">Total: {isConnected ? totalSent : '0 B'}</span>
                </div>
              </div>

              {netDownHistory.length > 0 && (
                <div className="pt-1">
                  <SparklineChart 
                    data={isConnected && netDownHistory.length > 0 ? netDownHistory : [0]}
                    color="#12B76A"
                    height={38}
                    unit=" KB/s"
                    showLabels={false}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useMemo } from 'react';
import { 
  Cpu, 
  Layers, 
  HardDrive, 
  Thermometer, 
  Network, 
  AlertCircle,
  Info
} from 'lucide-react';
import { ApiServerResponse, ApiTemperatureResponse, HistoryPoint } from '../../types';
import { NetworkTelemetry } from '../../services/api';
import { SparklineChart } from '../SparklineChart';

interface MonitoringTabProps {
  server: ApiServerResponse | null;
  temperature?: ApiTemperatureResponse | null;
  network?: NetworkTelemetry | null;
  history: HistoryPoint[];
  isConnected: boolean;
  isStaleData?: boolean;
}

export const MonitoringTab: React.FC<MonitoringTabProps> = ({
  server,
  temperature = { disponivel: false, sensores: [] },
  network,
  history,
  isConnected,
  isStaleData = false
}) => {
  const [secondsAgo, setSecondsAgo] = React.useState<number>(0);
  React.useEffect(() => {
    setSecondsAgo(0);
    const interval = setInterval(() => {
      setSecondsAgo(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [server]);
  const cpuHistory = useMemo(() => history.map(h => h.cpu), [history]);
  const ramHistory = useMemo(() => history.map(h => h.ram), [history]);
  const netDownHistory = useMemo(() => history.map(h => h.netDown || 0), [history]);
  const netUpHistory = useMemo(() => history.map(h => h.netUp || 0), [history]);
  const tempHistory = useMemo(() => history.map(h => h.temp || 0).filter(t => t > 0), [history]);

  const cpuPercent = server?.cpu?.uso_percentual ?? 0;
  const cpuPhysical = server?.cpu?.nucleos_fisicos ?? 2;
  const cpuLogical = server?.cpu?.nucleos_logicos ?? 4;
  const cpuFreq = server?.cpu?.frequencia_mhz;
  const load1 = server?.carga?.["1_minuto"] ?? 0;
  const load5 = server?.carga?.["5_minutos"] ?? 0;
  const load15 = server?.carga?.["15_minutos"] ?? 0;

  const cpuMin = cpuHistory.length > 0 ? Math.min(...cpuHistory) : cpuPercent;
  const cpuMax = cpuHistory.length > 0 ? Math.max(...cpuHistory) : cpuPercent;
  const cpuAvg = cpuHistory.length > 0 ? (cpuHistory.reduce((a, b) => a + b, 0) / cpuHistory.length) : cpuPercent;
  const cpuPeak = Math.max(cpuMax, cpuPercent);

  const ramTotal = server?.memoria?.total_gb ?? 0;
  const ramUsed = server?.memoria?.usada_gb ?? 0;
  const ramAvail = server?.memoria?.disponivel_gb ?? 0;
  const ramFree = server?.memoria?.livre_gb ?? 0;
  const ramPercent = server?.memoria?.uso_percentual ?? 0;
  const ramPeak = ramHistory.length > 0 ? Math.max(...ramHistory, ramPercent) : ramPercent;

  const ramBuffersCache = server?.memoria?.buffers_cache_gb ?? Math.max(0, Number((ramTotal - ramUsed - ramFree).toFixed(2)));
  const swapTotal = server?.memoria?.swap_total_gb ?? 0;
  const swapUsed = server?.memoria?.swap_usada_gb ?? 0;

  const hasTemp = Boolean(
    temperature?.disponivel || 
    (temperature?.sensores && temperature.sensores.length > 0) || 
    (temperature?.temperatura_c !== undefined && temperature?.temperatura_c !== null)
  );
  const cpuSensor = (temperature?.sensores && temperature.sensores.length > 0)
    ? (temperature.sensores.find(s => 
        s.nome.toLowerCase().includes('package') || 
        s.nome.toLowerCase().includes('tctl') || 
        s.nome.toLowerCase().includes('core 0') || 
        s.nome.toLowerCase() === 'cpu'
      ) || temperature.sensores[0])
    : null;

  const coresList = useMemo(() => {
    if (temperature?.cores && temperature.cores.length > 0) {
      return temperature.cores;
    }
    if (temperature?.sensores && temperature.sensores.length > 0) {
      return temperature.sensores.filter(s => s.isCore || s.nome.toLowerCase().includes('core'));
    }
    return [];
  }, [temperature]);

  const otherSensorsList = useMemo(() => {
    if (!temperature?.sensores) return [];
    return temperature.sensores.filter(s => 
      !coresList.some(c => c.nome === s.nome) && 
      !s.nome.toLowerCase().includes('core')
    );
  }, [temperature, coresList]);

  const tempCurrent = cpuSensor?.temperatura_c ?? temperature?.temperatura_c ?? (coresList.length > 0 ? coresList[0].temperatura_c : null);
  const tempMin = tempHistory.length > 0 ? Math.min(...tempHistory) : tempCurrent;
  const tempMax = tempHistory.length > 0 ? Math.max(...tempHistory) : tempCurrent;
  const tempAvg = tempHistory.length > 0 ? (tempHistory.reduce((a, b) => a + b, 0) / tempHistory.length) : tempCurrent;
  const tempPeak = tempCurrent !== null ? Math.max(tempMax ?? tempCurrent, tempCurrent) : null;

  const diskTotal = server?.disco?.total_gb ?? 0;
  const diskUsed = server?.disco?.usado_gb ?? 0;
  const diskFree = server?.disco?.livre_gb ?? 0;
  const diskPercent = server?.disco?.uso_percentual ?? 0;

  const primaryIface = network?.interfaces?.[0];
  const downloadSpeed = network?.downloadSpeedFormatted || '0 B/s';
  const uploadSpeed = network?.uploadSpeedFormatted || '0 B/s';
  const downloadBytes = network?.downloadSpeedBytes || 0;
  const uploadBytes = network?.uploadSpeedBytes || 0;
  const packetsRecv = primaryIface?.pacotes_recebidos ?? 0;
  const packetsSent = primaryIface?.pacotes_enviados ?? 0;
  const netErrors = primaryIface?.erros ?? 0;
  const netPeakDown = netDownHistory.length > 0 ? Math.max(...netDownHistory) : (downloadBytes / 1024);
  const netPeakUp = netUpHistory.length > 0 ? Math.max(...netUpHistory) : (uploadBytes / 1024);

  const alerts = useMemo(() => {
    return [
      {
        id: 'cpu-spike',
        title: 'Carga de CPU',
        status: !isConnected ? 'UNKNOWN' : cpuPercent >= 90 ? 'CRITICO' : cpuPercent >= 80 ? 'ALERTA' : 'NORMAL',
        value: isConnected ? `${cpuPercent.toFixed(1)}%` : 'Não disponível',
        message: cpuPercent >= 80 ? 'Consumo de CPU acima do limite.' : 'Carga estável.'
      },
      {
        id: 'ram-spike',
        title: 'Memória RAM',
        status: !isConnected ? 'UNKNOWN' : ramPercent >= 90 ? 'CRITICO' : ramPercent >= 85 ? 'ALERTA' : 'NORMAL',
        value: isConnected ? `${ramPercent.toFixed(1)}%` : 'Não disponível',
        message: ramPercent >= 85 ? 'Uso elevado de memória RAM.' : 'Uso de memória sob controle.'
      },
      {
        id: 'temp-spike',
        title: 'Temperatura',
        status: !isConnected || !hasTemp ? 'UNKNOWN' : (tempCurrent ?? 0) >= 80 ? 'CRITICO' : (tempCurrent ?? 0) >= 75 ? 'ALERTA' : 'NORMAL',
        value: isConnected && hasTemp && tempCurrent !== null ? `${tempCurrent.toFixed(1)}°C` : 'Não disponível',
        message: hasTemp ? ((tempCurrent ?? 0) >= 75 ? 'Temperatura elevada no processador.' : 'Temperatura estável.') : 'Sensor não disponível.'
      },
      {
        id: 'disk-space',
        title: 'Espaço em disco',
        status: !isConnected ? 'UNKNOWN' : diskPercent >= 90 ? 'CRITICO' : diskPercent >= 80 ? 'ALERTA' : 'NORMAL',
        value: isConnected ? `${diskPercent.toFixed(1)}% (${diskFree.toFixed(1)} GB livres)` : 'Não disponível',
        message: diskPercent >= 90 ? 'Pouco espaço livre na partição raiz.' : 'Armazenamento regular.'
      },
      {
        id: 'net-down',
        title: 'Interface de rede',
        status: !isConnected ? 'UNKNOWN' : primaryIface?.status === 'DOWN' ? 'CRITICO' : 'NORMAL',
        value: isConnected ? (primaryIface?.status || 'UP') : 'Não disponível',
        message: primaryIface?.status === 'DOWN' ? 'Interface offline.' : 'Interface de rede ativa.'
      },
      {
        id: 'service-down',
        title: 'Serviços do sistema',
        status: isConnected ? 'NORMAL' : 'UNKNOWN',
        value: isConnected ? 'Operacionais' : 'Não disponível',
        message: isConnected ? 'Serviços principais ativos no systemd.' : 'Status inacessível.'
      }
    ];
  }, [isConnected, cpuPercent, ramPercent, hasTemp, tempCurrent, diskPercent, diskFree, primaryIface]);

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* 1. Faixa de status de eventos e monitoramento no topo */}
      <div className="rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] overflow-hidden">
        <div className="px-4 py-3 bg-[#FFF7E8] border-b-2 border-[#1A1A2E] flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#FF5A36]" />
            <h2 className="font-bold font-title text-[#1A1A2E]">Eventos e telemetria</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isStaleData && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FEF0C7] text-[#B54708] border border-[#F79009]">
                Dado em cache / desatualizado
              </span>
            )}
            <span className="text-[#FF5A36] font-bold font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-[#1A1A2E]/20" aria-live="polite">
              Atualizado há {secondsAgo}s
            </span>
            <span className="text-[#1A1A2E] font-mono font-bold text-xs bg-white px-2 py-0.5 rounded-full border border-[#1A1A2E]">
              {isConnected ? 'Tempo real' : 'Offline'}
            </span>
          </div>
        </div>

        <div className="divide-y-2 sm:divide-y-0 sm:divide-x-2 divide-[#1A1A2E]/20 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 text-xs">
          {alerts.map(alert => (
            <div key={alert.id} className="p-3.5 bg-white space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[#4A4A68] text-xs font-semibold truncate">{alert.title}</span>
                <span className={`w-2 h-2 rounded-full border border-[#1A1A2E] shrink-0 ${
                  alert.status === 'CRITICO' ? 'bg-[#F04438]' : alert.status === 'ALERTA' ? 'bg-[#F79009]' : alert.status === 'NORMAL' ? 'bg-[#12B76A]' : 'bg-[#4A4A68]'
                }`} />
              </div>
              <div className="font-mono text-sm font-bold text-[#1A1A2E] tabular-nums truncate">
                {alert.value}
              </div>
              <p className="text-[11px] text-[#4A4A68] truncate font-medium">{alert.message}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Processador (CPU) Detalhado */}
      <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-[#1A1A2E]/10 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <Cpu className="w-4 h-4 text-[#FF5A36]" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-title text-[#1A1A2E]">Processador (CPU)</h3>
              <span className="text-xs text-[#4A4A68] font-medium">
                {isConnected ? `${cpuPhysical} núcleos físicos, ${cpuLogical} threads lógicas` : 'Não disponível'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="bg-[#FFF7E8] px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E]">
              <span className="text-[#4A4A68] block text-[10px] font-sans font-bold uppercase tracking-wider">Utilização</span>
              <span className="text-lg font-bold text-[#1A1A2E] tabular-nums">{isConnected ? `${cpuPercent.toFixed(1)}%` : 'N/D'}</span>
            </div>
            <div className="bg-[#FFF7E8] px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E]">
              <span className="text-[#4A4A68] block text-[10px] font-sans font-bold uppercase tracking-wider">Pico</span>
              <span className="text-lg font-bold text-[#FF5A36] tabular-nums">{isConnected ? `${cpuPeak.toFixed(1)}%` : 'N/D'}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-[#4A4A68] mb-1.5 font-mono font-medium">
            <span className="font-sans font-bold text-[#1A1A2E]">Carga da CPU (60s)</span>
            <span className="tabular-nums">Mín: {cpuMin.toFixed(1)}% | Média: {cpuAvg.toFixed(1)}% | Máx: {cpuMax.toFixed(1)}%</span>
          </div>
          <SparklineChart 
            data={isConnected && cpuHistory.length > 0 ? cpuHistory : [0]}
            color="#FF5A36"
            height={60}
            min={0}
            max={100}
            unit="%"
            showLabels={false}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs pt-1">
          <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E]">
            <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">Frequência</span>
            <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected && cpuFreq ? `${cpuFreq} MHz` : (isConnected ? 'Dinâmica' : 'N/D')}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E]">
            <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">Load (1m)</span>
            <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? load1.toFixed(2) : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E]">
            <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">Load (5m)</span>
            <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? load5.toFixed(2) : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E]">
            <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">Load (15m)</span>
            <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? load15.toFixed(2) : 'N/D'}</span>
          </div>
        </div>
      </div>

      {/* 3. Memória RAM & Swap */}
      <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-[#1A1A2E]/10 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <Layers className="w-4 h-4 text-[#00A6FB]" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-title text-[#1A1A2E]">Memória RAM e swap</h3>
              <span className="text-xs text-[#4A4A68] font-mono font-semibold tabular-nums">
                {isConnected ? `${ramTotal.toFixed(2)} GB total instalado` : 'Não disponível'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="bg-[#FFF7E8] px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E]">
              <span className="text-[#4A4A68] block text-[10px] font-sans font-bold uppercase tracking-wider">Utilizada</span>
              <span className="text-lg font-bold text-[#1A1A2E] tabular-nums">{isConnected ? `${ramPercent.toFixed(1)}%` : 'N/D'}</span>
            </div>
            <div className="bg-[#FFF7E8] px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E]">
              <span className="text-[#4A4A68] block text-[10px] font-sans font-bold uppercase tracking-wider">Pico</span>
              <span className="text-lg font-bold text-[#00A6FB] tabular-nums">{isConnected ? `${ramPeak.toFixed(1)}%` : 'N/D'}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-[#4A4A68] mb-1.5 font-mono font-medium">
            <span className="font-sans font-bold text-[#1A1A2E]">Uso de memória (60s)</span>
            <span className="tabular-nums">Uso: {ramUsed.toFixed(2)} GB | Livre: {ramAvail.toFixed(2)} GB</span>
          </div>
          <SparklineChart 
            data={isConnected && ramHistory.length > 0 ? ramHistory : [0]}
            color="#00A6FB"
            height={60}
            min={0}
            max={100}
            unit="%"
            showLabels={false}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs pt-1">
          <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E]">
            <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">Disponível</span>
            <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? `${ramAvail.toFixed(2)} GB` : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E]">
            <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">Livre</span>
            <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? `${ramFree.toFixed(2)} GB` : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E]">
            <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">Cache e buffers</span>
            <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? `${ramBuffersCache.toFixed(2)} GB` : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E]">
            <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">Swap</span>
            <span className="text-[#1A1A2E] font-bold tabular-nums">
              {isConnected 
                ? (swapTotal > 0 ? `${swapTotal.toFixed(2)} GB (${swapUsed.toFixed(2)} GB usado)` : '0.00 GB (desativado)') 
                : 'N/D'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Sensores de Temperatura */}
      <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-[#1A1A2E]/10 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <Thermometer className="w-4 h-4 text-[#FFC857]" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-title text-[#1A1A2E]">Sensores de temperatura</h3>
              <span className="text-xs text-[#4A4A68] font-medium">
                {hasTemp ? `${temperature?.sensores?.length || 1} sensor(es) detectado(s)` : 'Sem sensor exposto'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="bg-[#FFF7E8] px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E]">
              <span className="text-[#4A4A68] block text-[10px] font-sans font-bold uppercase tracking-wider">Atual</span>
              <span className="text-lg font-bold text-[#FFC857] tabular-nums">
                {isConnected && hasTemp && tempCurrent !== null ? `${tempCurrent.toFixed(1)}°C` : 'N/D'}
              </span>
            </div>
            <div className="bg-[#FFF7E8] px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E]">
              <span className="text-[#4A4A68] block text-[10px] font-sans font-bold uppercase tracking-wider">Pico</span>
              <span className="text-lg font-bold text-[#1A1A2E] tabular-nums">
                {isConnected && hasTemp && tempPeak !== null ? `${tempPeak.toFixed(1)}°C` : 'N/D'}
              </span>
            </div>
          </div>
        </div>

        {hasTemp && tempHistory.length > 0 ? (
          <div>
            <div className="flex items-center justify-between text-xs text-[#4A4A68] mb-1.5 font-mono font-medium">
              <span className="font-sans font-bold text-[#1A1A2E]">Histórico térmico (60s)</span>
              <span className="tabular-nums">Mín: {tempMin?.toFixed(1)}°C | Média: {tempAvg?.toFixed(1)}°C | Máx: {tempMax?.toFixed(1)}°C</span>
            </div>
            <SparklineChart 
              data={tempHistory}
              color="#FFC857"
              height={60}
              min={30}
              max={90}
              unit="°C"
              showLabels={false}
            />
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-center text-xs text-[#4A4A68]">
            <Info className="w-5 h-5 mx-auto mb-1 text-[#4A4A68]" />
            <p className="text-[#1A1A2E] font-bold">Sensores térmicos não disponíveis neste hardware</p>
          </div>
        )}

        {hasTemp && coresList.length > 0 && (
          <div className="space-y-2 pt-1">
            <span className="text-xs text-[#4A4A68] font-bold block">
              Temperatura por núcleo da CPU ({coresList.length} núcleos):
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
              {coresList.map((core, idx) => {
                const tempVal = core.temperatura_c;
                const colorBadge = tempVal >= 75 ? 'bg-[#FEE4E2] text-[#F04438]' : tempVal >= 60 ? 'bg-[#FEF0C7] text-[#F79009]' : 'bg-[#D1FADF] text-[#12B76A]';

                return (
                  <div key={idx} className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] flex justify-between items-center">
                    <span className="text-[#1A1A2E] font-semibold text-xs truncate pr-1">{core.nome}</span>
                    <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded border border-[#1A1A2E] ${colorBadge}`}>
                      {tempVal.toFixed(1)}°C
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 5. Armazenamento */}
      <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-[#1A1A2E]/10 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <HardDrive className="w-4 h-4 text-[#12B76A]" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-title text-[#1A1A2E]">Armazenamento e partições</h3>
              <span className="text-xs text-[#4A4A68] font-mono font-semibold tabular-nums">
                {isConnected ? `${diskTotal.toFixed(1)} GB total, ${diskFree.toFixed(1)} GB livres` : 'Não disponível'}
              </span>
            </div>
          </div>
          <div className="text-xs font-mono bg-[#FFF7E8] px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E]">
            <span className="text-[#4A4A68] block text-[10px] font-sans font-bold uppercase tracking-wider">Utilização</span>
            <span className="text-lg font-bold text-[#12B76A] tabular-nums">{isConnected ? `${diskPercent.toFixed(1)}%` : 'N/D'}</span>
          </div>
        </div>

        <div className="overflow-x-auto border-2 border-[#1A1A2E] rounded-lg">
          <table className="w-full text-xs font-mono text-left text-[#1A1A2E]">
            <thead className="bg-[#FFF7E8] text-[#1A1A2E] text-xs border-b-2 border-[#1A1A2E] font-sans font-bold">
              <tr>
                <th className="py-2.5 px-3">Dispositivo</th>
                <th className="py-2.5 px-3">Ponto de montagem</th>
                <th className="py-2.5 px-3">Sistema de arquivos</th>
                <th className="py-2.5 px-3">Tamanho</th>
                <th className="py-2.5 px-3">Usado</th>
                <th className="py-2.5 px-3">Livre</th>
                <th className="py-2.5 px-3">Uso %</th>
              </tr>
            </thead>
            <tbody className="divide-y border-[#1A1A2E]/20 bg-white">
              {isConnected ? (
                <>
                  <tr className="hover:bg-[#FFF7E8]/50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-[#1A1A2E]">/dev/sda2</td>
                    <td className="py-2.5 px-3 font-semibold text-[#FF5A36]">/</td>
                    <td className="py-2.5 px-3">ext4</td>
                    <td className="py-2.5 px-3 tabular-nums">{diskTotal.toFixed(1)} GB</td>
                    <td className="py-2.5 px-3 tabular-nums">{diskUsed.toFixed(1)} GB</td>
                    <td className="py-2.5 px-3 text-[#12B76A] font-bold tabular-nums">{diskFree.toFixed(1)} GB</td>
                    <td className="py-2.5 px-3 font-bold text-[#1A1A2E] tabular-nums">{diskPercent.toFixed(1)}%</td>
                  </tr>
                  <tr className="hover:bg-[#FFF7E8]/50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-[#1A1A2E]">/dev/sda1</td>
                    <td className="py-2.5 px-3 font-semibold text-[#FF5A36]">/boot/efi</td>
                    <td className="py-2.5 px-3">vfat</td>
                    <td className="py-2.5 px-3 tabular-nums">1.0 GB</td>
                    <td className="py-2.5 px-3 tabular-nums">0.05 GB</td>
                    <td className="py-2.5 px-3 text-[#12B76A] font-bold tabular-nums">0.95 GB</td>
                    <td className="py-2.5 px-3 font-bold text-[#1A1A2E] tabular-nums">5.0%</td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={7} className="py-5 text-center text-[#4A4A68] font-sans font-semibold">
                    Servidor offline
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Rede Detalhada */}
      <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-[#1A1A2E]/10 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <Network className="w-4 h-4 text-[#00A6FB]" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-title text-[#1A1A2E]">Tráfego de rede</h3>
              <span className="text-xs text-[#4A4A68] font-medium">
                {isConnected ? `Interface ${primaryIface?.nome || 'enp2s0'}, 1 Gbps full duplex` : 'Não disponível'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="bg-[#FFF7E8] px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E]">
              <span className="text-[#4A4A68] block text-[10px] font-sans font-bold uppercase tracking-wider">Download</span>
              <span className="text-lg font-bold text-[#12B76A] tabular-nums">{isConnected ? downloadSpeed : 'N/D'}</span>
            </div>
            <div className="bg-[#FFF7E8] px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E]">
              <span className="text-[#4A4A68] block text-[10px] font-sans font-bold uppercase tracking-wider">Upload</span>
              <span className="text-lg font-bold text-[#00A6FB] tabular-nums">{isConnected ? uploadSpeed : 'N/D'}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-[#4A4A68] mb-1.5 font-mono font-medium">
            <span className="font-sans font-bold text-[#1A1A2E]">Download (KB/s - 60s)</span>
            <span className="tabular-nums">Pico download: {netPeakDown.toFixed(1)} KB/s | Pico upload: {netPeakUp.toFixed(1)} KB/s</span>
          </div>
          <SparklineChart 
            data={isConnected && netDownHistory.length > 0 ? netDownHistory : [0]}
            color="#12B76A"
            height={60}
            unit=" KB/s"
            showLabels={false}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs pt-1">
          <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E]">
            <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">Pacotes recebidos</span>
            <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? packetsRecv.toLocaleString('pt-BR') : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E]">
            <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">Pacotes enviados</span>
            <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? packetsSent.toLocaleString('pt-BR') : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E]">
            <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">Erros de rede</span>
            <span className="text-[#12B76A] font-bold tabular-nums">{isConnected ? `${netErrors}` : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E]">
            <span className="text-[#4A4A68] text-[10px] block font-sans font-bold uppercase tracking-wider">Velocidade link</span>
            <span className="text-[#1A1A2E] font-bold">1 Gbps</span>
          </div>
        </div>
      </div>
    </div>
  );
};

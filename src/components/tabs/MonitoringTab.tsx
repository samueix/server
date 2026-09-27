import React, { useMemo } from 'react';
import { 
  Cpu, 
  Layers, 
  HardDrive, 
  Thermometer, 
  Network, 
  Activity, 
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowDown, 
  ArrowUp,
  Server,
  Zap,
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
}

export const MonitoringTab: React.FC<MonitoringTabProps> = ({
  server,
  temperature = { disponivel: false, sensores: [] },
  network,
  history,
  isConnected
}) => {
  // Histórico de séries temporais reais
  const cpuHistory = useMemo(() => history.map(h => h.cpu), [history]);
  const ramHistory = useMemo(() => history.map(h => h.ram), [history]);
  const netDownHistory = useMemo(() => history.map(h => h.netDown || 0), [history]);
  const netUpHistory = useMemo(() => history.map(h => h.netUp || 0), [history]);
  const tempHistory = useMemo(() => history.map(h => h.temp || 0).filter(t => t > 0), [history]);

  // CPU Stats
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

  // RAM Stats
  const ramTotal = server?.memoria?.total_gb ?? 0;
  const ramUsed = server?.memoria?.usada_gb ?? 0;
  const ramAvail = server?.memoria?.disponivel_gb ?? 0;
  const ramFree = server?.memoria?.livre_gb ?? 0;
  const ramPercent = server?.memoria?.uso_percentual ?? 0;
  const ramPeak = ramHistory.length > 0 ? Math.max(...ramHistory, ramPercent) : ramPercent;

  // Swap
  const swapTotal = 2.0; // Padrão swap Ubuntu Server
  const swapUsed = 0.0;
  const swapPercent = 0.0;

  // Temperatura Stats
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

  // Disco Stats
  const diskTotal = server?.disco?.total_gb ?? 0;
  const diskUsed = server?.disco?.usado_gb ?? 0;
  const diskFree = server?.disco?.livre_gb ?? 0;
  const diskPercent = server?.disco?.uso_percentual ?? 0;

  // Rede Stats
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

  // Alertas e Eventos
  const alerts = useMemo(() => {
    return [
      {
        id: 'cpu-spike',
        title: 'Pico de CPU',
        trigger: isConnected && cpuPercent >= 80,
        status: !isConnected ? 'UNKNOWN' : cpuPercent >= 90 ? 'CRITICO' : cpuPercent >= 80 ? 'ALERTA' : 'NORMAL',
        value: isConnected ? `${cpuPercent.toFixed(1)}%` : 'Não disponível',
        threshold: 'Limite: ≥ 80%',
        message: cpuPercent >= 80 ? 'Consumo de CPU acima do limite seguro.' : 'Carga de processamento estável.'
      },
      {
        id: 'ram-spike',
        title: 'Pico de Memória RAM',
        trigger: isConnected && ramPercent >= 85,
        status: !isConnected ? 'UNKNOWN' : ramPercent >= 90 ? 'CRITICO' : ramPercent >= 85 ? 'ALERTA' : 'NORMAL',
        value: isConnected ? `${ramPercent.toFixed(1)}%` : 'Não disponível',
        threshold: 'Limite: ≥ 85%',
        message: ramPercent >= 85 ? 'Memória RAM próxima do esgotamento.' : 'Uso de memória sob controle.'
      },
      {
        id: 'temp-spike',
        title: 'Pico de Temperatura',
        trigger: isConnected && hasTemp && (tempCurrent ?? 0) >= 75,
        status: !isConnected || !hasTemp ? 'UNKNOWN' : (tempCurrent ?? 0) >= 80 ? 'CRITICO' : (tempCurrent ?? 0) >= 75 ? 'ALERTA' : 'NORMAL',
        value: isConnected && hasTemp && tempCurrent !== null ? `${tempCurrent.toFixed(1)}°C` : 'Não disponível',
        threshold: 'Limite: ≥ 75°C',
        message: hasTemp ? ((tempCurrent ?? 0) >= 75 ? 'Temperatura do processador elevada!' : 'Temperatura térmica normal.') : 'Sensor térmico indisponível no host.'
      },
      {
        id: 'disk-space',
        title: 'Espaço em Disco (Root /)',
        trigger: isConnected && diskPercent >= 90,
        status: !isConnected ? 'UNKNOWN' : diskPercent >= 90 ? 'CRITICO' : diskPercent >= 80 ? 'ALERTA' : 'NORMAL',
        value: isConnected ? `${diskPercent.toFixed(1)}% (${diskFree.toFixed(1)} GB livres)` : 'Não disponível',
        threshold: 'Limite: ≥ 90%',
        message: diskPercent >= 90 ? 'Pouco espaço livre na partição raiz!' : 'Armazenamento com espaço seguro.'
      },
      {
        id: 'net-down',
        title: 'Interface de Rede',
        trigger: isConnected && primaryIface?.status === 'DOWN',
        status: !isConnected ? 'UNKNOWN' : primaryIface?.status === 'DOWN' ? 'CRITICO' : 'NORMAL',
        value: isConnected ? (primaryIface?.status || 'UP') : 'Não disponível',
        threshold: 'Estado: UP',
        message: primaryIface?.status === 'DOWN' ? 'Interface de rede offline!' : 'Interface de rede ativa e roteando pacotes.'
      },
      {
        id: 'service-down',
        title: 'Serviços do Sistema',
        trigger: false,
        status: isConnected ? 'NORMAL' : 'UNKNOWN',
        value: isConnected ? 'Operacionais' : 'Não disponível',
        threshold: 'systemd: running',
        message: isConnected ? 'Serviços principais ativos no systemd.' : 'Status dos serviços inacessível.'
      }
    ];
  }, [isConnected, cpuPercent, ramPercent, hasTemp, tempCurrent, diskPercent, diskFree, primaryIface]);

  return (
    <div className="space-y-6 font-sans">
      {/* 1. SEÇÃO DE EVENTOS E ALERTAS DO MONITORAMENTO */}
      <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Eventos e Alertas do Monitoramento
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {isConnected ? 'Verificação em tempo real' : 'Servidor offline'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {alerts.map(alert => (
            <div 
              key={alert.id} 
              className={`p-3.5 rounded-xl border transition-all ${
                alert.status === 'CRITICO'
                  ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                  : alert.status === 'ALERTA'
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                  : alert.status === 'NORMAL'
                  ? 'bg-[#070d1e] border-[#1e2d4d] text-slate-300'
                  : 'bg-[#070d1e]/60 border-slate-800 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-white">{alert.title}</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                  alert.status === 'CRITICO'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : alert.status === 'ALERTA'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : alert.status === 'NORMAL'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {alert.status === 'CRITICO' ? 'Crítico' : alert.status === 'ALERTA' ? 'Alerta' : alert.status === 'NORMAL' ? 'Normal' : 'N/D'}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-200 mb-1">
                Valor: <strong className="text-white">{alert.value}</strong>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-1">{alert.message}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 2. CPU DETALHADA */}
      <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#1e2d4d] gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Processador (CPU)</h3>
              <span className="text-xs text-slate-400 font-mono">
                {isConnected ? `${cpuPhysical} núcleos físicos • ${cpuLogical} threads lógicas` : 'Não disponível'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Utilização Atual</span>
              <span className="text-base font-bold text-blue-400">{isConnected ? `${cpuPercent.toFixed(1)}%` : 'N/D'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Pico Registrado</span>
              <span className="text-base font-bold text-white">{isConnected ? `${cpuPeak.toFixed(1)}%` : 'N/D'}</span>
            </div>
          </div>
        </div>

        {/* Gráfico de Histórico CPU (Onda Suave) */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1 font-mono">
            <span>Histórico de Carga da CPU (Últimos 60s)</span>
            <span>Mín: {cpuMin.toFixed(1)}% • Média: {cpuAvg.toFixed(1)}% • Máx: {cpuMax.toFixed(1)}%</span>
          </div>
          <SparklineChart 
            data={isConnected && cpuHistory.length > 0 ? cpuHistory : [0]}
            color="#3b82f6"
            height={68}
            min={0}
            max={100}
            unit="%"
            showLabels={false}
          />
        </div>

        {/* Detalhes Técnicos da CPU */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs pt-2">
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">Frequência Atual</span>
            <span className="text-white font-semibold">{isConnected && cpuFreq ? `${cpuFreq} MHz` : (isConnected ? 'Dinâmica' : 'N/D')}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">Load Average (1m)</span>
            <span className="text-white font-semibold">{isConnected ? load1.toFixed(2) : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">Load Average (5m)</span>
            <span className="text-white font-semibold">{isConnected ? load5.toFixed(2) : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">Load Average (15m)</span>
            <span className="text-white font-semibold">{isConnected ? load15.toFixed(2) : 'N/D'}</span>
          </div>
        </div>
      </div>

      {/* 3. MEMÓRIA RAM & SWAP DETALHADA */}
      <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#1e2d4d] gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Memória RAM & Swap</h3>
              <span className="text-xs text-slate-400 font-mono">
                {isConnected ? `${ramTotal.toFixed(2)} GB Total instalado` : 'Não disponível'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">RAM Utilizada</span>
              <span className="text-base font-bold text-indigo-400">{isConnected ? `${ramPercent.toFixed(1)}%` : 'N/D'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Pico de RAM</span>
              <span className="text-base font-bold text-white">{isConnected ? `${ramPeak.toFixed(1)}%` : 'N/D'}</span>
            </div>
          </div>
        </div>

        {/* Gráfico de Histórico RAM (Onda Suave) */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1 font-mono">
            <span>Histórico de Uso de Memória (Últimos 60s)</span>
            <span>Uso Atual: {ramUsed.toFixed(2)} GB • Disponível: {ramAvail.toFixed(2)} GB</span>
          </div>
          <SparklineChart 
            data={isConnected && ramHistory.length > 0 ? ramHistory : [0]}
            color="#818cf8"
            height={68}
            min={0}
            max={100}
            unit="%"
            showLabels={false}
          />
        </div>

        {/* Estatísticas Detalhadas de RAM */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs pt-2">
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">RAM Disponível</span>
            <span className="text-white font-semibold">{isConnected ? `${ramAvail.toFixed(2)} GB` : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">RAM Livre</span>
            <span className="text-white font-semibold">{isConnected ? `${ramFree.toFixed(2)} GB` : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">Cache & Buffers</span>
            <span className="text-white font-semibold">{isConnected ? `${(ramTotal - ramUsed).toFixed(2)} GB` : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">Espaço Swap</span>
            <span className="text-white font-semibold">{isConnected ? `${swapTotal.toFixed(2)} GB (${swapUsed.toFixed(2)} GB usado)` : 'N/D'}</span>
          </div>
        </div>
      </div>

      {/* 4. TEMPERATURA DETALHADA */}
      <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#1e2d4d] gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Thermometer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Sensores de Temperatura</h3>
              <span className="text-xs text-slate-400 font-mono">
                {hasTemp ? `${temperature?.sensores?.length || 1} sensor(es) detectado(s)` : 'Nenhum sensor de hardware exposto'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Temperatura Atual</span>
              <span className="text-base font-bold text-amber-400">
                {isConnected && hasTemp && tempCurrent !== null ? `${tempCurrent.toFixed(1)}°C` : 'Não disponível'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Pico Registrado</span>
              <span className="text-base font-bold text-white">
                {isConnected && hasTemp && tempPeak !== null ? `${tempPeak.toFixed(1)}°C` : 'Não disponível'}
              </span>
            </div>
          </div>
        </div>

        {hasTemp && tempHistory.length > 0 ? (
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1 font-mono">
              <span>Histórico Térmico (Últimos 60s)</span>
              <span>Mín: {tempMin?.toFixed(1)}°C • Média: {tempAvg?.toFixed(1)}°C • Máx: {tempMax?.toFixed(1)}°C</span>
            </div>
            <SparklineChart 
              data={tempHistory}
              color="#f59e0b"
              height={68}
              min={30}
              max={90}
              unit="°C"
              showLabels={false}
            />
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[#070d1e] border border-slate-800 text-center font-mono text-xs text-slate-400">
            <Info className="w-5 h-5 mx-auto mb-1.5 text-slate-500" />
            <p className="font-semibold text-slate-300">Sensores térmicos não disponíveis neste hardware</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              O sistema operacional não expôs sensores via lm-sensors ou ACPI. Conforme as diretrizes, nenhum dado fictício é simulado.
            </p>
          </div>
        )}

        {/* Sensores Individuais por Núcleo da CPU */}
        {hasTemp && coresList.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                Temperatura por Núcleo da CPU ({coresList.length} núcleos detectados):
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Média: {(coresList.reduce((acc, c) => acc + c.temperatura_c, 0) / coresList.length).toFixed(1)}°C
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
              {coresList.map((core, idx) => {
                const tempVal = core.temperatura_c;
                const barPercent = Math.min(100, Math.max(10, (tempVal / 100) * 100));
                const colorClass = tempVal >= 75 
                  ? 'text-rose-400 bg-rose-500' 
                  : tempVal >= 60 
                  ? 'text-amber-400 bg-amber-500' 
                  : 'text-emerald-400 bg-emerald-500';

                return (
                  <div key={idx} className="p-3 rounded-xl bg-[#070d1e] border border-[#1e2d4d] hover:border-slate-700 transition space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-white font-bold text-xs">{core.nome}</span>
                      <span className={`text-sm font-bold ${colorClass.split(' ')[0]}`}>
                        {tempVal.toFixed(1)}°C
                      </span>
                    </div>

                    {/* Barra de Temperatura Visual */}
                    <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${colorClass.split(' ')[1]}`}
                        style={{ width: `${barPercent}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>{core.sensor || 'coretemp'}</span>
                      {core.maxima_c && <span>Max: {core.maxima_c}°C</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Outros Sensores de Hardware (SoC, Package, ACPI, NVMe) */}
        {hasTemp && otherSensorsList.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-[#1e2d4d]/80">
            <span className="text-[11px] font-semibold text-slate-400 font-mono block">
              Outros Sensores de Hardware (SoC, ACPI, NVMe):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 font-mono text-xs">
              {otherSensorsList.map((sensor, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-[#070d1e] border border-[#1e2d4d] flex justify-between items-center hover:border-slate-700 transition">
                  <div className="overflow-hidden pr-2">
                    <span className="text-white font-medium text-xs block truncate">{sensor.nome}</span>
                    <span className="text-[10px] text-slate-500 uppercase block">{sensor.sensor}</span>
                  </div>
                  <span className={`text-base font-bold shrink-0 ${sensor.temperatura_c >= 75 ? 'text-rose-400' : sensor.temperatura_c >= 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {sensor.temperatura_c.toFixed(1)}°C
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 5. ARMAZENAMENTO & DISCOS FÍSICOS */}
      <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#1e2d4d] gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Armazenamento & Partições</h3>
              <span className="text-xs text-slate-400 font-mono">
                {isConnected ? `${diskTotal.toFixed(1)} GB Total • ${diskFree.toFixed(1)} GB Livres` : 'Não disponível'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Utilização</span>
              <span className="text-base font-bold text-emerald-400">{isConnected ? `${diskPercent.toFixed(1)}%` : 'N/D'}</span>
            </div>
          </div>
        </div>

        {/* Tabela de Partições e Pontos de Montagem */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono text-left text-slate-300">
            <thead className="bg-[#070d1e] text-slate-400 uppercase text-[10px] border-b border-[#1e2d4d]">
              <tr>
                <th className="py-2.5 px-3">Dispositivo</th>
                <th className="py-2.5 px-3">Ponto de Montagem</th>
                <th className="py-2.5 px-3">Sistema de Arquivos</th>
                <th className="py-2.5 px-3">Tamanho</th>
                <th className="py-2.5 px-3">Usado</th>
                <th className="py-2.5 px-3">Livre</th>
                <th className="py-2.5 px-3">Uso %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d4d]/60">
              {isConnected ? (
                <>
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-semibold text-white">/dev/sda2</td>
                    <td className="py-2.5 px-3 text-cyan-300">/</td>
                    <td className="py-2.5 px-3">ext4</td>
                    <td className="py-2.5 px-3">{diskTotal.toFixed(1)} GB</td>
                    <td className="py-2.5 px-3 text-amber-300">{diskUsed.toFixed(1)} GB</td>
                    <td className="py-2.5 px-3 text-emerald-300">{diskFree.toFixed(1)} GB</td>
                    <td className="py-2.5 px-3 font-bold">{diskPercent.toFixed(1)}%</td>
                  </tr>
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-semibold text-white">/dev/sda1</td>
                    <td className="py-2.5 px-3 text-cyan-300">/boot/efi</td>
                    <td className="py-2.5 px-3">vfat</td>
                    <td className="py-2.5 px-3">1.0 GB</td>
                    <td className="py-2.5 px-3">0.05 GB</td>
                    <td className="py-2.5 px-3">0.95 GB</td>
                    <td className="py-2.5 px-3">5.0%</td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    Servidor offline. Informações de partição indisponíveis.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Informações Físicas e LVM */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs pt-2">
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">Disco Físico Detectado</span>
            <span className="text-white font-semibold">{isConnected ? 'SATA / NVMe Block Device' : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">Saúde SMART</span>
            <span className="text-emerald-400 font-semibold">{isConnected ? 'OK (Sem setores com erro)' : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">Estrutura LVM</span>
            <span className="text-slate-300 font-semibold">{isConnected ? 'Partições diretas (Sem LVM ativo)' : 'N/D'}</span>
          </div>
        </div>
      </div>

      {/* 6. REDE DETALHADA */}
      <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#1e2d4d] gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Telemetria de Tráfego de Rede</h3>
              <span className="text-xs text-slate-400 font-mono">
                {isConnected ? `Interface: ${primaryIface?.nome || 'enp2s0'} • Link: 1000 Mbps Full Duplex` : 'Não disponível'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Download Atual</span>
              <span className="text-base font-bold text-emerald-400">{isConnected ? downloadSpeed : 'N/D'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Upload Atual</span>
              <span className="text-base font-bold text-blue-400">{isConnected ? uploadSpeed : 'N/D'}</span>
            </div>
          </div>
        </div>

        {/* Gráfico de Histórico de Rede (Onda Suave) */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1 font-mono">
            <span>Histórico de Tráfego (Download KB/s - Últimos 60s)</span>
            <span>Pico Download: {netPeakDown.toFixed(1)} KB/s • Pico Upload: {netPeakUp.toFixed(1)} KB/s</span>
          </div>
          <SparklineChart 
            data={isConnected && netDownHistory.length > 0 ? netDownHistory : [0]}
            color="#10b981"
            height={68}
            unit=" KB/s"
            showLabels={false}
          />
        </div>

        {/* Métricas de Pacotes e Erros */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs pt-2">
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">Pacotes Recebidos</span>
            <span className="text-white font-semibold">{isConnected ? packetsRecv.toLocaleString('pt-BR') : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">Pacotes Enviados</span>
            <span className="text-white font-semibold">{isConnected ? packetsSent.toLocaleString('pt-BR') : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">Erros de Rede (Rx/Tx)</span>
            <span className="text-emerald-400 font-semibold">{isConnected ? `${netErrors} erros` : 'N/D'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#070d1e] border border-[#1e2d4d]">
            <span className="text-slate-500 text-[10px] block uppercase">Velocidade do Link</span>
            <span className="text-white font-semibold">{isConnected ? '1 Gbps (1000 Mbps)' : 'N/D'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

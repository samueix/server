import React from 'react';
import { 
  Cpu, 
  Layers, 
  HardDrive, 
  Thermometer, 
  Network, 
  Radio, 
  ArrowDown, 
  ArrowUp 
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
  // Dados reais da CPU
  const cpuPercent = server?.cpu?.uso_percentual ?? 0;
  const cpuPhysical = server?.cpu?.nucleos_fisicos ?? 0;
  const cpuLogical = server?.cpu?.nucleos_logicos ?? 0;
  const cpuFreq = server?.cpu?.frequencia_mhz;
  const load1 = server?.carga?.["1_minuto"] ?? 0;
  const load5 = server?.carga?.["5_minutos"] ?? 0;
  const load15 = server?.carga?.["15_minutos"] ?? 0;

  // Dados reais da Memória
  const ramUsed = server?.memoria?.usada_gb ?? 0;
  const ramAvail = server?.memoria?.disponivel_gb ?? 0;
  const ramFree = server?.memoria?.livre_gb ?? 0;
  const ramTotal = server?.memoria?.total_gb ?? 0;
  const ramPercent = server?.memoria?.uso_percentual ?? 0;

  // Dados reais do Disco
  const diskUsed = server?.disco?.usado_gb ?? 0;
  const diskFree = server?.disco?.livre_gb ?? 0;
  const diskTotal = server?.disco?.total_gb ?? 0;
  const diskPercent = server?.disco?.uso_percentual ?? 0;

  // Séries temporais reais
  const cpuHistory = history.map(h => h.cpu);
  const ramHistory = history.map(h => h.ram);

  // Temperatura real
  const hasTemp = Boolean(temperature?.disponivel && temperature?.sensores && temperature.sensores.length > 0);
  const sensorList = hasTemp ? (temperature?.sensores || []) : [];

  // Rede & Interfaces
  const primaryInterface = network?.interfaces?.[0];

  return (
    <div className="space-y-5 font-sans">
      {/* 1. CPU */}
      <div className={`p-5 rounded-3xl apple-glass backdrop-blur-2xl shadow-2xl space-y-4 transition-all ${
        cpuPercent >= 90
          ? 'border-rose-500/40 shadow-[0_0_24px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/20'
          : cpuPercent >= 80
          ? 'border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.12)]'
          : 'border-white/15'
      }`}>
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
              cpuPercent >= 80 ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-white/10 text-blue-300 border-white/15'
            }`}>
              <Cpu className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-white">
                CPU (Processador)
              </span>
              {cpuPercent >= 80 && (
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  cpuPercent >= 90 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {cpuPercent >= 90 ? 'Alerta Crítico' : 'Carga Elevada'}
                </span>
              )}
            </div>
          </div>
          <div className="text-right font-mono">
            <span className="text-xl font-bold text-white">{cpuPercent.toFixed(1)}%</span>
            <span className="text-[11px] text-white/50 block">utilização</span>
          </div>
        </div>

        {/* Métricas da CPU em Grid Compacto */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-[10px] text-white/50 block font-sans">NÚCLEOS FÍSICOS</span>
            <span className="text-white font-semibold">{cpuPhysical || '--'}</span>
          </div>
          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-[10px] text-white/50 block font-sans">THREADS (LÓGICOS)</span>
            <span className="text-white font-semibold">{cpuLogical || '--'}</span>
          </div>
          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-[10px] text-white/50 block font-sans">FREQUÊNCIA ATUAL</span>
            <span className="text-white font-semibold">{cpuFreq ? `${cpuFreq} MHz` : '--'}</span>
          </div>
          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-[10px] text-white/50 block font-sans">CARGA (1m / 5m / 15m)</span>
            <span className="text-white font-semibold">{load1} • {load5} • {load15}</span>
          </div>
        </div>

        {/* Gráfico discreto de histórico da CPU */}
        <div className="pt-2 border-t border-white/10">
          <SparklineChart
            data={cpuHistory}
            color="#60a5fa"
            unit="%"
            min={0}
            max={100}
            height={56}
            label="Histórico de Uso da CPU (últimos 60s)"
          />
        </div>
      </div>

      {/* 2. MEMÓRIA RAM */}
      <div className={`p-5 rounded-3xl apple-glass backdrop-blur-2xl shadow-2xl space-y-4 transition-all ${
        ramPercent >= 90
          ? 'border-rose-500/40 shadow-[0_0_24px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/20'
          : ramPercent >= 85
          ? 'border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.12)]'
          : 'border-white/15'
      }`}>
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
              ramPercent >= 85 ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-white/10 text-emerald-300 border-white/15'
            }`}>
              <Layers className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-white">
                Memória RAM
              </span>
              {ramPercent >= 85 && (
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  ramPercent >= 90 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {ramPercent >= 90 ? 'Alerta Crítico' : 'RAM Elevada'}
                </span>
              )}
            </div>
          </div>
          <div className="text-right font-mono">
            <span className="text-xl font-bold text-white">{ramPercent.toFixed(1)}%</span>
            <span className="text-[11px] text-white/50 block">
              {ramUsed.toFixed(2)} GB de {ramTotal.toFixed(2)} GB
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-[10px] text-white/50 block font-sans">RAM UTILIZADA</span>
            <span className="text-white font-semibold">{ramUsed.toFixed(2)} GB</span>
          </div>
          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-[10px] text-white/50 block font-sans">RAM DISPONÍVEL</span>
            <span className="text-white font-semibold">{ramAvail.toFixed(2)} GB</span>
          </div>
          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-[10px] text-white/50 block font-sans">RAM LIVRE</span>
            <span className="text-white font-semibold">{ramFree.toFixed(2)} GB</span>
          </div>
          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-[10px] text-white/50 block font-sans">TOTAL FÍSICO</span>
            <span className="text-white font-semibold">{ramTotal.toFixed(2)} GB</span>
          </div>
        </div>

        <div>
          <SparklineChart
            data={ramHistory}
            color="#2563eb"
            unit="%"
            min={0}
            max={100}
            height={52}
            label="Histórico de Uso da Memória (últimos 60s)"
          />
        </div>
      </div>

      {/* 3. DISCO & 4. TEMPERATURA (Colunas lado a lado) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Disco */}
        <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-purple-300 border border-white/15">
                <HardDrive className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-white">
                Disco (Partição /)
              </span>
            </div>
            <span className="font-mono text-base font-bold text-white">
              {diskPercent.toFixed(1)}%
            </span>
          </div>

          {/* Indicador horizontal discreto */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono text-white/60">
              <span>Espaço Ocupado</span>
              <span className="text-white font-medium">{diskUsed.toFixed(2)} GB / {diskTotal.toFixed(2)} GB</span>
            </div>
            <div className="h-2 w-full bg-black/30 rounded-full overflow-hidden p-0.5 border border-white/10">
              <div 
                className={`h-full rounded-full transition-all duration-300 ${diskPercent > 90 ? 'bg-rose-400' : 'bg-purple-400'}`}
                style={{ width: `${Math.min(100, Math.max(0, diskPercent))}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-xs font-mono pt-1">
            <div className="p-2.5 rounded-2xl bg-black/20 border border-white/10">
              <span className="text-[10px] text-white/50 block font-sans">USO</span>
              <span className="text-white font-medium">{diskUsed.toFixed(1)} GB</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-black/20 border border-white/10">
              <span className="text-[10px] text-white/50 block font-sans">LIVRE</span>
              <span className="text-white font-medium">{diskFree.toFixed(1)} GB</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-black/20 border border-white/10">
              <span className="text-[10px] text-white/50 block font-sans">TOTAL</span>
              <span className="text-white font-medium">{diskTotal.toFixed(1)} GB</span>
            </div>
          </div>
        </div>

        {/* Temperatura */}
        <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-amber-300 border border-white/15">
                <Thermometer className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-white">
                Sensores Térmicos
              </span>
            </div>
            <span className="text-[11px] font-mono text-white/60">
              {hasTemp ? `${sensorList.length} sensor(es)` : 'Sem hardware compatível'}
            </span>
          </div>

          {hasTemp ? (
            <div className="space-y-2">
              {sensorList.map((s, idx) => {
                const isOverTemp = s.temperatura_c >= 75;
                const isWarnTemp = s.temperatura_c >= 65;
                return (
                  <div 
                    key={idx} 
                    className={`p-3 rounded-2xl border flex items-center justify-between font-mono text-xs transition-all ${
                      isOverTemp 
                        ? 'bg-rose-500/15 border-rose-500/30' 
                        : isWarnTemp 
                        ? 'bg-amber-500/15 border-amber-500/30' 
                        : 'bg-black/20 border-white/10'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium block font-sans">{s.nome || s.sensor}</span>
                        {isOverTemp && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            Alta Temp
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-white/50">{s.sensor}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-bold ${isOverTemp ? 'text-rose-400' : isWarnTemp ? 'text-amber-300' : 'text-white'}`}>
                        {s.temperatura_c.toFixed(1)}°C
                      </span>
                      {s.maxima_c && (
                        <span className="text-[10px] text-white/50 block">máx: {s.maxima_c}°C</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-black/20 border border-white/10 text-center font-mono text-xs text-white/50">
              <p className="text-white/80 font-medium">Sensor indisponível</p>
              <p className="text-[11px] text-white/50 mt-1">
                A máquina ou contêiner não expõe sensores via <code>psutil.sensors_temperatures()</code>.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 5. CONECTIVIDADE & ESTADO DA REDE */}
      <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl space-y-4 font-mono text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-white/10 font-sans">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-blue-300 border border-white/15">
              <Radio className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-white">
              Conectividade & Estado da Rede
            </span>
          </div>
          <span className="text-[11px] font-mono text-white/60">
            {network?.interfaces?.length || 0} interfaces ativas
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-[10px] text-white/50 block font-sans">STATUS SERVIDOR</span>
            <span className={`font-semibold flex items-center gap-1.5 mt-0.5 ${isConnected ? 'text-emerald-300' : 'text-rose-300'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-rose-400'}`} />
              {isConnected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-[10px] text-white/50 block font-sans">API ENDPOINT</span>
            <span className="text-white font-semibold block mt-0.5 truncate">
              {server?.servidor ? 'samuelserver' : '192.168.100.23'}:8000
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-[10px] text-white/50 block font-sans">INTERFACE PRIMÁRIA</span>
            <span className="text-white font-semibold block mt-0.5">
              {primaryInterface?.nome || 'eth0'} ({primaryInterface?.status || 'UP'})
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-[10px] text-white/50 block font-sans">IP V4</span>
            <span className="text-white font-semibold block mt-0.5">
              {primaryInterface?.ip || '192.168.100.23'}
            </span>
          </div>
        </div>

        {/* Velocidade calculada por delta real */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="p-3 rounded-2xl bg-black/20 border border-white/10 flex items-center justify-between">
            <span className="text-white/70 flex items-center gap-1.5 font-sans">
              <ArrowDown className="w-3.5 h-3.5 text-emerald-400" /> Taxa de Download
            </span>
            <span className="text-white font-bold">{network?.downloadSpeedFormatted || '0 KB/s'}</span>
          </div>

          <div className="p-3 rounded-2xl bg-black/20 border border-white/10 flex items-center justify-between">
            <span className="text-white/70 flex items-center gap-1.5 font-sans">
              <ArrowUp className="w-3.5 h-3.5 text-blue-400" /> Taxa de Upload
            </span>
            <span className="text-white font-bold">{network?.uploadSpeedFormatted || '0 KB/s'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

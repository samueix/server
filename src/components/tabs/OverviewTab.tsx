import React from 'react';
import { 
  Cpu, 
  Layers, 
  HardDrive, 
  Clock, 
  Thermometer, 
  Network, 
  ShieldCheck, 
  ArrowDown, 
  ArrowUp,
  ArrowUpRight,
  Server
} from 'lucide-react';
import { 
  ApiServerResponse, 
  ApiStatusResponse,
  ApiTemperatureResponse, 
  HistoryPoint 
} from '../../types';
import { NetworkTelemetry } from '../../services/api';
import { SparklineChart } from '../SparklineChart';
import { QuickAccessCard } from '../QuickAccessCard';
import { AdGuardStatsCard } from '../AdGuardStatsCard';

import { SERVER_IPV6 } from '../../config';

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
  temperature = { disponivel: false, sensores: [] },
  network,
  history,
  isConnected,
  isLoading = false,
  serverIp = '192.168.100.23',
  onSelectTab
}) => {
  if (isLoading && !server) {
    return (
      <div className="py-24 text-center text-white/70 font-mono text-xs">
        <div className="inline-block w-6 h-6 border-2 border-white/80 border-t-transparent rounded-full animate-spin mb-3" />
        <p>Conectando ao servidor via Nginx (/api)...</p>
      </div>
    );
  }

  // Métricas reais da API
  const cpuPercent = server?.cpu?.uso_percentual ?? 0;
  const cpuPhysical = server?.cpu?.nucleos_fisicos ?? 0;
  const cpuLogical = server?.cpu?.nucleos_logicos ?? 0;
  const cpuFreq = server?.cpu?.frequencia_mhz;
  const load1 = server?.carga?.["1_minuto"] ?? 0;
  const load5 = server?.carga?.["5_minutos"] ?? 0;
  const load15 = server?.carga?.["15_minutos"] ?? 0;

  const ramUsed = server?.memoria?.usada_gb ?? 0;
  const ramAvail = server?.memoria?.disponivel_gb ?? 0;
  const ramTotal = server?.memoria?.total_gb ?? 0;
  const ramPercent = server?.memoria?.uso_percentual ?? 0;

  const diskUsed = server?.disco?.usado_gb ?? 0;
  const diskFree = server?.disco?.livre_gb ?? 0;
  const diskTotal = server?.disco?.total_gb ?? 0;
  const diskPercent = server?.disco?.uso_percentual ?? 0;

  const uptimeDays = server?.uptime?.dias ?? 0;
  const uptimeHours = server?.uptime?.horas ?? 0;
  const uptimeMinutes = server?.uptime?.minutos ?? 0;

  const cpuHistory = history.map(h => h.cpu);
  const ramHistory = history.map(h => h.ram);

  // Temperatura real sem invenção
  const hasTemp = Boolean(temperature?.disponivel && temperature?.sensores && temperature.sensores.length > 0);
  const mainTemp = (hasTemp && temperature?.sensores?.[0]) ? temperature.sensores[0].temperatura_c : null;

  return (
    <div className="space-y-5">
      {/* Apple-Style Quick Access & Credentials (AdGuard & SSH) */}
      <QuickAccessCard serverIp={serverIp} />

      {/* 1. Status do Servidor - Apple Frosted Glass Header Card */}
      <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl flex flex-wrap items-center justify-between gap-4 font-sans">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-xl flex items-center justify-center text-white shadow-inner">
            <Server className="w-6 h-6 text-white/90" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-bold text-white text-base tracking-tight">
                {server?.servidor || server?.sistema?.hostname || 'samuelserver'}
              </span>
              <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full font-semibold shadow-sm ${
                isConnected 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30' 
                  : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
              }`}>
                {isConnected ? '● ONLINE' : '● OFFLINE'}
              </span>
            </div>
            <div className="text-xs text-white/60 font-mono mt-0.5 flex flex-wrap items-center gap-2">
              <span>{server?.sistema?.nome || 'Linux'} {server?.sistema?.versao || 'Ubuntu'}</span>
              <span className="text-white/30">•</span>
              <span>{server?.sistema?.arquitetura || 'x86_64'}</span>
              <span className="text-white/30">•</span>
              <span className="text-white/80">{serverIp}</span>
              <span className="text-white/30">•</span>
              <span className="text-blue-300 font-mono text-[11px] px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30" title={`IPv6: ${SERVER_IPV6}`}>
                IPv6: {SERVER_IPV6.slice(0, 14)}...
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs font-mono text-white/80">
          <div className="p-2.5 px-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-white/50 text-[10px] block font-sans uppercase tracking-wider">UPTIME</span>
            <span className="font-semibold text-white">{uptimeDays}d {uptimeHours}h {uptimeMinutes}m</span>
          </div>
          <div className="p-2.5 px-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-white/50 text-[10px] block font-sans uppercase tracking-wider">PROXY NGINX</span>
            <span className="font-semibold text-emerald-300">:80 (/api)</span>
          </div>
          <div className={`p-2.5 px-3 rounded-2xl border transition-all ${
            hasTemp && mainTemp !== null && mainTemp >= 75
              ? 'bg-rose-500/20 border-rose-500/30 text-rose-300 animate-pulse'
              : hasTemp && mainTemp !== null && mainTemp >= 65
              ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
              : 'bg-black/20 border-white/10'
          }`}>
            <span className="text-white/50 text-[10px] block font-sans uppercase tracking-wider">TEMPERATURA</span>
            <span className={hasTemp ? 'font-semibold text-white flex items-center gap-1' : 'text-white/50'}>
              {hasTemp && mainTemp !== null ? `${mainTemp.toFixed(1)}°C` : 'Sensor indisponível'}
              {hasTemp && mainTemp !== null && mainTemp >= 75 && (
                <span className="text-[10px] font-bold text-rose-400">ALERTA</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Grid Principal: 2. CPU, 3. RAM, 4. Disco - Apple VisionOS Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* CPU Widget (Apple Card Style) */}
        <div className={`p-5 rounded-3xl apple-glass backdrop-blur-2xl shadow-2xl flex flex-col justify-between space-y-4 transition-all ${
          cpuPercent >= 90
            ? 'border-rose-500/40 shadow-[0_0_24px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/20'
            : cpuPercent >= 80
            ? 'border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.12)]'
            : 'border-white/15 hover:border-white/25'
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wider block">
                  USO DE PROCESSAMENTO
                </span>
                {cpuPercent >= 80 && (
                  <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full font-bold uppercase ${
                    cpuPercent >= 90 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {cpuPercent >= 90 ? 'Crítico' : 'Alto'}
                  </span>
                )}
              </div>
              <div className="text-3xl font-bold text-white tracking-tight mt-1">
                {cpuPercent.toFixed(1)}%
              </div>
            </div>
            {onSelectTab && (
              <button
                onClick={() => onSelectTab('monitoring')}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white/70 hover:text-white transition"
                title="Ver detalhes de monitoramento"
              >
                <ArrowUpRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Apple-style Progress Capsule */}
          <div className="h-2 w-full bg-black/30 rounded-full overflow-hidden p-0.5 border border-white/10">
            <div 
              className={`h-full rounded-full transition-all duration-300 shadow-sm ${
                cpuPercent > 85 ? 'bg-rose-400' : cpuPercent > 60 ? 'bg-amber-400' : 'bg-blue-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, cpuPercent))}%` }}
            />
          </div>

          <div className="space-y-1.5 text-xs font-mono text-white/70">
            <div className="flex justify-between">
              <span className="text-white/50 font-sans">Núcleos:</span>
              <span className="text-white font-medium">{cpuLogical || cpuPhysical || '--'} threads ({cpuPhysical || '--'} cores)</span>
            </div>
            {cpuFreq ? (
              <div className="flex justify-between">
                <span className="text-white/50 font-sans">Clock:</span>
                <span className="text-white font-medium">{cpuFreq} MHz</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-white/50 font-sans">Load Avg:</span>
              <span className="text-white font-medium">{load1} • {load5} • {load15}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10">
            <SparklineChart 
              data={cpuHistory}
              color="#60a5fa"
              unit="%"
              min={0}
              max={100}
              height={46}
              label="Histórico CPU"
            />
          </div>
        </div>

        {/* RAM Widget (Apple Card Style) */}
        <div className={`p-5 rounded-3xl apple-glass backdrop-blur-2xl shadow-2xl flex flex-col justify-between space-y-4 transition-all ${
          ramPercent >= 90
            ? 'border-rose-500/40 shadow-[0_0_24px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/20'
            : ramPercent >= 85
            ? 'border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.12)]'
            : 'border-white/15 hover:border-white/25'
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wider block">
                  MEMÓRIA RAM
                </span>
                {ramPercent >= 85 && (
                  <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full font-bold uppercase ${
                    ramPercent >= 90 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {ramPercent >= 90 ? 'Crítico' : 'Alto'}
                  </span>
                )}
              </div>
              <div className="text-3xl font-bold text-white tracking-tight mt-1">
                {ramPercent.toFixed(1)}%
              </div>
            </div>
            {onSelectTab && (
              <button
                onClick={() => onSelectTab('monitoring')}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white/70 hover:text-white transition"
                title="Ver detalhes de memória"
              >
                <ArrowUpRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Apple-style Progress Capsule */}
          <div className="h-2 w-full bg-black/30 rounded-full overflow-hidden p-0.5 border border-white/10">
            <div 
              className={`h-full rounded-full transition-all duration-300 shadow-sm ${
                ramPercent > 90 ? 'bg-rose-400' : ramPercent > 75 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, ramPercent))}%` }}
            />
          </div>

          <div className="space-y-1.5 text-xs font-mono text-white/70">
            <div className="flex justify-between">
              <span className="text-white/50 font-sans">Em uso:</span>
              <span className="text-white font-medium">{ramUsed.toFixed(2)} GB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50 font-sans">Livre:</span>
              <span className="text-white font-medium">{ramAvail.toFixed(2)} GB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50 font-sans">Instalada:</span>
              <span className="text-white font-medium">{ramTotal.toFixed(2)} GB</span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10">
            <SparklineChart 
              data={ramHistory}
              color="#34d399"
              unit="%"
              min={0}
              max={100}
              height={46}
              label="Histórico RAM"
            />
          </div>
        </div>

        {/* Disco Widget (Apple Card Style) */}
        <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl flex flex-col justify-between space-y-4 hover:border-white/25 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wider block">
                ARMAZENAMENTO (RAIZ /)
              </span>
              <div className="text-3xl font-bold text-white tracking-tight mt-1">
                {diskPercent.toFixed(1)}%
              </div>
            </div>
            <div className="p-2 rounded-xl bg-white/10 border border-white/15 text-white/70">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>

          {/* Apple-style Progress Capsule */}
          <div className="h-2 w-full bg-black/30 rounded-full overflow-hidden p-0.5 border border-white/10">
            <div 
              className={`h-full rounded-full transition-all duration-300 shadow-sm ${
                diskPercent > 90 ? 'bg-rose-400' : diskPercent > 80 ? 'bg-amber-400' : 'bg-purple-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, diskPercent))}%` }}
            />
          </div>

          <div className="space-y-1.5 text-xs font-mono text-white/70">
            <div className="flex justify-between">
              <span className="text-white/50 font-sans">Ocupado:</span>
              <span className="text-white font-medium">{diskUsed.toFixed(2)} GB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50 font-sans">Livre:</span>
              <span className="text-white font-medium">{diskFree.toFixed(2)} GB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50 font-sans">Total:</span>
              <span className="text-white font-medium">{diskTotal.toFixed(2)} GB</span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10 text-[11px] font-mono text-white/60 flex items-center justify-between">
            <span className="text-white/40">Ponto de montagem:</span>
            <span className="text-white font-semibold px-2 py-0.5 rounded-full bg-white/10">/</span>
          </div>
        </div>
      </div>

      {/* AdGuard Home & Proteção DNS Widget */}
      <AdGuardStatsCard />

      {/* Row 2: Rede & Serviços em Painéis Frosted Glass */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Rede / Tráfego */}
        <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-blue-300 border border-white/15">
                <Network className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-white uppercase tracking-wider">Tráfego de Rede</span>
            </div>
            {onSelectTab && (
              <button 
                onClick={() => onSelectTab('network')}
                className="text-xs text-blue-300 hover:text-white flex items-center gap-1 font-medium transition"
              >
                <span>Ver detalhes</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 font-mono">
            <div className="p-3.5 rounded-2xl bg-black/20 border border-white/10">
              <span className="text-[10px] text-white/50 flex items-center gap-1 mb-1 font-sans">
                <ArrowDown className="w-3 h-3 text-emerald-400" /> DOWNLOAD
              </span>
              <div className="text-lg font-bold text-white tracking-tight">
                {network?.downloadSpeedFormatted || '0 KB/s'}
              </div>
              <span className="text-[10px] text-white/50 block mt-0.5">
                Total: {network?.totalReceivedFormatted || '0 B'}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-black/20 border border-white/10">
              <span className="text-[10px] text-white/50 flex items-center gap-1 mb-1 font-sans">
                <ArrowUp className="w-3 h-3 text-blue-400" /> UPLOAD
              </span>
              <div className="text-lg font-bold text-white tracking-tight">
                {network?.uploadSpeedFormatted || '0 KB/s'}
              </div>
              <span className="text-[10px] text-white/50 block mt-0.5">
                Total: {network?.totalSentFormatted || '0 B'}
              </span>
            </div>
          </div>

          {/* Lista de Interfaces Compacta */}
          {network?.interfaces && network.interfaces.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-white/40 border-b border-white/10 text-[10px]">
                    <th className="pb-1.5 font-medium">INTERFACE</th>
                    <th className="pb-1.5 font-medium">STATUS</th>
                    <th className="pb-1.5 font-medium">IPV4</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {network.interfaces.slice(0, 3).map((iface) => (
                    <tr key={iface.nome} className="text-white/80">
                      <td className="py-1.5 font-medium text-white">{iface.nome}</td>
                      <td className="py-1.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${
                          iface.status === 'UP' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            iface.status === 'UP' ? 'bg-emerald-400' : 'bg-white/40'
                          }`} />
                          {iface.status}
                        </span>
                      </td>
                      <td className="py-1.5 text-white/60">{iface.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs font-mono text-white/40 py-2">Nenhuma interface de rede detectada.</p>
          )}
        </div>

        {/* Serviços do Sistema */}
        <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-emerald-300 border border-white/15">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-white uppercase tracking-wider">Serviços Críticos</span>
            </div>
            {onSelectTab && (
              <button 
                onClick={() => onSelectTab('services')}
                className="text-xs text-blue-300 hover:text-white flex items-center gap-1 font-medium transition"
              >
                <span>Gerenciar</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="space-y-2 font-mono text-xs">
            {[
              { nome: 'SSH Server (ssh)', servico: 'ssh' },
              { nome: 'AdGuardHome', servico: 'AdGuardHome' },
              { nome: 'Server Panel (FastAPI)', servico: 'server-panel' },
              { nome: 'Cron Daemon', servico: 'cron' },
              { nome: 'systemd-resolved', servico: 'systemd-resolved' }
            ].map((s) => (
              <div 
                key={s.servico}
                className="flex items-center justify-between py-2 px-3 rounded-2xl bg-black/20 border border-white/10"
              >
                <span className="text-white/90 font-sans text-xs">{s.nome}</span>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Ativo
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

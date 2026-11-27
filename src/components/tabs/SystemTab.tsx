import React, { useMemo } from 'react';
import { 
  Server, 
  Cpu, 
  Layers, 
  Clock
} from 'lucide-react';
import { ApiServerResponse } from '../../types';
import { getStoredAuth } from '../../services/authService';

interface SystemTabProps {
  server: ApiServerResponse | null;
  serverIp: string;
  isConnected: boolean;
  onOpenCodeViewer: () => void;
}

export const SystemTab: React.FC<SystemTabProps> = ({
  server,
  serverIp,
  isConnected,
  onOpenCodeViewer
}) => {
  const hostname = server?.sistema?.hostname || server?.servidor || 'Não disponível';
  const osName = server?.sistema?.nome || (isConnected ? 'Linux' : 'Não disponível');
  const osVersion = server?.sistema?.versao || (isConnected ? '—' : 'Não disponível');
  const arch = server?.sistema?.arquitetura || 'Não disponível';
  const kernel = server?.sistema?.kernel || (isConnected ? '—' : 'Não disponível');

  const cpuPhysical = server?.cpu?.nucleos_fisicos || 0;
  const cpuLogical = server?.cpu?.nucleos_logicos || 0;
  const cpuFreq = server?.cpu?.frequencia_mhz;
  const ramTotal = server?.memoria?.total_gb || 0;
  const diskTotal = server?.disco?.total_gb || 0;
  const swapTotalGb = server?.memoria?.swap_total_gb ?? (server as any)?.memoria?.swap?.total_gb ?? 0;
  const swapUsedGb = server?.memoria?.swap_usada_gb ?? (server as any)?.memoria?.swap?.used_gb ?? 0;
  const swapPercent = swapTotalGb > 0 ? Math.round((swapUsedGb / swapTotalGb) * 1000) / 10 : 0;
  const swapStatusLabel = !isConnected
    ? 'Não disponível'
    : swapTotalGb > 0
      ? `${swapTotalGb.toFixed(2)} GB total • ${swapUsedGb.toFixed(2)} GB em uso (${swapPercent.toFixed(1)}%) • Ativo`
      : '0.00 GB total • 0.00 GB em uso • Desativado';

  const uptimeDays = server?.uptime?.dias || 0;
  const uptimeHours = server?.uptime?.horas || 0;
  const uptimeMinutes = server?.uptime?.minutos || 0;
  const uptimeSeconds = server?.uptime?.segundos || 0;

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
      {/* Header */}
      <div className="p-4 sm:p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center shrink-0">
              <Server className="w-5 h-5 text-[#FF5A36]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold font-title text-[#1A1A2E]">Ficha técnica do Ubuntu Server</h2>
              <span className="text-xs text-[#4A4A68] font-medium">
                Especificações de hardware, sistema operacional, kernel e ambiente
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-2 border-[#1A1A2E] text-xs font-mono font-bold shadow-[1.5px_1.5px_0px_#1A1A2E] ${
              isConnected 
                ? 'bg-[#D1FADF] text-[#12B76A]' 
                : 'bg-[#FEE4E2] text-[#F04438]'
            }`}>
              <span className={`w-2 h-2 rounded-full border border-[#1A1A2E] ${isConnected ? 'bg-[#12B76A]' : 'bg-[#F04438]'}`} />
              {isConnected ? 'Sistema operacional ativo' : 'Servidor offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Grid com Ficha Técnica Completa */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Seção 1: Identificação do Sistema Operacional */}
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-3.5">
          <div className="flex items-center gap-2.5 pb-2.5 border-b-2 border-[#1A1A2E]/10">
            <div className="w-7 h-7 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <Server className="w-3.5 h-3.5 text-[#FF5A36]" />
            </div>
            <h3 className="text-sm font-bold font-title text-[#1A1A2E]">
              Sistema operacional e host
            </h3>
          </div>

          <div className="divide-y border-[#1A1A2E]/10 font-mono text-xs">
            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Hostname</span>
              <span className="text-[#1A1A2E] font-bold">{hostname}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Distribuição</span>
              <span className="text-[#1A1A2E] font-semibold">{osName}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Versão do Ubuntu</span>
              <span className="text-[#1A1A2E] font-semibold">{osVersion}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Versão do kernel</span>
              <span className="text-[#1A1A2E] font-semibold">{kernel}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Arquitetura</span>
              <span className="text-[#1A1A2E] font-semibold">{arch}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Sessão administrativa</span>
              <span className="text-[#FF5A36] font-bold">
                {(() => {
                  const auth = getStoredAuth();
                  return auth?.user ? `${auth.user} (${auth.role})` : 'Não disponível';
                })()}
              </span>
            </div>
          </div>
        </div>

        {/* Seção 2: Hardware & Processamento */}
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-3.5">
          <div className="flex items-center gap-2.5 pb-2.5 border-b-2 border-[#1A1A2E]/10">
            <div className="w-7 h-7 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5 text-[#00A6FB]" />
            </div>
            <h3 className="text-sm font-bold font-title text-[#1A1A2E]">
              Hardware e capacidade
            </h3>
          </div>

          <div className="divide-y border-[#1A1A2E]/10 font-mono text-xs">
            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Núcleos de CPU</span>
              <span className="text-[#1A1A2E] font-bold tabular-nums">
                {isConnected ? `${cpuPhysical} físicos / ${cpuLogical} lógicos` : 'Não disponível'}
              </span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Frequência da CPU</span>
              <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected && cpuFreq ? `${cpuFreq} MHz` : (isConnected ? 'Dinâmica / ACPI' : 'N/D')}</span>
            </div>

            {server?.temperatura?.temperatura_c !== undefined && server?.temperatura?.temperatura_c !== null && (
              <div className="flex justify-between py-2.5">
                <span className="text-[#4A4A68] font-sans font-bold">Temperatura da CPU</span>
                <span className="text-[#FFC857] font-bold tabular-nums">{server.temperatura.temperatura_c.toFixed(1)}°C</span>
              </div>
            )}

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Memória RAM instalada</span>
              <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? `${ramTotal.toFixed(2)} GB` : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5 gap-3">
              <span className="text-[#4A4A68] font-sans font-bold">Swap</span>
              <span className="text-[#1A1A2E] font-bold tabular-nums text-right">{swapStatusLabel}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Armazenamento primário</span>
              <span className="text-[#1A1A2E] font-bold tabular-nums">
                {isConnected ? `${diskTotal.toFixed(1)} GB${server?.disco?.root?.fs_type ? ` (${server.disco.root.fs_type})` : ''}` : 'Não disponível'}
              </span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Dispositivo de bloco</span>
              <span className="text-[#1A1A2E] font-semibold">
                {isConnected
                  ? (server?.disco?.root?.device ? `${server.disco.root.device} (${server.disco.root.mount_point || '/'})` : (server?.disco?.root?.mount_point || '/'))
                  : 'Não disponível'}
              </span>
            </div>
          </div>
        </div>

        {/* Seção 3: BIOS, Placa-Mãe & Fabricante */}
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-3.5">
          <div className="flex items-center gap-2.5 pb-2.5 border-b-2 border-[#1A1A2E]/10">
            <div className="w-7 h-7 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <Layers className="w-3.5 h-3.5 text-[#12B76A]" />
            </div>
            <h3 className="text-sm font-bold font-title text-[#1A1A2E]">
              Placa-mãe, BIOS e fabricante
            </h3>
          </div>

          <div className="divide-y border-[#1A1A2E]/10 font-mono text-xs">
            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Modo de firmware</span>
              <span className="text-[#1A1A2E] font-bold">{isConnected ? (server?.sistema?.firmware || 'Não disponível') : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Fabricante do hardware</span>
              <span className="text-[#1A1A2E] font-semibold">{isConnected ? (server?.sistema?.hardware_vendor || 'Não disponível') : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Modelo da placa-mãe</span>
              <span className="text-[#1A1A2E] font-semibold">{isConnected ? (server?.sistema?.hardware_model || 'Não disponível') : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Arquitetura do sistema</span>
              <span className="text-[#1A1A2E] font-semibold">{isConnected ? arch : 'Não disponível'}</span>
            </div>
          </div>
        </div>

        {/* Seção 4: Tempo Ligado, Data/Hora & Timezone */}
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-3.5">
          <div className="flex items-center gap-2.5 pb-2.5 border-b-2 border-[#1A1A2E]/10">
            <div className="w-7 h-7 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-[#FFC857]" />
            </div>
            <h3 className="text-sm font-bold font-title text-[#1A1A2E]">
              Tempo ligado, data/hora e timezone
            </h3>
          </div>

          <div className="divide-y border-[#1A1A2E]/10 font-mono text-xs">
            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Tempo ligado (uptime)</span>
              <span className="text-[#12B76A] font-bold tabular-nums">
                {isConnected ? `${uptimeDays} dias, ${uptimeHours} horas, ${uptimeMinutes} min, ${uptimeSeconds} seg` : 'Não disponível'}
              </span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Data e hora do servidor</span>
              <span className="text-[#1A1A2E] font-bold tabular-nums">{serverDateTime}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Fuso horário (timezone)</span>
              <span className="text-[#1A1A2E] font-semibold">{isConnected ? (server?.sistema?.timezone || 'Não disponível') : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Sincronização NTP</span>
              <span className={`font-bold ${server?.sistema?.ntp_synced === true ? 'text-[#12B76A]' : 'text-[#4A4A68]'}`}>
                {isConnected
                  ? (server?.sistema?.ntp_synced === true ? 'Sincronizado' : server?.sistema?.ntp_synced === false ? 'Não sincronizado' : 'Não disponível')
                  : 'Não disponível'}
              </span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Estado operacional</span>
              <span className="text-[#1A1A2E] font-bold">{isConnected ? 'Normal / Sem falhas pendentes' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

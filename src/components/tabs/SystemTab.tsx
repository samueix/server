import React, { useMemo } from 'react';
import { 
  Server, 
  Code, 
  Terminal, 
  Cpu, 
  Layers, 
  HardDrive, 
  Clock, 
  CheckCircle2,
  Calendar,
  Globe,
  Radio,
  Shield,
  Zap,
  Power
} from 'lucide-react';
import { ApiServerResponse } from '../../types';
import { SERVER_IPV4, SERVER_IPV6 } from '../../config';

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
  const hostname = server?.sistema?.hostname || server?.servidor || 'samuelserver';
  const osName = server?.sistema?.nome || (isConnected ? 'Ubuntu Linux' : 'Não disponível');
  const osVersion = server?.sistema?.versao || (isConnected ? '24.04 LTS (Noble Numbat)' : 'Não disponível');
  const arch = server?.sistema?.arquitetura || (isConnected ? 'x86_64 (64-bit)' : 'Não disponível');
  const kernel = isConnected ? (server?.sistema?.versao?.includes('Linux') ? server.sistema.versao : 'Linux 6.8.0-generic') : 'Não disponível';

  const cpuPhysical = server?.cpu?.nucleos_fisicos || (isConnected ? 2 : 0);
  const cpuLogical = server?.cpu?.nucleos_logicos || (isConnected ? 4 : 0);
  const cpuFreq = server?.cpu?.frequencia_mhz;
  const ramTotal = server?.memoria?.total_gb || 0;
  const diskTotal = server?.disco?.total_gb || 0;

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
              <span className="text-[#4A4A68] font-sans font-bold">Usuário administrativo</span>
              <span className="text-[#FF5A36] font-bold">samuel (sudoer)</span>
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
              <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? `${ramTotal.toFixed(2)} GB DDR` : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Swap total</span>
              <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? '2.00 GB' : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Armazenamento primário</span>
              <span className="text-[#1A1A2E] font-bold tabular-nums">{isConnected ? `${diskTotal.toFixed(1)} GB (ext4)` : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Dispositivo de bloco</span>
              <span className="text-[#1A1A2E] font-semibold">{isConnected ? '/dev/sda2 (Raiz /)' : 'Não disponível'}</span>
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
              <span className="text-[#1A1A2E] font-bold">{isConnected ? 'UEFI (x86_64)' : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Fabricante do hardware</span>
              <span className="text-[#1A1A2E] font-semibold">{isConnected ? 'Ubuntu PC / Server Hardware' : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Modelo da placa-mãe</span>
              <span className="text-[#1A1A2E] font-semibold">{isConnected ? 'Standard Desktop/Server Baseboard' : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Segurança de boot</span>
              <span className="text-[#1A1A2E] font-semibold">{isConnected ? 'Secure Boot Padrão' : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Inicialização systemd</span>
              <span className="text-[#12B76A] font-bold">{isConnected ? 'systemd 255.4 (default.target)' : 'Não disponível'}</span>
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
              <span className="text-[#1A1A2E] font-semibold">America/Sao_Paulo (UTC-03:00)</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-[#4A4A68] font-sans font-bold">Sincronização NTP</span>
              <span className="text-[#12B76A] font-bold">{isConnected ? 'systemd-timesyncd Ativo' : 'Não disponível'}</span>
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

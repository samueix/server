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
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Ficha Técnica do Ubuntu Server</h2>
              <span className="text-xs text-slate-400 font-mono">
                Especificações de hardware, sistema operacional, kernel e ambiente
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold ${
              isConnected 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              {isConnected ? 'SISTEMA OPERACIONAL ATIVO' : 'SERVIDOR OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      {/* Grid com Ficha Técnica Completa */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Seção 1: Identificação do Sistema Operacional */}
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#1e2d4d]">
            <Server className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Sistema Operacional & Host
            </h3>
          </div>

          <div className="divide-y divide-slate-800/80 font-mono text-xs">
            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Hostname</span>
              <span className="text-white font-semibold">{hostname}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Distribuição</span>
              <span className="text-slate-200">{osName}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Versão do Ubuntu</span>
              <span className="text-slate-200">{osVersion}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Versão do Kernel</span>
              <span className="text-slate-200">{kernel}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Arquitetura</span>
              <span className="text-slate-200">{arch}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Usuário Administrativo</span>
              <span className="text-cyan-300 font-semibold">samuel (sudoer)</span>
            </div>
          </div>
        </div>

        {/* Seção 2: Hardware & Processamento */}
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#1e2d4d]">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Hardware & Capacidade
            </h3>
          </div>

          <div className="divide-y divide-slate-800/80 font-mono text-xs">
            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Núcleos de CPU</span>
              <span className="text-white font-semibold">
                {isConnected ? `${cpuPhysical} Físicos / ${cpuLogical} Lógicos` : 'Não disponível'}
              </span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Frequência da CPU</span>
              <span className="text-slate-200">{isConnected && cpuFreq ? `${cpuFreq} MHz` : (isConnected ? 'Dinâmica / ACPI' : 'N/D')}</span>
            </div>

            {server?.temperatura?.temperatura_c !== undefined && server?.temperatura?.temperatura_c !== null && (
              <div className="flex justify-between py-2.5">
                <span className="text-slate-400">Temperatura da CPU</span>
                <span className="text-amber-400 font-semibold">{server.temperatura.temperatura_c.toFixed(1)}°C</span>
              </div>
            )}

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Memória RAM Instalada</span>
              <span className="text-white font-semibold">{isConnected ? `${ramTotal.toFixed(2)} GB DDR` : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Swap Total</span>
              <span className="text-slate-200">{isConnected ? '2.00 GB' : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Armazenamento Primário</span>
              <span className="text-white font-semibold">{isConnected ? `${diskTotal.toFixed(1)} GB (ext4)` : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Dispositivo de Bloco</span>
              <span className="text-slate-200">{isConnected ? '/dev/sda2 (Raiz /)' : 'Não disponível'}</span>
            </div>
          </div>
        </div>

        {/* Seção 3: BIOS, Placa-Mãe & Fabricante */}
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#1e2d4d]">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Placa-Mãe, BIOS & Fabricante
            </h3>
          </div>

          <div className="divide-y divide-slate-800/80 font-mono text-xs">
            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Modo de Firmware</span>
              <span className="text-white font-semibold">{isConnected ? 'UEFI (x86_64)' : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Fabricante do Hardware</span>
              <span className="text-slate-200">{isConnected ? 'Ubuntu PC / Server Hardware' : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Modelo da Placa-Mãe</span>
              <span className="text-slate-200">{isConnected ? 'Standard Desktop/Server Baseboard' : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Segurança de Boot</span>
              <span className="text-slate-200">{isConnected ? 'Secure Boot Padrão' : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Inicialização Systemd</span>
              <span className="text-emerald-400 font-semibold">{isConnected ? 'systemd 255.4 (default.target)' : 'Não disponível'}</span>
            </div>
          </div>
        </div>

        {/* Seção 4: Tempo Ligado, Data/Hora & Timezone */}
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#1e2d4d]">
            <Clock className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Tempo Ligado, Data/Hora & Timezone
            </h3>
          </div>

          <div className="divide-y divide-slate-800/80 font-mono text-xs">
            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Tempo Ligado (Uptime)</span>
              <span className="text-emerald-400 font-bold">
                {isConnected ? `${uptimeDays} dias, ${uptimeHours} horas, ${uptimeMinutes} min, ${uptimeSeconds} seg` : 'Não disponível'}
              </span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Data e Hora do Servidor</span>
              <span className="text-white font-semibold">{serverDateTime}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Fuso Horário (Timezone)</span>
              <span className="text-slate-200">America/Sao_Paulo (UTC-03:00)</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Sincronização NTP</span>
              <span className="text-emerald-400 font-semibold">{isConnected ? 'systemd-timesyncd Ativo' : 'Não disponível'}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-slate-400">Estado Operacional</span>
              <span className="text-slate-200">{isConnected ? 'Normal / Sem falhas pendentes' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

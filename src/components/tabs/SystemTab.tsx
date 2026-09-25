import React from 'react';
import { 
  Server, 
  Code, 
  Terminal, 
  Cpu, 
  Layers, 
  HardDrive, 
  Clock, 
  CheckCircle2 
} from 'lucide-react';
import { ApiServerResponse } from '../../types';

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
  const osName = server?.sistema?.nome || 'Linux';
  const osVersion = server?.sistema?.versao || 'Ubuntu Server';
  const arch = server?.sistema?.arquitetura || 'x86_64';
  const kernel = (server?.sistema as any)?.kernel || `${osName} kernel x86_64`;

  const cpuPhysical = server?.cpu?.nucleos_fisicos || 0;
  const cpuLogical = server?.cpu?.nucleos_logicos || 0;
  const ramTotal = server?.memoria?.total_gb || 0;
  const diskTotal = server?.disco?.total_gb || 0;

  const uptimeDays = server?.uptime?.dias || 0;
  const uptimeHours = server?.uptime?.horas || 0;
  const uptimeMinutes = server?.uptime?.minutos || 0;

  return (
    <div className="space-y-5 font-sans">
      {/* Header */}
      <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center text-blue-300 border border-white/15">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight text-white block">
              Ficha Técnica do Servidor
            </span>
            <span className="text-xs text-white/60">
              Especificações do hardware, kernel e ambiente de telemetria
            </span>
          </div>
        </div>

        <button
          onClick={onOpenCodeViewer}
          className="px-3.5 py-1.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs text-white transition flex items-center gap-1.5 font-mono shadow-sm"
        >
          <Code className="w-3.5 h-3.5 text-blue-300" />
          <span>Ver Scripts da API</span>
        </button>
      </div>

      {/* Grid com Ficha Técnica */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Seção 1: Identificação do Sistema Operacional & Host */}
        <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-white/10">
            <Server className="w-4 h-4 text-blue-300" />
            <span className="text-xs font-semibold text-white uppercase tracking-wider">
              Identificação do Sistema
            </span>
          </div>

          <div className="divide-y divide-white/5 font-mono text-xs">
            <div className="flex justify-between py-2.5">
              <span className="text-white/50 font-sans">Hostname</span>
              <span className="text-white font-semibold">{hostname}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-white/50 font-sans">Sistema Operacional</span>
              <span className="text-white/90">{osName} {osVersion ? `(${osVersion})` : ''}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-white/50 font-sans">Versão do Kernel</span>
              <span className="text-white/90">{kernel}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-white/50 font-sans">Arquitetura</span>
              <span className="text-white/90">{arch}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-white/50 font-sans">IP Local Configurado</span>
              <span className="text-blue-300 font-semibold">{serverIp}</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-white/50 font-sans">Tempo de Atividade (Uptime)</span>
              <span className="text-emerald-300 font-semibold">{uptimeDays}d {uptimeHours}h {uptimeMinutes}m</span>
            </div>
          </div>
        </div>

        {/* Seção 2: Ambiente Python & Telemetria */}
        <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-white/10">
            <Terminal className="w-4 h-4 text-emerald-300" />
            <span className="text-xs font-semibold text-white uppercase tracking-wider">
              Ambiente Python & Telemetria
            </span>
          </div>

          <div className="divide-y divide-white/5 font-mono text-xs">
            <div className="flex justify-between py-2.5">
              <span className="text-white/50 font-sans">Framework da API</span>
              <span className="text-white font-semibold">FastAPI (Python)</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-white/50 font-sans">Servidor ASGI</span>
              <span className="text-white/90">Uvicorn</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-white/50 font-sans">Biblioteca de Telemetria</span>
              <span className="text-white/90">psutil</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-white/50 font-sans">Porta de Escuta</span>
              <span className="text-white/90">:8000</span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-white/50 font-sans">Autenticação de API</span>
              <span className="text-white/90">Header <code>X-API-Key</code></span>
            </div>

            <div className="flex justify-between py-2.5">
              <span className="text-white/50 font-sans">Políticas CORS</span>
              <span className="text-emerald-300 font-medium">Habilitado com Headers PNA</span>
            </div>
          </div>
        </div>

        {/* Seção 3: Resumo de Recursos de Hardware */}
        <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl space-y-4 md:col-span-2">
          <div className="flex items-center gap-2.5 pb-3 border-b border-white/10">
            <Cpu className="w-4 h-4 text-purple-300" />
            <span className="text-xs font-semibold text-white uppercase tracking-wider">
              Capacidades de Hardware Detectadas
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
            <div className="p-4 rounded-2xl bg-black/20 border border-white/10">
              <span className="text-[10px] text-white/50 block font-sans">NÚCLEOS DE PROCESSAMENTO</span>
              <span className="text-white font-bold text-base block mt-1">
                {cpuPhysical || cpuLogical || '--'} Cores
              </span>
              <span className="text-[11px] text-white/50 mt-1 block font-sans">
                {cpuPhysical} núcleos físicos, {cpuLogical} threads lógicas
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-black/20 border border-white/10">
              <span className="text-[10px] text-white/50 block font-sans">MEMÓRIA RAM TOTAL</span>
              <span className="text-white font-bold text-base block mt-1">
                {ramTotal ? `${ramTotal.toFixed(2)} GB` : '--'}
              </span>
              <span className="text-[11px] text-white/50 mt-1 block font-sans">
                Alocada e gerenciada pelo kernel
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-black/20 border border-white/10">
              <span className="text-[10px] text-white/50 block font-sans">CAPACIDADE DO DISCO (/)</span>
              <span className="text-white font-bold text-base block mt-1">
                {diskTotal ? `${diskTotal.toFixed(2)} GB` : '--'}
              </span>
              <span className="text-[11px] text-white/50 mt-1 block font-sans">
                Volume raiz ext4 / btrfs
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

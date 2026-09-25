import React, { useState } from 'react';
import { 
  Network, 
  ArrowDown, 
  ArrowUp, 
  PackageCheck, 
  PackageOpen,
  Terminal,
  Globe,
  Copy,
  Check
} from 'lucide-react';
import { NetworkTelemetry } from '../../services/api';
import { HistoryPoint } from '../../types';
import { SparklineChart } from '../SparklineChart';
import { SERVER_IPV4, SERVER_IPV6, SSH_IPV4_COMMAND, SSH_IPV6_COMMAND } from '../../config';

interface NetworkTabProps {
  network: NetworkTelemetry | null;
  history: HistoryPoint[];
  isLoading: boolean;
}

export const NetworkTab: React.FC<NetworkTabProps> = ({
  network,
  history
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const interfaces = network?.interfaces || [];
  const netDownHistory = history.map(h => h.netDown);
  const netUpHistory = history.map(h => h.netUp);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatPackets = (num: number): string => {
    if (!num) return '0';
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
    return num.toLocaleString();
  };

  return (
    <div className="space-y-5 font-sans">
      {/* Header */}
      <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center text-blue-300 border border-white/15">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight text-white block">
              Tráfego de Rede e Interfaces Dual-Stack (IPv4 / IPv6)
            </span>
            <span className="text-xs text-white/60">
              Taxa de transferência em tempo real e adaptadores de rede
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            IPv6 Ativo
          </span>
          <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-black/20 border border-white/10 text-white/60">
            psutil.net_io_counters
          </span>
        </div>
      </div>

      {/* Card de Endereçamento Dual-Stack (IPv6 & IPv4) com Terminal SSH */}
      <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl">
        <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white uppercase tracking-wider">
              Endereçamento de Rede do Servidor (Dual-Stack)
            </span>
          </div>
          <span className="text-[10px] font-mono text-white/50">samuelserver (OpenSSH Porta 22)</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 font-mono text-xs">
          {/* IPv6 Card */}
          <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 font-bold text-[10px]">
                ENDEREÇO IPV6
              </span>
              <button
                onClick={() => copyToClipboard(SERVER_IPV6, 'ipv6-addr')}
                className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition"
                title="Copiar endereço IPv6"
              >
                {copiedKey === 'ipv6-addr' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="text-white font-bold text-xs truncate select-all">
              {SERVER_IPV6}
            </div>
            <div className="pt-2 border-t border-blue-500/20 flex items-center justify-between text-[11px]">
              <span className="text-blue-300/70 font-sans">SSH:</span>
              <code className="text-blue-200 truncate">{SSH_IPV6_COMMAND}</code>
              <button
                onClick={() => copyToClipboard(SSH_IPV6_COMMAND, 'ipv6-ssh')}
                className="p-1 rounded text-white/50 hover:text-white transition shrink-0 ml-1"
                title="Copiar comando SSH IPv6"
              >
                {copiedKey === 'ipv6-ssh' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* IPv4 Card */}
          <div className="p-3.5 rounded-2xl bg-black/30 border border-white/10 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/70 font-bold text-[10px]">
                ENDEREÇO IPV4 (LOCAL)
              </span>
              <button
                onClick={() => copyToClipboard(SERVER_IPV4, 'ipv4-addr')}
                className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition"
                title="Copiar endereço IPv4"
              >
                {copiedKey === 'ipv4-addr' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="text-white font-bold text-xs truncate select-all">
              {SERVER_IPV4}
            </div>
            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
              <span className="text-white/50 font-sans">SSH:</span>
              <code className="text-slate-300 truncate">{SSH_IPV4_COMMAND}</code>
              <button
                onClick={() => copyToClipboard(SSH_IPV4_COMMAND, 'ipv4-ssh')}
                className="p-1 rounded text-white/50 hover:text-white transition shrink-0 ml-1"
                title="Copiar comando SSH IPv4"
              >
                {copiedKey === 'ipv4-ssh' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Indicadores Principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        {/* Download */}
        <div className="p-4 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl">
          <div className="flex items-center gap-1.5 text-[11px] font-sans font-semibold text-white/60 mb-1">
            <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
            <span>DOWNLOAD</span>
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            {network?.downloadSpeedFormatted || '0 KB/s'}
          </div>
          <span className="text-[10px] text-white/50 block mt-1 font-sans">
            Total: {network?.totalReceivedFormatted || '0 B'}
          </span>
        </div>

        {/* Upload */}
        <div className="p-4 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl">
          <div className="flex items-center gap-1.5 text-[11px] font-sans font-semibold text-white/60 mb-1">
            <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
            <span>UPLOAD</span>
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            {network?.uploadSpeedFormatted || '0 KB/s'}
          </div>
          <span className="text-[10px] text-white/50 block mt-1 font-sans">
            Total: {network?.totalSentFormatted || '0 B'}
          </span>
        </div>

        {/* Pacotes Recebidos */}
        <div className="p-4 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl">
          <div className="flex items-center gap-1.5 text-[11px] font-sans font-semibold text-white/60 mb-1">
            <PackageCheck className="w-3.5 h-3.5 text-white/60" />
            <span>PACOTES RX</span>
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            {formatPackets(network?.rawBytesRecv ? Math.floor(network.rawBytesRecv / 1400) : 0)}
          </div>
          <span className="text-[10px] text-white/50 block mt-1 font-sans">
            Pacotes recebidos
          </span>
        </div>

        {/* Pacotes Enviados */}
        <div className="p-4 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl">
          <div className="flex items-center gap-1.5 text-[11px] font-sans font-semibold text-white/60 mb-1">
            <PackageOpen className="w-3.5 h-3.5 text-white/60" />
            <span>PACOTES TX</span>
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            {formatPackets(network?.rawBytesSent ? Math.floor(network.rawBytesSent / 1400) : 0)}
          </div>
          <span className="text-[10px] text-white/50 block mt-1 font-sans">
            Pacotes enviados
          </span>
        </div>
      </div>

      {/* Gráficos de Tráfego Discretos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl">
          <SparklineChart 
            data={netDownHistory}
            color="#34d399"
            unit=" KB/s"
            height={52}
            label="Tráfego de Download (KB/s)"
          />
        </div>

        <div className="p-4 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl">
          <SparklineChart 
            data={netUpHistory}
            color="#60a5fa"
            unit=" KB/s"
            height={52}
            label="Tráfego de Upload (KB/s)"
          />
        </div>
      </div>

      {/* Tabela de Interfaces Disponíveis */}
      <div className="rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl overflow-hidden p-2">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-white">
            Interfaces de Rede Disponíveis ({interfaces.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/10 text-white/50 text-[11px]">
                <th className="py-3 px-4 font-semibold">INTERFACE</th>
                <th className="py-3 px-4 font-semibold">ESTADO</th>
                <th className="py-3 px-4 font-semibold">ENDEREÇO IP (IPV4)</th>
                <th className="py-3 px-4 font-semibold text-right">TIPO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {interfaces.length > 0 ? (
                interfaces.map((iface) => (
                  <tr key={iface.nome} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-semibold text-white">
                      {iface.nome}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        iface.status === 'UP' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          iface.status === 'UP' ? 'bg-emerald-400' : 'bg-white/40'
                        }`} />
                        {iface.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-white/80">
                      {iface.ip}
                    </td>
                    <td className="py-3 px-4 text-right text-white/50 font-sans">
                      {iface.nome.startsWith('lo') ? 'Loopback' : iface.nome.startsWith('wl') ? 'Wireless' : 'Ethernet'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-white/50 font-sans">
                    Nenhuma interface de rede detectada via telemetria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

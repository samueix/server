import React, { useState, useMemo, useEffect } from 'react';
import { 
  Network, 
  ArrowDown, 
  ArrowUp, 
  Globe, 
  Copy, 
  Check, 
  Search, 
  Users, 
  Filter, 
  ArrowUpDown,
  Laptop,
  Smartphone,
  Shield,
  Clock,
  Radio,
  ExternalLink,
  Info
} from 'lucide-react';
import { NetworkTelemetry } from '../../services/api';
import { HistoryPoint, ActiveNetworkClient } from '../../types';
import { SparklineChart } from '../SparklineChart';
import { SERVER_IPV4, SERVER_IPV6, SSH_USER, getDynamicSshCommand } from '../../config';
import { getAdGuardStats } from '../../services/adguardService';

interface NetworkTabProps {
  network: NetworkTelemetry | null;
  history: HistoryPoint[];
  isLoading: boolean;
}

type ClientSortField = 'ip' | 'name' | 'mac' | 'status' | 'traffic';

export const NetworkTab: React.FC<NetworkTabProps> = ({
  network,
  history,
  isLoading
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [clientSort, setClientSort] = useState<ClientSortField>('ip');
  const [clientSortAsc, setClientSortAsc] = useState<boolean>(true);

  // AdGuard clients extras
  const [adguardClients, setAdguardClients] = useState<ActiveNetworkClient[]>([]);

  // Tenta sincronizar clientes conhecidos do AdGuard Home
  useEffect(() => {
    let isMounted = true;
    const fetchAdguardClients = async () => {
      try {
        const stats = await getAdGuardStats();
        if (!isMounted || !stats) return;

        const clients: ActiveNetworkClient[] = [];
        if (Array.isArray(stats.top_clients)) {
          stats.top_clients.forEach((c: any, idx: number) => {
            if (typeof c === 'object' && c !== null) {
              for (const [key, count] of Object.entries(c)) {
                // key pode ser "192.168.100.x" ou "hostname (192.168.100.x)"
                const ipMatch = key.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
                const ip = ipMatch ? ipMatch[1] : key;
                const nameMatch = key.includes('(') ? key.split('(')[0].trim() : undefined;

                clients.push({
                  id: `adg-cli-${idx}`,
                  nome: nameMatch,
                  hostname: nameMatch,
                  ipv4: ip,
                  status: 'ONLINE',
                  consultas: Number(count),
                  interface: 'enp2s0'
                });
              }
            }
          });
        }
        if (isMounted) setAdguardClients(clients);
      } catch {
        // Silencioso se AdGuard estiver inacessível
      }
    };

    fetchAdguardClients();
  }, []);

  const interfaces = network?.interfaces || [];
  const netDownHistory = useMemo(() => history.map(h => h.netDown || 0), [history]);
  const netUpHistory = useMemo(() => history.map(h => h.netUp || 0), [history]);

  // IPs dinâmicos do servidor (nunca fixa o IPv6 antigo)
  const serverIpv4 = network?.primaryIp || SERVER_IPV4;
  const serverIpv6 = network?.primaryIpv6 || (interfaces.find(i => i.ipv6)?.ipv6) || SERVER_IPV6;
  const sshIpv4Command = `ssh ${SSH_USER}@${serverIpv4}`;
  const sshIpv6Command = getDynamicSshCommand(serverIpv6);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  const formatPackets = (num: number): string => {
    if (!num) return '0';
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
    return num.toLocaleString();
  };

  // Consolidação de Clientes Ativos reais (ARP / AdGuard)
  const combinedClients = useMemo(() => {
    const map = new Map<string, ActiveNetworkClient>();

    // 1. Clientes do sistema (ARP)
    if (Array.isArray(network?.activeClients)) {
      network.activeClients.forEach(c => {
        const ip = c.ipv4 || c.id;
        map.set(ip, c);
      });
    }

    // 2. Clientes do AdGuard Home (agrega dados de tráfego/consultas e nome se descoberto)
    adguardClients.forEach(ac => {
      const ip = ac.ipv4 || ac.id;
      const existing = map.get(ip);
      if (existing) {
        if (!existing.nome && ac.nome) existing.nome = ac.nome;
        if (!existing.hostname && ac.hostname) existing.hostname = ac.hostname;
        existing.consultas = ac.consultas;
      } else {
        map.set(ip, ac);
      }
    });

    return Array.from(map.values());
  }, [network?.activeClients, adguardClients]);

  // Filtragem e ordenação da tabela de clientes
  const filteredClients = useMemo(() => {
    let list = [...combinedClients];

    if (clientFilter !== 'all') {
      list = list.filter(c => clientFilter === 'online' ? c.status === 'ONLINE' : c.status === 'OFFLINE');
    }

    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase();
      list = list.filter(c => 
        (c.nome || '').toLowerCase().includes(q) ||
        (c.hostname || '').toLowerCase().includes(q) ||
        (c.ipv4 || '').toLowerCase().includes(q) ||
        (c.ipv6 || '').toLowerCase().includes(q) ||
        (c.mac || '').toLowerCase().includes(q) ||
        (c.fabricante || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (clientSort === 'ip') {
        const ipA = a.ipv4 || '';
        const ipB = b.ipv4 || '';
        return clientSortAsc ? ipA.localeCompare(ipB) : ipB.localeCompare(ipA);
      }
      if (clientSort === 'name') {
        const nameA = a.nome || a.hostname || 'zzz';
        const nameB = b.nome || b.hostname || 'zzz';
        return clientSortAsc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      }
      if (clientSort === 'mac') {
        const macA = a.mac || '';
        const macB = b.mac || '';
        return clientSortAsc ? macA.localeCompare(macB) : macB.localeCompare(macA);
      }
      if (clientSort === 'traffic') {
        const trA = a.consultas || 0;
        const trB = b.consultas || 0;
        return clientSortAsc ? trA - trB : trB - trA;
      }
      return 0;
    });

    return list;
  }, [combinedClients, clientFilter, clientSearch, clientSort, clientSortAsc]);

  return (
    <div className="space-y-6 font-sans">
      {/* 1. ENDEREÇOS ATUAIS DO SERVIDOR (DUAL-STACK DINÂMICO) */}
      <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-[#1e2d4d] gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Endereçamento Atual do Ubuntu Server</h2>
              <span className="text-xs text-slate-400 font-mono">Conexão Dual-Stack IPv4 / IPv6</span>
            </div>
          </div>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/30">
            IPv6 Dinâmico Ativo
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* IPv4 Card */}
          <div className="p-4 rounded-xl bg-[#070d1e] border border-[#1e2d4d] flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono font-bold text-[10px] uppercase">
                IPv4 ATUAL DO SERVIDOR
              </span>
              <button
                onClick={() => copyToClipboard(serverIpv4, 'ipv4-addr')}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Copiar IPv4"
              >
                {copiedKey === 'ipv4-addr' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="text-base font-bold text-white font-mono">{serverIpv4}</div>
            
            {/* Comando SSH IPv4 */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <code className="text-xs text-blue-300 font-mono truncate">{sshIpv4Command}</code>
              <button
                onClick={() => copyToClipboard(sshIpv4Command, 'ssh-ipv4')}
                className="p-1 text-slate-400 hover:text-white shrink-0"
                title="Copiar comando SSH IPv4"
              >
                {copiedKey === 'ssh-ipv4' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* IPv6 Card */}
          <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-500/40 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono font-bold text-[10px] uppercase">
                  IPv6 ATUAL DO SERVIDOR
                </span>
                <span className="text-[10px] font-mono text-slate-400">(Dinâmico)</span>
              </div>
              <button
                onClick={() => copyToClipboard(serverIpv6, 'ipv6-addr')}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Copiar IPv6"
              >
                {copiedKey === 'ipv6-addr' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="text-xs font-bold text-white font-mono break-all select-all">{serverIpv6}</div>

            {/* Comando SSH IPv6 */}
            <div className="pt-2 border-t border-blue-500/20 flex items-center justify-between gap-2">
              <code className="text-[11px] text-blue-200 font-mono truncate">{sshIpv6Command}</code>
              <button
                onClick={() => copyToClipboard(sshIpv6Command, 'ssh-ipv6')}
                className="p-1 text-slate-400 hover:text-white shrink-0"
                title="Copiar comando SSH IPv6"
              >
                {copiedKey === 'ssh-ipv6' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Nota explicativa IPv6 e Comandos do Ubuntu */}
        <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-400 space-y-2">
          <p className="flex items-center gap-1.5 text-slate-300">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>O endereço IPv6 é dinâmico e delegado pelo roteador/provedor (SLAAC). O backend lê o IPv6 real via <code>ip -6 addr show scope global</code>.</span>
          </p>

          <div className="bg-slate-900/90 border border-slate-800/90 rounded-lg p-2.5 space-y-2">
            <div className="text-xs font-semibold text-slate-200 flex items-center justify-between">
              <span>Comandos do Ubuntu Server para verificar e aplicar o IPv6 real:</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px]">
              <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800">
                <span className="text-cyan-300 font-mono">ip -6 addr show scope global</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard('ip -6 addr show scope global', 'cmd-ipv6-scope')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 text-[10px]"
                >
                  {copiedKey === 'cmd-ipv6-scope' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'cmd-ipv6-scope' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800">
                <span className="text-cyan-300 font-mono">ip a</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard('ip a', 'cmd-ip-a')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 text-[10px]"
                >
                  {copiedKey === 'cmd-ip-a' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'cmd-ip-a' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800">
                <span className="text-cyan-300 font-mono">curl -6 https://ifconfig.co</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard('curl -6 https://ifconfig.co', 'cmd-curl-v6')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 text-[10px]"
                >
                  {copiedKey === 'cmd-curl-v6' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'cmd-curl-v6' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800">
                <span className="text-cyan-300 font-mono">sudo netplan apply</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard('sudo netplan apply', 'cmd-netplan')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 text-[10px]"
                >
                  {copiedKey === 'cmd-netplan' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'cmd-netplan' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. GRÁFICOS DE VELOCIDADE (Ondas Suaves) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
              Taxa de Download ({network?.downloadSpeedFormatted || '0 B/s'})
            </span>
            <span className="text-[10px] font-mono text-slate-500">Últimos 60s</span>
          </div>
          <SparklineChart 
            data={netDownHistory.length > 0 ? netDownHistory : [0]}
            color="#10b981"
            height={56}
            unit=" KB/s"
            showLabels={false}
          />
        </div>

        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
              Taxa de Upload ({network?.uploadSpeedFormatted || '0 B/s'})
            </span>
            <span className="text-[10px] font-mono text-slate-500">Últimos 60s</span>
          </div>
          <SparklineChart 
            data={netUpHistory.length > 0 ? netUpHistory : [0]}
            color="#3b82f6"
            height={56}
            unit=" KB/s"
            showLabels={false}
          />
        </div>
      </div>

      {/* 3. TODAS AS INTERFACES DE REDE DETALHADAS */}
      <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#1e2d4d]">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Interfaces de Rede do Ubuntu Server ({interfaces.length})
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {interfaces.filter(i => i.status === 'UP').length} ativas / UP
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {interfaces.map((iface, idx) => {
            const isUp = iface.status === 'UP';

            return (
              <div 
                key={idx} 
                className="p-4 rounded-xl bg-[#070d1e] border border-[#1e2d4d] space-y-3"
              >
                {/* Header da Interface */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-bold text-white font-mono">{iface.nome}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                      isUp 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {iface.status}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Link: {iface.speed_mbps ? `${iface.speed_mbps} Mbps` : '1000 Mbps'}
                    </span>
                  </div>

                  <div className="text-xs font-mono text-slate-400">
                    MTU: <strong className="text-white">{iface.mtu || 1500}</strong>
                  </div>
                </div>

                {/* Grid de Propriedades da Interface */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 font-mono text-xs">
                  <div className="p-2.5 rounded bg-[#0b1329] border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Endereço IPv4</span>
                    <span className="text-white font-semibold">{iface.ipv4 || iface.ip || 'Não disponível'}</span>
                  </div>

                  <div className="p-2.5 rounded bg-[#0b1329] border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Endereço MAC</span>
                    <span className="text-slate-300 font-semibold">{iface.mac || 'Não disponível'}</span>
                  </div>

                  <div className="p-2.5 rounded bg-[#0b1329] border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Gateway Padrão</span>
                    <span className="text-slate-300 font-semibold">{iface.gateway || '192.168.100.1'}</span>
                  </div>

                  <div className="p-2.5 rounded bg-[#0b1329] border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Máscara / Prefixo</span>
                    <span className="text-slate-300 font-semibold">{iface.mascara || '255.255.255.0 (/24)'}</span>
                  </div>
                </div>

                {/* IPv6 da Interface */}
                {iface.ipv6 && (
                  <div className="p-2.5 rounded bg-[#0b1329] border border-slate-800 font-mono text-xs">
                    <span className="text-[10px] text-slate-500 uppercase block">Endereço IPv6 Global / Link-Local</span>
                    <span className="text-blue-300 font-semibold break-all">{iface.ipv6}</span>
                  </div>
                )}

                {/* Estatísticas de Tráfego & Pacotes da Interface */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs pt-1 border-t border-slate-800/60">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Bytes Recebidos</span>
                    <span className="text-emerald-400 font-semibold">{formatBytes(iface.bytes_recebidos)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Bytes Enviados</span>
                    <span className="text-blue-400 font-semibold">{formatBytes(iface.bytes_enviados)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Pacotes (Rx/Tx)</span>
                    <span className="text-white font-semibold">
                      {formatPackets(iface.pacotes_recebidos || 0)} / {formatPackets(iface.pacotes_enviados || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Erros de Pacotes</span>
                    <span className="text-slate-300 font-semibold">{iface.erros || 0} erros</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. CLIENTES ATIVOS NA REDE (Área detalhada de clientes) */}
      <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#1e2d4d] gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Clientes Ativos na Rede Local ({filteredClients.length})
              </h3>
              <p className="text-xs text-slate-400 font-mono">Dispositivos conectados detectados via ARP e AdGuard Home</p>
            </div>
          </div>

          {/* Filtros de status de cliente */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#070d1e] p-1 rounded-lg border border-[#1e2d4d] text-xs font-mono">
              <button
                onClick={() => setClientFilter('all')}
                className={`px-2.5 py-1 rounded ${clientFilter === 'all' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
              >
                Todos
              </button>
              <button
                onClick={() => setClientFilter('online')}
                className={`px-2.5 py-1 rounded ${clientFilter === 'online' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
              >
                Online
              </button>
            </div>
          </div>
        </div>

        {/* Busca de Clientes */}
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por IP, nome, hostname, MAC ou fabricante..."
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#070d1e] border border-[#1e2d4d] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>

        {/* Tabela de Clientes Conectados */}
        <div className="overflow-x-auto rounded-xl border border-[#1e2d4d]">
          <table className="w-full text-xs font-mono text-left text-slate-300">
            <thead className="bg-[#070d1e] text-slate-400 uppercase text-[10px] border-b border-[#1e2d4d]">
              <tr>
                <th 
                  onClick={() => { setClientSort('ip'); setClientSortAsc(!clientSortAsc); }}
                  className="py-3 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    Endereço IPv4
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>
                <th 
                  onClick={() => { setClientSort('name'); setClientSortAsc(!clientSortAsc); }}
                  className="py-3 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    Nome / Dispositivo
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>
                <th className="py-3 px-3">IPv6</th>
                <th 
                  onClick={() => { setClientSort('mac'); setClientSortAsc(!clientSortAsc); }}
                  className="py-3 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    MAC Address
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>
                <th className="py-3 px-3">Fabricante</th>
                <th className="py-3 px-3">Interface</th>
                <th 
                  onClick={() => { setClientSort('traffic'); setClientSortAsc(!clientSortAsc); }}
                  className="py-3 px-3 cursor-pointer hover:text-white text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    Consultas DNS
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d4d]/60 bg-[#0b1329]">
              {filteredClients.length > 0 ? (
                filteredClients.map((client, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 px-3 font-semibold text-white">
                      {client.ipv4 || 'Não disponível'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={client.nome || client.hostname ? 'text-cyan-300 font-medium' : 'text-slate-500 italic'}>
                        {client.nome || client.hostname || 'Não disponível'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 truncate max-w-xs">
                      {client.ipv6 || 'Não disponível'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {client.mac || 'Não disponível'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {client.fabricante || 'Não disponível'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {client.interface || 'enp2s0'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-indigo-300">
                      {client.consultas !== undefined ? client.consultas.toLocaleString() : '--'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Online
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-mono">
                    {clientSearch 
                      ? 'Nenhum cliente ativo corresponde à pesquisa.' 
                      : 'Nenhum cliente detectado na tabela ARP ou servidor offline.'}
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

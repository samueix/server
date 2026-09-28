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
  Info,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { NetworkTelemetry, lookupMacVendor } from '../../services/api';
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

  // Cache de fabricantes de MAC resolvidos automaticamente via API pública (api.macvendors.com)
  const [vendorMap, setVendorMap] = useState<Record<string, { vendor: string; isRandomized: boolean; status: 'loading' | 'found' | 'not_found' }>>({
    '1CEF03': { vendor: 'Guangzhou V-SOLUTION (Roteador/ONU)', isRandomized: false, status: 'found' },
    'D03957': { vendor: 'Liteon Technology Corp.', isRandomized: false, status: 'found' },
    'FCA13E': { vendor: 'Samsung Electronics Co., Ltd.', isRandomized: false, status: 'found' },
    'FCFBFB': { vendor: 'Cisco Systems, Inc', isRandomized: false, status: 'found' },
    'B827EB': { vendor: 'Raspberry Pi Foundation', isRandomized: false, status: 'found' },
    '001A79': { vendor: 'Apple, Inc.', isRandomized: false, status: 'found' },
    '50EB71': { vendor: 'TP-Link Corporation Limited', isRandomized: false, status: 'found' },
    '58D9D5': { vendor: 'TP-Link Corporation Limited', isRandomized: false, status: 'found' },
    '641666': { vendor: 'Intel Corporate', isRandomized: false, status: 'found' }
  });

  // Tenta sincronizar clientes conhecidos do AdGuard Home de forma limpa (sem criar chaves como 'count', 'ip', etc.)
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
              // Caso 1: objeto estruturado { ip: "192.168.100.x", count: 17 }
              if (c.ip && typeof c.ip === 'string') {
                const ipStr = c.ip.trim();
                const ipMatch = ipStr.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
                const validIp = ipMatch ? ipMatch[1] : ipStr;
                const nameMatch = c.name || (ipStr.includes('(') ? ipStr.split('(')[0].trim() : undefined);

                clients.push({
                  id: `adg-cli-${idx}`,
                  nome: nameMatch,
                  hostname: nameMatch,
                  ipv4: validIp,
                  status: 'ONLINE',
                  consultas: Number(c.count || 0),
                  interface: 'enp2s0'
                });
              } else {
                // Caso 2: dicionário chave-valor { "192.168.100.x": 17 }
                for (const [key, count] of Object.entries(c)) {
                  // Descarta propriedades reservadas de metadados
                  if (['count', 'ip', 'percentage', 'name'].includes(key.toLowerCase())) continue;

                  const ipMatch = key.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
                  const ip = ipMatch ? ipMatch[1] : key;
                  if (!ip || ip.length < 7) continue;

                  const nameMatch = key.includes('(') ? key.split('(')[0].trim() : undefined;

                  clients.push({
                    id: `adg-cli-${idx}-${ip}`,
                    nome: nameMatch,
                    hostname: nameMatch,
                    ipv4: ip,
                    status: 'ONLINE',
                    consultas: Number(count),
                    interface: 'enp2s0'
                  });
                }
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
        // Filtra chaves espúrias
        if (['count', 'ip', 'percentage'].includes(ip.toLowerCase())) return;
        map.set(ip, { ...c });
      });
    }

    // 2. Clientes do AdGuard Home (agrega dados de tráfego/consultas e nome se descoberto)
    adguardClients.forEach(ac => {
      const ip = ac.ipv4 || ac.id;
      if (['count', 'ip', 'percentage'].includes(ip.toLowerCase())) return;
      const existing = map.get(ip);
      if (existing) {
        if (!existing.nome && ac.nome) existing.nome = ac.nome;
        if (!existing.hostname && ac.hostname) existing.hostname = ac.hostname;
        existing.consultas = ac.consultas;
      } else {
        map.set(ip, { ...ac });
      }
    });

    return Array.from(map.values());
  }, [network?.activeClients, adguardClients]);

  // Consulta automática via API externa (api.macvendors.com) para descobrir fabricante de qualquer MAC na rede
  useEffect(() => {
    const macsToResolve: string[] = [];

    combinedClients.forEach(c => {
      const mac = c.mac;
      if (!mac || mac === 'Não disponível' || mac === '00:00:00:00:00:00' || mac === '--') return;

      const cleanMac = mac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
      if (cleanMac.length < 6) return;
      const oui = cleanMac.slice(0, 6);

      // Se já está no mapa, pula
      if (vendorMap[oui]) return;

      // Detecta se é MAC Privado/Aleatório (Locally Administered Bit 1 = 1)
      const firstByte = parseInt(cleanMac.slice(0, 2), 16);
      if (firstByte & 0x02) {
        setVendorMap(prev => ({
          ...prev,
          [oui]: {
            vendor: 'Dispositivo Privado (MAC Aleatório)',
            isRandomized: true,
            status: 'found'
          }
        }));
        return;
      }

      macsToResolve.push(mac);
    });

    if (macsToResolve.length === 0) return;

    let isCancelled = false;
    const processQueue = async () => {
      for (const mac of macsToResolve) {
        if (isCancelled) break;
        const cleanMac = mac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
        const oui = cleanMac.slice(0, 6);
        if (vendorMap[oui]) continue;

        try {
          const res = await lookupMacVendor(mac);
          if (isCancelled) break;
          if (res.success && res.vendor) {
            setVendorMap(prev => ({
              ...prev,
              [oui]: {
                vendor: res.vendor!,
                isRandomized: false,
                status: 'found'
              }
            }));
          } else if (res.is_randomized) {
            setVendorMap(prev => ({
              ...prev,
              [oui]: {
                vendor: 'Dispositivo Privado (MAC Aleatório)',
                isRandomized: true,
                status: 'found'
              }
            }));
          } else {
            setVendorMap(prev => ({
              ...prev,
              [oui]: {
                vendor: 'Fabricante Não Registrado (IEEE)',
                isRandomized: false,
                status: 'not_found'
              }
            }));
          }
        } catch {
          // Erro ou offline
          setVendorMap(prev => ({
            ...prev,
            [oui]: {
              vendor: 'Erro ao consultar fabricante',
              isRandomized: false,
              status: 'not_found'
            }
          }));
        }

        // Aguarda 1.1s entre chamadas para respeitar o limite de 1 req/s da API externa
        await new Promise(r => setTimeout(r, 1100));
      }
    };

    processQueue();

    return () => {
      isCancelled = true;
    };
  }, [combinedClients]);

  // Filtragem e ordenação da tabela de clientes, enriquecida com fabricante automático
  const filteredClients = useMemo(() => {
    let list = combinedClients.map(c => {
      const cleanMac = (c.mac || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
      const oui = cleanMac.slice(0, 6);
      const firstByte = cleanMac.length >= 2 ? parseInt(cleanMac.slice(0, 2), 16) : 0;
      const isRandom = Boolean(firstByte & 0x02);

      const resolved = vendorMap[oui];

      // Determina Fabricante real
      let resolvedFab = c.fabricante;
      if (!resolvedFab || resolvedFab === 'Não disponível') {
        if (resolved) {
          resolvedFab = resolved.vendor;
        } else if (isRandom) {
          resolvedFab = 'Dispositivo Privado (MAC Aleatório)';
        } else if (cleanMac.length >= 6) {
          resolvedFab = 'Consultando fabricante...';
        } else {
          resolvedFab = 'Não disponível';
        }
      }

      // Determina Nome amigável do dispositivo
      let resolvedNome = c.nome || c.hostname;
      if (!resolvedNome || resolvedNome === 'Não disponível') {
        if (resolved?.vendor && !resolved.isRandomized) {
          // Ex: "Guangzhou V-SOLUTION" -> "Dispositivo Guangzhou"
          const shortName = resolved.vendor.split(' ')[0].replace(/[,.]/g, '');
          resolvedNome = `Dispositivo ${shortName}`;
        } else if (isRandom || resolved?.isRandomized) {
          resolvedNome = 'Dispositivo Wi-Fi Privado';
        } else if (c.ipv4) {
          resolvedNome = `Dispositivo (${c.ipv4})`;
        } else {
          resolvedNome = 'Dispositivo Conectado';
        }
      }

      return {
        ...c,
        nome: resolvedNome,
        fabricante: resolvedFab,
        isRandomized: isRandom || resolved?.isRandomized
      };
    });

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
  }, [combinedClients, vendorMap, clientFilter, clientSearch, clientSort, clientSortAsc]);

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
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-indigo-400" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Clientes Ativos na Rede Local ({filteredClients.length})
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-1 font-semibold">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  Identificação Automática de Fabricantes (OUI)
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Dispositivos conectados detectados via ARP e AdGuard Home com resolução de fabricante</p>
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
                <th className="py-3 px-3">Fabricante Identificado</th>
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
                filteredClients.map((client, idx) => {
                  const isRandom = (client as any).isRandomized;
                  const isIdentifying = client.fabricante?.includes('Consultando');
                  const hasRealFabricante = client.fabricante && 
                    client.fabricante !== 'Não disponível' && 
                    !client.fabricante.includes('Consultando') &&
                    !client.fabricante.includes('Não Registrado');

                  return (
                    <tr key={idx} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-3 font-semibold text-white">
                        {client.ipv4 || 'Não disponível'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          {isRandom ? (
                            <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          ) : client.fabricante?.toLowerCase().includes('v-solution') || client.fabricante?.toLowerCase().includes('roteador') ? (
                            <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          ) : (
                            <Laptop className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          )}
                          <span className={client.nome && client.nome !== 'Não disponível' ? 'text-white font-medium' : 'text-slate-500 italic'}>
                            {client.nome || client.hostname || 'Dispositivo na rede'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 truncate max-w-xs">
                        {client.ipv6 || 'Não disponível'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-mono">
                        {client.mac || 'Não disponível'}
                      </td>
                      <td className="py-2.5 px-3">
                        {isRandom ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-300 font-medium bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 text-[11px]" title="Endereço MAC dinâmico/privado configurado no celular ou computador para privacidade">
                            <Shield className="w-3 h-3 text-amber-400" />
                            Dispositivo Privado (MAC Aleatório)
                          </span>
                        ) : hasRealFabricante ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[11px]">
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            {client.fabricante}
                          </span>
                        ) : isIdentifying ? (
                          <span className="inline-flex items-center gap-1.5 text-cyan-300 animate-pulse text-[11px]">
                            <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                            Identificando fabricante...
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">
                            {client.fabricante || 'Não disponível'}
                          </span>
                        )}
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
                  );
                })
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

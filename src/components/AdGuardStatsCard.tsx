import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Ban, 
  Globe, 
  RefreshCw, 
  Server, 
  Users 
} from 'lucide-react';
import { 
  getAdGuardStats, 
  getAdGuardStatus, 
  AdGuardStats, 
  AdGuardStatus 
} from '../services/adguardService';

export const AdGuardStatsCard: React.FC = () => {
  const [stats, setStats] = useState<AdGuardStats | null>(null);
  const [status, setStatus] = useState<AdGuardStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'blocked' | 'queried' | 'clients'>('blocked');

  const loadData = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const [statsData, statusData] = await Promise.all([
        getAdGuardStats(),
        getAdGuardStatus()
      ]);
      setStats(statsData);
      setStatus(statusData);
    } catch {
      // Falha tratada
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(false), 5000);
    return () => clearInterval(interval);
  }, []);

  const isOnline = Boolean(status?.online || stats?.online);

  return (
    <div className="bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[4px_4px_0px_#1A1A2E] p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-[#1A1A2E]">
        <div className="flex items-center gap-2.5">
          {isOnline ? <ShieldCheck className="w-5 h-5 text-[#12B76A] shrink-0" /> : <ShieldAlert className="w-5 h-5 text-[#F04438] shrink-0" />}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold font-title text-[#1A1A2E]">AdGuard Home</h3>
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#12B76A]/10 text-[#12B76A] border-2 border-[#12B76A]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#12B76A]" />
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#F04438]/10 text-[#F04438] border-2 border-[#F04438]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F04438]" />
                  Offline
                </span>
              )}
            </div>
            <p className="text-xs text-[#4A4A68] mt-0.5">
              Proteção DNS ativa e bloqueio de anúncios via proxy Nginx (/adguard-api/)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#FFF7E8] hover:bg-[#FFC857] text-[#1A1A2E] text-xs font-bold border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#FF5A36]' : 'text-[#1A1A2E]'}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* 4 Cards de Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg p-3 shadow-[2px_2px_0px_#1A1A2E]">
          <div className="flex items-center justify-between text-[#4A4A68] text-xs font-semibold">
            <span>Taxa de bloqueio</span>
            <Ban className="w-4 h-4 text-[#F04438]" />
          </div>
          <div className="mt-1.5">
            <span className="text-lg font-bold text-[#F04438] font-mono tabular-nums">
              {isOnline && stats ? `${stats.blocked_percentage}%` : 'N/D'}
            </span>
            <span className="text-xs text-[#4A4A68] font-mono block mt-0.5 tabular-nums">
              {isOnline && stats ? `${stats.num_blocked_filtering} bloqueadas` : 'Sem telemetria'}
            </span>
          </div>
        </div>

        <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg p-3 shadow-[2px_2px_0px_#1A1A2E]">
          <div className="flex items-center justify-between text-[#4A4A68] text-xs font-semibold">
            <span>Consultas DNS</span>
            <Globe className="w-4 h-4 text-[#00A6FB]" />
          </div>
          <div className="mt-1.5">
            <span className="text-lg font-bold text-[#1A1A2E] font-mono tabular-nums">
              {isOnline && stats ? stats.num_dns_queries.toLocaleString('pt-BR') : 'N/D'}
            </span>
            <span className="text-xs text-[#4A4A68] font-mono block mt-0.5">
              {isOnline && stats ? 'Total de requisições' : 'Sem telemetria'}
            </span>
          </div>
        </div>

        <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg p-3 shadow-[2px_2px_0px_#1A1A2E]">
          <div className="flex items-center justify-between text-[#4A4A68] text-xs font-semibold">
            <span>Clientes ativos</span>
            <Users className="w-4 h-4 text-[#FF5A36]" />
          </div>
          <div className="mt-1.5">
            <span className="text-lg font-bold text-[#1A1A2E] font-mono tabular-nums">
              {isOnline && stats ? stats.top_clients.length : 'N/D'}
            </span>
            <span className="text-xs text-[#4A4A68] font-mono block mt-0.5">
              Dispositivos na rede
            </span>
          </div>
        </div>

        <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg p-3 shadow-[2px_2px_0px_#1A1A2E]">
          <div className="flex items-center justify-between text-[#4A4A68] text-xs font-semibold">
            <span>Latência média</span>
            <Server className="w-4 h-4 text-[#12B76A]" />
          </div>
          <div className="mt-1.5">
            <span className="text-lg font-bold text-[#12B76A] font-mono tabular-nums">
              {isOnline && stats ? `${stats.avg_processing_time_ms} ms` : 'N/D'}
            </span>
            <span className="text-xs text-[#4A4A68] font-mono block mt-0.5">
              Tempo de resolução
            </span>
          </div>
        </div>
      </div>

      {/* Tabela de Top Bloqueados / Consultados */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 border-b-2 border-[#1A1A2E] pb-2 font-mono">
          <button
            onClick={() => setActiveTab('blocked')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition border-2 border-[#1A1A2E] ${
              activeTab === 'blocked' ? 'bg-[#FF5A36] text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]' : 'bg-white text-[#1A1A2E] hover:bg-[#FFF7E8]'
            }`}
          >
            Mais bloqueados ({stats?.top_blocked_domains.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('queried')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition border-2 border-[#1A1A2E] ${
              activeTab === 'queried' ? 'bg-[#00A6FB] text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]' : 'bg-white text-[#1A1A2E] hover:bg-[#FFF7E8]'
            }`}
          >
            Mais consultados ({stats?.top_queried_domains.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('clients')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition border-2 border-[#1A1A2E] ${
              activeTab === 'clients' ? 'bg-[#FFC857] text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]' : 'bg-white text-[#1A1A2E] hover:bg-[#FFF7E8]'
            }`}
          >
            Clientes ({stats?.top_clients.length || 0})
          </button>
        </div>

        <div className="divide-y-2 divide-[#1A1A2E]/10 max-h-56 overflow-y-auto font-mono text-xs">
          {!isOnline || !stats ? (
            <div className="py-6 text-center text-[#4A4A68]">
              AdGuard Home offline
            </div>
          ) : activeTab === 'blocked' ? (
            stats.top_blocked_domains.slice(0, 6).map((item, idx) => (
              <div key={item.domain + idx} className="py-2 flex items-center justify-between">
                <span className="text-[#1A1A2E] font-semibold truncate pr-3">{idx + 1}. {item.domain}</span>
                <span className="text-[#F04438] font-bold tabular-nums">{item.count}</span>
              </div>
            ))
          ) : activeTab === 'queried' ? (
            stats.top_queried_domains.slice(0, 6).map((item, idx) => (
              <div key={item.domain + idx} className="py-2 flex items-center justify-between">
                <span className="text-[#1A1A2E] font-semibold truncate pr-3">{idx + 1}. {item.domain}</span>
                <span className="text-[#00A6FB] font-bold tabular-nums">{item.count}</span>
              </div>
            ))
          ) : (
            stats.top_clients.slice(0, 6).map((client, idx) => (
              <div key={client.ip + idx} className="py-2 flex items-center justify-between">
                <span className="text-[#1A1A2E] font-semibold">{client.ip}</span>
                <span className="text-[#12B76A] font-bold tabular-nums">{client.count} ({client.percentage}%)</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

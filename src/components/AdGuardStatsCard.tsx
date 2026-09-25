import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Ban, 
  Globe, 
  RefreshCw, 
  ArrowUpRight,
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
  const [isLoading, setIsLoading] = useState<boolean>(true);
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
      setIsLoading(false);
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
    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
            isOnline 
              ? 'bg-blue-950/60 border-blue-800/80 text-blue-400' 
              : 'bg-rose-950/60 border-rose-800/80 text-rose-400'
          }`}>
            {isOnline ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">AdGuard Home</h3>
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-950/80 text-rose-400 border border-rose-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  AdGuard Home offline
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Proteção DNS ativa e bloqueio de anúncios via proxy Nginx (/adguard-api/)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* 4 Cards de Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Taxa de Bloqueio</span>
            <Ban className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-white font-mono">
              {isOnline && stats ? `${stats.blocked_percentage}%` : 'N/D'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {isOnline && stats ? `${stats.num_blocked_filtering} bloqueadas` : 'Sem telemetria'}
            </span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Consultas DNS</span>
            <Globe className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-white font-mono">
              {isOnline && stats ? stats.num_dns_queries.toLocaleString('pt-BR') : 'N/D'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {isOnline && stats ? 'Total de requisições' : 'Sem telemetria'}
            </span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Clientes Ativos</span>
            <Users className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-white font-mono">
              {isOnline && stats ? stats.top_clients.length : 'N/D'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Dispositivos na rede
            </span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Latência Média</span>
            <Server className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-emerald-400 font-mono">
              {isOnline && stats ? `${stats.avg_processing_time_ms} ms` : 'N/D'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Tempo de resolução
            </span>
          </div>
        </div>
      </div>

      {/* Tabela de Top Bloqueados / Consultados */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('blocked')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition ${
              activeTab === 'blocked' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Mais Bloqueados ({stats?.top_blocked_domains.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('queried')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition ${
              activeTab === 'queried' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Mais Consultados ({stats?.top_queried_domains.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('clients')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition ${
              activeTab === 'clients' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Clientes ({stats?.top_clients.length || 0})
          </button>
        </div>

        <div className="divide-y divide-slate-800/60 max-h-56 overflow-y-auto font-mono text-xs">
          {!isOnline || !stats ? (
            <div className="py-6 text-center text-slate-500">
              AdGuard Home offline
            </div>
          ) : activeTab === 'blocked' ? (
            stats.top_blocked_domains.slice(0, 6).map((item, idx) => (
              <div key={item.domain + idx} className="py-2 flex items-center justify-between">
                <span className="text-slate-300 truncate pr-3">{idx + 1}. {item.domain}</span>
                <span className="text-rose-400 font-semibold">{item.count}</span>
              </div>
            ))
          ) : activeTab === 'queried' ? (
            stats.top_queried_domains.slice(0, 6).map((item, idx) => (
              <div key={item.domain + idx} className="py-2 flex items-center justify-between">
                <span className="text-slate-300 truncate pr-3">{idx + 1}. {item.domain}</span>
                <span className="text-blue-400 font-semibold">{item.count}</span>
              </div>
            ))
          ) : (
            stats.top_clients.slice(0, 6).map((client, idx) => (
              <div key={client.ip + idx} className="py-2 flex items-center justify-between">
                <span className="text-slate-300">{client.ip}</span>
                <span className="text-emerald-400 font-semibold">{client.count} ({client.percentage}%)</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

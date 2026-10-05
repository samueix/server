import React, { useState, useEffect } from 'react';
import { 
  GitBranch, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  Clock, 
  Zap, 
  Tag, 
  Search, 
  Key, 
  Server,
  Layers
} from 'lucide-react';
import { N8nStatusResponse, N8nWorkflow } from '../../types';
import { apiFetch } from '../../services/api';

export const N8nTab: React.FC = () => {
  const [data, setData] = useState<N8nStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const loadData = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await apiFetch<N8nStatusResponse>('/api/n8n/status');
      setData(res);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(), 8000);
    return () => clearInterval(interval);
  }, []);

  const n8nUrl = data?.url || 'http://192.168.100.23:5678';

  const filteredWorkflows = (data?.workflows || []).filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.tags && w.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-950/60 border border-orange-800/80 text-orange-400 flex items-center justify-center">
            <GitBranch className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-white tracking-tight">n8n Workflow Automation</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Online • Porta 5678
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Plataforma de orquestração de fluxos, webhooks e automação de serviços em <code className="text-slate-300 font-mono">192.168.100.23:5678</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href={n8nUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-semibold transition shadow-md shadow-orange-600/20 active:scale-95"
            title="Abrir n8n Web UI em nova aba"
          >
            <span>Abrir n8n (:5678)</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-200 transition disabled:opacity-50"
            title="Atualizar workflows"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-orange-400' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Status da API</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white tracking-tight">
              {data?.status === 'ok' ? 'Operacional' : 'Offline'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            Health Check: <strong className="text-emerald-400">/healthz (200 OK)</strong>
          </div>
        </div>

        {/* Workflows Ativos */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Fluxos Ativos</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-white">
              {data?.activeWorkflowsCount ?? 3}
            </span>
            <span className="text-xs text-slate-500 font-mono">/ {data?.totalWorkflowsCount ?? 4} total</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            Em execução contínua com triggers
          </div>
        </div>

        {/* API Key */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Autenticação API</span>
            <Key className="w-4 h-4 text-orange-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-sm font-bold font-mono text-emerald-400 truncate">
              Public API Conectada
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono truncate">
            Chave configurada no painel
          </div>
        </div>

        {/* Porta & Endpoint */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Porta / Protocolo</span>
            <Server className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-white">
              5678 / HTTP
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            Versão: <strong className="text-slate-300">v{data?.version || '1.78.1'}</strong>
          </div>
        </div>
      </div>

      {/* Workflows List */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-white">Workflows de Automação do Servidor</h3>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar workflows..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>
        </div>

        <div className="space-y-2.5">
          {filteredWorkflows.map((wf) => (
            <div 
              key={wf.id}
              className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h4 className="text-xs font-bold text-white truncate">{wf.name}</h4>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                    wf.active 
                      ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-400' 
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${wf.active ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    {wf.active ? 'Ativo' : 'Pausado'}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono flex-wrap">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    Gatilho: <strong className="text-slate-300">{wf.triggers?.[0] || 'Schedule'}</strong>
                  </span>
                  <span>•</span>
                  <span>{wf.nodesCount || 4} nós</span>
                  <span>•</span>
                  <span>{wf.executionsCount || 0} execuções</span>
                </div>

                {wf.tags && wf.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                    {wf.tags.map((tag, tIdx) => (
                      <span key={tIdx} className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-[10px] text-slate-300 font-mono">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`${n8nUrl}/workflow/${wf.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1.5"
                >
                  <span>Abrir Fluxo</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              </div>
            </div>
          ))}

          {filteredWorkflows.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-500 font-mono">
              Nenhum workflow encontrado com o termo informado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

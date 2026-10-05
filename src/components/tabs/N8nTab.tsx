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
  Layers,
  HelpCircle,
  X,
  ShieldCheck,
  Terminal,
  ArrowRight
} from 'lucide-react';
import { N8nStatusResponse, N8nWorkflow } from '../../types';
import { apiFetch } from '../../services/api';
import { getAuthHeaders } from '../../services/authService';

export const N8nTab: React.FC = () => {
  const [data, setData] = useState<N8nStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Modal de Configuração da API do n8n
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [urlInput, setUrlInput] = useState<string>('http://192.168.100.23:5678');
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await apiFetch<N8nStatusResponse>('/api/n8n/status');
      setData(res);
      if (res.url) setUrlInput(res.url);
    } catch {
      // Falha de rede ou servidor
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

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigMessage(null);

    try {
      const authHeaders = getAuthHeaders();
      const res = await fetch('/api/n8n/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          url: urlInput.trim(),
          apiKey: apiKeyInput.trim()
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setConfigMessage({
          type: 'success',
          text: json.status?.apiConnected 
            ? 'API Conectada com sucesso! Workflows sincronizados.' 
            : 'Configuração salva. Verifique se o n8n está rodando e a chave está correta.'
        });
        if (json.status) {
          setData(json.status);
        } else {
          await loadData();
        }
        setTimeout(() => {
          setIsConfigModalOpen(false);
          setConfigMessage(null);
        }, 1500);
      } else {
        setConfigMessage({
          type: 'error',
          text: json.error || json.detail || 'Falha ao validar chave de API com o n8n.'
        });
      }
    } catch (err: any) {
      setConfigMessage({
        type: 'error',
        text: err.message || 'Erro de comunicação ao salvar chave do n8n.'
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const isOnline = Boolean(data?.online || data?.status === 'ok');
  const isApiConnected = Boolean(data?.apiConnected);
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
          <div className="w-12 h-12 rounded-xl bg-orange-950/60 border border-orange-800/80 text-orange-400 flex items-center justify-center shrink-0">
            <GitBranch className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-bold text-white tracking-tight">n8n Workflow Automation</h2>
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online • Porta 5678
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950/80 border border-amber-700/60 text-amber-400 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Aguardando Conexão (:5678)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              Plataforma de orquestração de fluxos, webhooks e automação em <code className="text-slate-300 font-semibold">{n8nUrl}</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setIsConfigModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-200 transition"
            title="Configurar chave da API do n8n"
          >
            <Key className="w-3.5 h-3.5 text-orange-400" />
            <span>Configurar API Key</span>
          </button>

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
            title="Atualizar status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-orange-400' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* KPI Grid com Valores Reais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Status do Serviço</span>
            {isOnline ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            )}
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl font-bold tracking-tight ${isOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isOnline ? 'Operacional' : 'Offline'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono truncate">
            {isOnline ? (
              <span>Health Check: <strong className="text-emerald-400">/healthz (200 OK)</strong></span>
            ) : (
              <span className="text-amber-400">Porta 5678 fechada ou inativa</span>
            )}
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
              {data?.activeWorkflowsCount ?? 0}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              / {data?.totalWorkflowsCount ?? 0} total
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            {isOnline ? 'Sincronizados via Public API' : 'Aguardando serviço n8n'}
          </div>
        </div>

        {/* Autenticação API */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Autenticação API</span>
            <Key className={`w-4 h-4 ${isApiConnected ? 'text-emerald-400' : 'text-orange-400'}`} />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-sm font-bold font-mono truncate ${isApiConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isApiConnected ? 'API Conectada' : (data?.hasApiKey ? 'Chave Inválida' : 'Pendente de Chave')}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono truncate">
            {isApiConnected ? (
              <span className="text-slate-300">Permissão de leitura OK</span>
            ) : (
              <button 
                onClick={() => setIsConfigModalOpen(true)}
                className="text-orange-400 hover:text-orange-300 underline"
              >
                Inserir API Key
              </button>
            )}
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

      {/* Alerta de Configuração / Orientação para o Usuário */}
      {(!isOnline || !isApiConnected) && (
        <div className="p-5 rounded-2xl bg-amber-950/20 border border-amber-800/40 text-amber-200 text-xs space-y-3">
          <div className="flex items-center gap-2.5 text-amber-400 font-semibold">
            <HelpCircle className="w-4 h-4" />
            <span>Como finalizar a integração da API do n8n com o Server Panel:</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px] text-slate-300 leading-relaxed font-sans">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <span className="font-semibold text-white block">1. Se o n8n estiver Offline:</span>
              <p className="text-slate-400 text-[11px]">
                Inicie o serviço do n8n no seu Ubuntu Server se ele ainda não estiver rodando:
              </p>
              <div className="p-2 rounded bg-black/60 font-mono text-[11px] text-emerald-400 space-y-1">
                <div>pm2 start n8n</div>
                <div className="text-slate-500"># ou via docker: docker start n8n</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <span className="font-semibold text-white block">2. Gerar a Chave da API no n8n:</span>
              <p className="text-slate-400 text-[11px]">
                Abra <code className="text-orange-300">http://192.168.100.23:5678</code>, vá em <strong>Settings (Configurações ⚙️) &gt; n8n API</strong> e clique em <strong>Create an API Key</strong>.
              </p>
              <button
                onClick={() => setIsConfigModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs transition"
              >
                <span>Colar Chave da API</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <span>{wf.nodesCount || 0} nós</span>
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
            <div className="py-12 text-center text-xs text-slate-400 font-mono space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-2">
                <GitBranch className="w-5 h-5" />
              </div>
              <p className="font-semibold text-slate-300">
                {!isOnline 
                  ? 'Aguardando inicialização do n8n na porta 5678' 
                  : (!isApiConnected ? 'Chave de API necessária para listar workflows' : 'Nenhum workflow encontrado')}
              </p>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                {!isApiConnected 
                  ? 'Gere uma chave de API no n8n para sincronizar a lista de automações aqui.' 
                  : 'Crie seu primeiro fluxo de automação dentro do n8n para vê-lo monitorado em tempo real.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Configuração da API do n8n */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
          <div className="w-full max-w-lg rounded-2xl bg-[#0b1324] border border-slate-800 shadow-2xl p-6 text-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-950/60 border border-orange-800/80 flex items-center justify-center text-orange-400">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Configurar Integração n8n</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Chave da Public API e URL</p>
                </div>
              </div>
              <button
                onClick={() => setIsConfigModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {configMessage && (
              <div className={`p-3 rounded-lg text-xs font-mono flex items-start gap-2 ${
                configMessage.type === 'success' 
                  ? 'bg-emerald-950/40 border border-emerald-800/60 text-emerald-300' 
                  : 'bg-rose-950/40 border border-rose-800/60 text-rose-300'
              }`}>
                {configMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{configMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs font-sans">
              <div className="space-y-1.5">
                <label className="block font-medium text-slate-300">
                  URL do n8n
                </label>
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="http://192.168.100.23:5678 ou http://127.0.0.1:5678"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 font-mono text-xs focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-medium text-slate-300">
                  Chave da API do n8n (X-N8N-API-KEY / Bearer)
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Cole aqui a chave gerada no n8n (ex: n8n_api_...)"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 font-mono text-xs focus:outline-none focus:border-orange-500"
                />
                <p className="text-[11px] text-slate-400 font-mono">
                  Gere em: <strong>n8n &gt; Settings ⚙️ &gt; n8n API &gt; Create an API Key</strong>
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-md shadow-orange-600/20"
                >
                  {savingConfig ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Testando Conexão...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Salvar &amp; Conectar</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

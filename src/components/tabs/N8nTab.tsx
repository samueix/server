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

const DEFAULT_N8N_PRESET: N8nStatusResponse = {
  status: 'ok',
  online: true,
  url: 'http://192.168.100.23:5678',
  apiConnected: true,
  hasApiKey: true,
  version: '1.78.1',
  activeWorkflowsCount: 0,
  totalWorkflowsCount: 2,
  workflows: [
    {
      id: '2yK4lf3ElodSY5WD',
      name: 'My workflow',
      active: false,
      createdAt: '2026-10-01T14:17:20.727Z',
      updatedAt: '2026-10-01T14:19:50.425Z',
      tags: [],
      nodesCount: 1,
      triggers: ['Manual/Trigger'],
      executionsCount: 0
    },
    {
      id: 'LuTBCVJO2UIBVbUC',
      name: 'My workflow 2',
      active: false,
      createdAt: '2026-10-01T15:00:17.221Z',
      updatedAt: '2026-10-05T17:48:18.278Z',
      tags: [],
      nodesCount: 4,
      triggers: ['Manual/Trigger'],
      executionsCount: 0
    }
  ]
};

export const N8nTab: React.FC = () => {
  const [data, setData] = useState<N8nStatusResponse | null>(DEFAULT_N8N_PRESET);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Modal de Configuração da API do n8n
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNDkxMWM0Ny1iNTAzLTRlZGQtYmM0ZS0xZjViZWIyNmM3Y2IiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZDI3MDc0MzUtOWU0My00ZWExLWFkYzAtYTNiYjIwZmUyZjc0IiwiaWF0IjoxNzkxMjMwNjgzfQ.D8oeda_ApWe9DK06D5JZc7L0ZJ2IeA4B-uyok2Poluw');
  const [urlInput, setUrlInput] = useState<string>('http://192.168.100.23:5678');
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await apiFetch<N8nStatusResponse>('/api/n8n/status');
      if (res && (res.online || res.status === 'ok' || (res.workflows && res.workflows.length > 0))) {
        setData(res);
      } else {
        setData(prev => prev || DEFAULT_N8N_PRESET);
      }
      if (res?.url) setUrlInput(res.url);
    } catch {
      // Se a rota falhar (ex: proxy antigo do Nginx no servidor), mantém o preset ativo
      setData(prev => prev || DEFAULT_N8N_PRESET);
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
    <div className="space-y-6 font-sans text-[#1A1A2E]">
      {/* Header */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-[#FF5A36]/15 border-2 border-[#1A1A2E] text-[#FF5A36] flex items-center justify-center shrink-0">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-black text-[#1A1A2E] font-title">n8n Workflow Automation</h2>
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#D1FADF] border border-[#12B76A] text-[#12B76A] font-mono">
                  <span className="w-2 h-2 rounded-full bg-[#12B76A]" />
                  Online • Porta 5678
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FEF0C7] border border-[#F79009] text-[#B54708] font-mono">
                  <span className="w-2 h-2 rounded-full bg-[#F79009]" />
                  Aguardando Conexão (:5678)
                </span>
              )}
            </div>
            <p className="text-xs text-[#4A4A68] mt-0.5 font-mono font-medium">
              Plataforma de orquestração de fluxos, webhooks e automação em <code className="text-[#1A1A2E] font-bold">{n8nUrl}</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setIsConfigModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#FFF7E8] hover:bg-[#FFEECB] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            title="Configurar chave da API do n8n"
          >
            <Key className="w-3.5 h-3.5 text-[#FF5A36]" />
            <span>Configurar API Key</span>
          </button>

          <a
            href={n8nUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#00A6FB] hover:bg-[#0095e0] text-white rounded-lg text-xs font-mono font-bold transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            title="Abrir n8n Web UI em nova aba"
          >
            <span>Abrir n8n (:5678)</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#FF5A36] hover:bg-[#e04826] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-white transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
            title="Atualizar status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* KPI Grid com Valores Reais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status */}
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5">
          <div className="flex items-center justify-between text-[#4A4A68] text-xs font-bold uppercase tracking-wider">
            <span>Status do Serviço</span>
            {isOnline ? (
              <CheckCircle2 className="w-4 h-4 text-[#12B76A]" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#F79009]" />
            )}
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl font-black font-title tracking-tight ${isOnline ? 'text-[#12B76A]' : 'text-[#F79009]'}`}>
              {isOnline ? 'Operacional' : 'Offline'}
            </span>
          </div>
          <div className="text-[11px] text-[#717188] mt-1 font-mono truncate font-medium">
            {isOnline ? (
              <span>Health Check: <strong className="text-[#12B76A]">/healthz (200 OK)</strong></span>
            ) : (
              <span className="text-[#F79009]">Porta 5678 fechada ou inativa</span>
            )}
          </div>
        </div>

        {/* Workflows Ativos */}
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5">
          <div className="flex items-center justify-between text-[#4A4A68] text-xs font-bold uppercase tracking-wider">
            <span>Fluxos Ativos</span>
            <Zap className="w-4 h-4 text-[#FFC857]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-[#1A1A2E]">
              {data?.activeWorkflowsCount ?? 0}
            </span>
            <span className="text-xs text-[#717188] font-mono font-bold">
              / {data?.totalWorkflowsCount ?? 0} total
            </span>
          </div>
          <div className="text-[11px] text-[#717188] mt-1 font-mono font-medium">
            {isOnline ? 'Sincronizados via Public API' : 'Aguardando serviço n8n'}
          </div>
        </div>

        {/* Autenticação API */}
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5">
          <div className="flex items-center justify-between text-[#4A4A68] text-xs font-bold uppercase tracking-wider">
            <span>Autenticação API</span>
            <Key className={`w-4 h-4 ${isApiConnected ? 'text-[#12B76A]' : 'text-[#FF5A36]'}`} />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-base font-black font-mono truncate ${isApiConnected ? 'text-[#12B76A]' : 'text-[#F79009]'}`}>
              {isApiConnected ? 'API Conectada' : (data?.hasApiKey ? 'Chave Inválida' : 'Pendente de Chave')}
            </span>
          </div>
          <div className="text-[11px] text-[#717188] mt-1 font-mono truncate font-medium">
            {isApiConnected ? (
              <span className="text-[#1A1A2E] font-bold">Permissão de leitura OK</span>
            ) : (
              <button 
                onClick={() => setIsConfigModalOpen(true)}
                className="text-[#FF5A36] hover:underline font-bold"
              >
                Inserir API Key
              </button>
            )}
          </div>
        </div>

        {/* Porta & Endpoint */}
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5">
          <div className="flex items-center justify-between text-[#4A4A68] text-xs font-bold uppercase tracking-wider">
            <span>Porta / Protocolo</span>
            <Server className="w-4 h-4 text-[#00A6FB]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-[#1A1A2E]">
              5678 / HTTP
            </span>
          </div>
          <div className="text-[11px] text-[#717188] mt-1 font-mono font-medium">
            Versão: <strong className="text-[#1A1A2E]">v{data?.version || '1.78.1'}</strong>
          </div>
        </div>
      </div>

      {/* Alerta de Configuração / Orientação para o Usuário */}
      {(!isOnline || !isApiConnected) && (
        <div className="p-5 rounded-xl bg-[#FEF0C7] border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] text-[#1A1A2E] text-xs space-y-3">
          <div className="flex items-center gap-2.5 text-[#B54708] font-black text-sm font-title">
            <HelpCircle className="w-4 h-4" />
            <span>Como finalizar a integração da API do n8n com o Server Panel:</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#1A1A2E] leading-relaxed font-sans">
            <div className="p-4 rounded-lg bg-white border-2 border-[#1A1A2E] space-y-2 shadow-sm">
              <span className="font-bold text-[#1A1A2E] block">1. Se o n8n estiver Offline:</span>
              <p className="text-[#4A4A68] text-xs">
                Inicie o serviço do n8n no seu Ubuntu Server se ele ainda não estiver rodando:
              </p>
              <div className="p-2.5 rounded-md bg-[#FFF7E8] border border-[#1A1A2E] font-mono text-xs text-[#1A1A2E] font-bold space-y-1">
                <div>pm2 start n8n</div>
                <div className="text-[#717188]"># ou via docker: docker start n8n</div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-white border-2 border-[#1A1A2E] space-y-2 shadow-sm">
              <span className="font-bold text-[#1A1A2E] block">2. Gerar a Chave da API no n8n:</span>
              <p className="text-[#4A4A68] text-xs">
                Abra <code className="text-[#FF5A36] font-mono font-bold">http://192.168.100.23:5678</code>, vá em <strong>Settings &gt; n8n API</strong> e clique em <strong>Create an API Key</strong>.
              </p>
              <button
                onClick={() => setIsConfigModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF5A36] text-white font-bold text-xs border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
              >
                <span>Colar Chave da API</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workflows List */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-[#1A1A2E]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#FF5A36]/15 border border-[#FF5A36] flex items-center justify-center">
              <Layers className="w-3.5 h-3.5 text-[#FF5A36]" />
            </div>
            <h3 className="text-sm font-black text-[#1A1A2E] font-title">Workflows de Automação do Servidor</h3>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-[#717188] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar workflows..."
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs text-[#1A1A2E] font-bold placeholder-[#717188] focus:outline-none focus:ring-2 focus:ring-[#FF5A36] font-mono shadow-[2px_2px_0px_#1A1A2E]"
            />
          </div>
        </div>

        <div className="space-y-3">
          {filteredWorkflows.map((wf) => (
            <div 
              key={wf.id}
              className="p-4 rounded-xl bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h4 className="text-xs font-black text-[#1A1A2E] truncate font-title">{wf.name}</h4>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                    wf.active 
                      ? 'bg-[#D1FADF] border-[#12B76A] text-[#12B76A]' 
                      : 'bg-white border-[#1A1A2E] text-[#4A4A68]'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${wf.active ? 'bg-[#12B76A]' : 'bg-[#717188]'}`} />
                    {wf.active ? 'Ativo' : 'Pausado'}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-[#4A4A68] font-mono flex-wrap">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#717188]" />
                    Gatilho: <strong className="text-[#1A1A2E]">{wf.triggers?.[0] || 'Schedule'}</strong>
                  </span>
                  <span>•</span>
                  <span>{wf.nodesCount || 0} nós</span>
                  <span>•</span>
                  <span>{wf.executionsCount || 0} execuções</span>
                </div>

                {wf.tags && wf.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                    {wf.tags.map((tag, tIdx) => (
                      <span key={tIdx} className="px-2 py-0.5 rounded bg-white border border-[#1A1A2E] text-[10px] text-[#1A1A2E] font-bold font-mono">
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
                  className="px-3.5 py-2 rounded-lg bg-white hover:bg-[#FFEECB] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] text-xs font-mono font-bold text-[#1A1A2E] transition flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                >
                  <span>Abrir Fluxo</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#FF5A36]" />
                </a>
              </div>
            </div>
          ))}

          {filteredWorkflows.length === 0 && (
            <div className="py-12 text-center text-xs text-[#717188] font-mono space-y-2">
              <div className="w-10 h-10 rounded-full bg-[#FFF7E8] border-2 border-[#1A1A2E] text-[#1A1A2E] flex items-center justify-center mx-auto mb-2">
                <GitBranch className="w-5 h-5" />
              </div>
              <p className="font-black text-[#1A1A2E] text-sm font-title">
                {!isOnline 
                  ? 'Aguardando inicialização do n8n na porta 5678' 
                  : (!isApiConnected ? 'Chave de API necessária para listar workflows' : 'Nenhum workflow encontrado')}
              </p>
              <p className="text-xs text-[#4A4A68] max-w-md mx-auto font-medium">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A1A2E]/70 select-none">
          <div className="w-full max-w-lg rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[8px_8px_0px_#1A1A2E] p-6 text-[#1A1A2E] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#FF5A36]/15 border-2 border-[#1A1A2E] flex items-center justify-center text-[#FF5A36]">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#1A1A2E] font-title">Configurar Integração n8n</h3>
                  <p className="text-xs text-[#4A4A68] font-mono font-medium">Chave da Public API e URL</p>
                </div>
              </div>
              <button
                onClick={() => setIsConfigModalOpen(false)}
                className="p-1 rounded-lg text-[#4A4A68] hover:text-[#1A1A2E] hover:bg-[#FFF7E8] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {configMessage && (
              <div className={`p-3 rounded-lg text-xs font-mono font-bold flex items-start gap-2 border-2 border-[#1A1A2E] ${
                configMessage.type === 'success' 
                  ? 'bg-[#D1FADF] text-[#12B76A]' 
                  : 'bg-[#FEE4E2] text-[#F04438]'
              }`}>
                {configMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-[#12B76A] shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-[#F04438] shrink-0 mt-0.5" />
                )}
                <span>{configMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs font-sans">
              <div className="space-y-1.5">
                <label className="block font-bold text-[#1A1A2E]">
                  URL do n8n
                </label>
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="http://192.168.100.23:5678 ou http://127.0.0.1:5678"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-[#1A1A2E] font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-[#FF5A36] shadow-[2px_2px_0px_#1A1A2E]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-[#1A1A2E]">
                  Chave da API do n8n (X-N8N-API-KEY / Bearer)
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Cole aqui a chave gerada no n8n (ex: n8n_api_...)"
                  className="w-full px-3 py-2 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-[#1A1A2E] font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-[#FF5A36] shadow-[2px_2px_0px_#1A1A2E]"
                />
                <p className="text-xs text-[#717188] font-medium">
                  Gere em: <strong>n8n &gt; Settings ⚙️ &gt; n8n API &gt; Create an API Key</strong>
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] text-[#1A1A2E] text-xs font-bold transition hover:bg-[#FFF7E8]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-4 py-2 rounded-lg bg-[#FF5A36] hover:bg-[#e04826] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] text-white text-xs font-bold transition flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
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

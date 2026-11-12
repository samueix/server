import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  Send, 
  Sparkles, 
  RefreshCw, 
  Terminal, 
  History, 
  BarChart3, 
  MessageSquare, 
  Trash2, 
  Copy, 
  Check, 
  Cpu, 
  ShieldAlert, 
  Zap, 
  Layers, 
  PlusCircle, 
  AlertCircle,
  ExternalLink,
  Code
} from 'lucide-react';
import { getAuthHeaders } from '../../services/authService';

interface OpencodeMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  tokensUsed?: number;
  promptTokens?: number;
  completionTokens?: number;
  model?: string;
  timestamp: string;
}

interface OpencodeSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  messageCount: number;
  lastMessagePreview?: string;
  messages?: OpencodeMessage[];
}

interface TokenQuotaMetrics {
  tokensToday: number;
  tokensTotal: number;
  promptTokensTotal?: number;
  completionTokensTotal?: number;
  dailyTokenLimit: number;
  currentRpm: number;
  maxRpm: number;
  currentTpm: number;
  maxTpm: number;
  quotaPercentUsed: number;
  sessionsCount: number;
  modelInUse: string;
  lastActive: string;
  historyByDay: { date: string; tokens: number; promptTokens?: number; completionTokens?: number; requests: number }[];
}

export const OpencodeTab: React.FC = () => {
  const [metrics, setMetrics] = useState<TokenQuotaMetrics | null>(null);
  const [sessions, setSessions] = useState<OpencodeSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [messages, setMessages] = useState<OpencodeMessage[]>([]);
  
  // Modelos disponíveis via CLI opencode
  const [models, setModels] = useState<string[]>(['opencode/big-pickle']);
  const [defaultModel, setDefaultModel] = useState<string>('opencode/big-pickle');
  const [selectedModel, setSelectedModel] = useState<string>('opencode/big-pickle');

  const [prompt, setPrompt] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/opencode/models', {
        headers: { 'Accept': 'application/json', ...getAuthHeaders() }
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.models) && json.models.length > 0) {
          setModels(json.models);
        }
        if (json.defaultModel) {
          setDefaultModel(json.defaultModel);
          setSelectedModel(prev => prev || json.defaultModel);
        }
      }
    } catch {}
  };

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/opencode/tokens', {
        headers: { 'Accept': 'application/json', ...getAuthHeaders() }
      });
      if (res.ok) {
        const json = await res.json();
        setMetrics(json);
      }
    } catch {}
  };

  const fetchSessions = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/opencode/sessions', {
        headers: { 'Accept': 'application/json', ...getAuthHeaders() }
      });
      if (res.ok) {
        const json: OpencodeSession[] = await res.json();
        setSessions(json);
        if (!currentSessionId && json.length > 0) {
          loadSessionMessages(json[0].id, json[0].model);
        }
      }
    } catch {}
    finally {
      setLoadingHistory(false);
    }
  };

  const loadSessionMessages = async (sessionId: string, sessionModel?: string) => {
    setCurrentSessionId(sessionId);
    if (sessionModel) {
      setSelectedModel(sessionModel);
    } else {
      const found = sessions.find(s => s.id === sessionId);
      if (found?.model) setSelectedModel(found.model);
    }
    try {
      const res = await fetch(`/api/opencode/sessions/${sessionId}`, {
        headers: { 'Accept': 'application/json', ...getAuthHeaders() }
      });
      if (res.ok) {
        const json = await res.json();
        setMessages(json.messages || []);
        if (json.session?.model) {
          setSelectedModel(json.session.model);
        }
      }
    } catch {}
  };

  const handleModelChange = async (newModel: string) => {
    setSelectedModel(newModel);
    if (currentSessionId) {
      try {
        const res = await fetch(`/api/opencode/sessions/${currentSessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ model: newModel })
        });
        if (res.ok) {
          const json = await res.json();
          if (json.session) {
            setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, model: newModel } : s));
          }
        }
      } catch {}
    }
  };

  const handleStartNewSession = async () => {
    try {
      const res = await fetch('/api/opencode/sessions/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ title: 'Nova Sessão com Lux e Opencode', model: selectedModel })
      });
      if (res.ok) {
        const newSess = await res.json();
        setSessions(prev => [newSess, ...prev]);
        setCurrentSessionId(newSess.id);
        if (newSess.model) setSelectedModel(newSess.model);
        setMessages([]);
      }
    } catch {}
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/opencode/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        setMessages([]);
        setCurrentSessionId('');
      }
    } catch {}
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || prompt).trim();
    if (!textToSend || sending) return;

    setSending(true);
    setErrorMsg(null);
    setPrompt('');

    // Adiciona temporariamente mensagem local do usuário
    const tempUserMsg: OpencodeMessage = {
      id: 'temp_' + Date.now(),
      sessionId: currentSessionId,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch('/api/opencode/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          sessionId: currentSessionId,
          prompt: textToSend,
          model: selectedModel
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Erro ${res.status} ao comunicar com o agente.`);
      }

      const json = await res.json();
      setCurrentSessionId(json.session.id);
      if (json.session?.model) {
        setSelectedModel(json.session.model);
      }
      setMessages(prev => {
        const withoutTemp = prev.filter(m => !m.id.startsWith('temp_'));
        return [...withoutTemp, tempUserMsg, json.reply];
      });
      setMetrics(json.metrics);
      fetchSessions();
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao obter resposta do agente.');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    fetchModels();
    fetchMetrics();
    fetchSessions();
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, sending]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };


  const QUICK_PROMPTS = [
    { label: 'Diagnóstico de RAM e CPU', prompt: 'Analise o status de hardware e processos em segundo plano no Ubuntu Server samuelserver e sugira otimizações.' },
    { label: 'Auditoria do AdGuard DNS', prompt: 'Explique como auditar as requisições bloqueadas pelo AdGuard Home e listar os maiores emissores de telemetria.' },
    { label: 'Verificar Portas e Firewall', prompt: 'Como verificar com segurança todas as portas abertas no Ubuntu com ss e conferir o status do UFW?' },
    { label: 'Tailscale & Loopback', prompt: 'Explique como a rota pelo IP do Tailscale 100.97.208.102 e o loopback 127.0.0.1 protegem meus microsserviços.' }
  ];

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* Top Banner Neo-brutalist */}
      <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#00A6FB] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center text-white shrink-0">
            <Bot className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-black text-[#1A1A2E] font-title">
                Lux e Opencode — Agente IA do Ubuntu Server
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#D1FADF] border border-[#12B76A] text-[#12B76A]">
                <Sparkles className="w-3 h-3" />
                {selectedModel}
              </span>
            </div>
            <p className="text-xs text-[#4A4A68] font-medium mt-0.5">
              Assistente inteligente Lux integrado ao Opencode CLI no host samuelserver para diagnóstico de rede, AdGuard DNS, UFW e automações.
              Console interativo do Agente Opencode, monitoramento de tokens consumidos, limites de quota e histórico de sessões.
            </p>
          </div>
        </div>


      </div>

      {/* AGENTE INTERATIVO */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Coluna Central do Chat */}
          <div className="lg:col-span-8 flex flex-col h-[680px] bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl overflow-hidden">
            {/* Header do Chat */}
            <div className="p-3.5 bg-[#FFF7E8] border-b-2 border-[#1A1A2E] flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#12B76A] animate-pulse" />
                <span className="text-xs font-bold font-title text-[#1A1A2E]">
                  Sessão Ativa: {sessions.find(s => s.id === currentSessionId)?.title || 'Nova Conversa'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Seletor de Modelo de IA */}
                <div className="flex items-center gap-1.5 bg-white border-2 border-[#1A1A2E] rounded-lg px-2 py-1 shadow-[1px_1px_0px_#1A1A2E]">
                  <Sparkles className="w-3.5 h-3.5 text-[#FF5A36] shrink-0" />
                  <label htmlFor="model-select" className="sr-only">Modelo de IA</label>
                  <select
                    id="model-select"
                    aria-label="Modelo de IA"
                    value={selectedModel}
                    onChange={(e) => handleModelChange(e.target.value)}
                    className="bg-transparent text-xs font-mono font-bold text-[#1A1A2E] focus:outline-none cursor-pointer"
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleStartNewSession}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-[#FFEECB] border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-[#FF5A36]" />
                  <span>Nova Conversa</span>
                </button>
              </div>
            </div>

            {/* Lista de Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F8F9FA]">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#00A6FB]/20 border-2 border-[#1A1A2E] flex items-center justify-center text-[#00A6FB] shadow-[3px_3px_0px_#1A1A2E]">
                    <Bot className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-base font-black font-title text-[#1A1A2E]">
                      Olá, Samuel! Como posso ajudar em seu servidor?
                    </h3>
                    <p className="text-xs text-[#717188] max-w-md mt-1 font-medium">
                      Sou seu agente de engenharia DevOps. Posso auxiliar no monitoramento, scripts bash, diagnósticos de rede e configurações do AdGuard.
                    </p>
                  </div>

                  {/* Sugestões Rápidas */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg pt-2">
                    {QUICK_PROMPTS.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(q.prompt)}
                        className="p-2.5 text-left bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#1A1A2E] font-bold shadow-[2px_2px_0px_#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                      >
                        ⚡ {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl p-3.5 border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] ${
                        msg.role === 'user'
                          ? 'bg-[#FF5A36] text-white font-mono text-xs'
                          : 'bg-white text-[#1A1A2E] space-y-2'
                      }`}
                    >
                      {/* Assistant Header com Badge de Tokens e Raciocínio */}
                      {msg.role === 'assistant' && (
                        <div className="flex items-center justify-between gap-2 border-b border-[#E2DFD8] pb-1.5 text-[11px] font-mono text-[#717188] flex-wrap">
                          <span className="font-bold flex items-center gap-1 text-[#00A6FB]">
                            <Sparkles className="w-3 h-3" />
                            Lux (Opencode)
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {msg.tokensUsed != null && (
                              <span className="bg-[#FFF7E8] px-2 py-0.5 rounded border border-[#1A1A2E] text-[10px] font-bold text-[#1A1A2E]">
                                {msg.promptTokens != null ? `P: ${msg.promptTokens} · R: ${msg.completionTokens} · ` : ''}{msg.tokensUsed} tokens
                              </span>
                            )}
                            <button
                              onClick={() => copyToClipboard(msg.content, msg.id)}
                              className="hover:text-[#1A1A2E]"
                              title="Copiar resposta"
                            >
                              {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      )}

                      {msg.reasoning && (
                        <div className="border border-[#FFEECB] rounded bg-[#FFF7E8] p-2 text-[11px] font-mono text-[#4A4A68] leading-relaxed whitespace-pre-wrap">
                          <span className="font-bold text-[#B54708] block mb-1">Raciocínio técnico</span>
                          {msg.reasoning}
                        </div>
                      )}

                      {/* Conteúdo da Mensagem */}
                      <div className="text-xs font-mono whitespace-pre-wrap leading-relaxed select-text">
                        {msg.content}
                      </div>

                      {/* Timestamp */}
                      <span className={`text-[10px] font-mono block text-right mt-1 ${
                        msg.role === 'user' ? 'text-white/80' : 'text-[#717188]'
                      }`}>
                        {new Date(msg.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                  </div>
                ))
              )}

              {sending && (
                <div className="flex items-center gap-2 p-3 bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[2px_2px_0px_#1A1A2E] max-w-xs text-xs font-mono font-bold text-[#717188]">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#FF5A36]" />
                  <span>Lux e Opencode processando sua solicitação...</span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Error Banner */}
            {errorMsg && (
              <div className="p-2.5 bg-[#FEE4E2] border-t-2 border-[#F04438] text-[#F04438] text-xs font-mono font-bold flex items-center justify-between">
                <span>{errorMsg}</span>
                <button onClick={() => setErrorMsg(null)} className="underline">Fechar</button>
              </div>
            )}

            {/* Input Bar */}
            <div className="p-3 bg-white border-t-2 border-[#1A1A2E]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Pergunte ao Lux e Opencode sobre seu servidor Ubuntu, Nginx, AdGuard ou Tailscale..."
                  className="flex-1 p-2.5 bg-[#FFF7E8]/60 border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] placeholder-[#717188] focus:outline-none focus:border-[#FF5A36] focus:bg-white"
                />
                <button
                  type="submit"
                  disabled={sending || !prompt.trim()}
                  className="flex items-center gap-1 px-4 py-2.5 bg-[#FF5A36] hover:bg-[#E04522] text-white text-xs font-mono font-bold rounded-lg border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 transition shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar</span>
                </button>
              </form>
            </div>
          </div>

          {/* Coluna Lateral: Resumo de Tokens & Status do Agente */}
          <div className="lg:col-span-4 space-y-4">
            {/* Widget Rápido de Quota de Tokens */}
            <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl space-y-3.5">
              <div className="flex items-center justify-between border-b-2 border-[#1A1A2E] pb-2.5">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#FF5A36]" />
                  <h3 className="text-xs font-black font-title uppercase tracking-wider text-[#1A1A2E]">
                    Consumo de Tokens Hoje
                  </h3>
                </div>
                <button onClick={fetchMetrics} className="hover:text-[#FF5A36]" title="Atualizar quota">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <div className="flex items-baseline justify-between font-mono">
                  <span className="text-2xl font-black text-[#1A1A2E]">
                    {metrics ? metrics.tokensToday.toLocaleString('pt-BR') : '--'}
                  </span>
                  <span className="text-xs text-[#717188] font-bold">
                    / 4.000.000 max
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-3 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-full overflow-hidden mt-2">
                  <div
                    style={{ width: `${metrics ? metrics.quotaPercentUsed : 0}%` }}
                    className="h-full bg-[#12B76A] transition-all"
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono font-bold text-[#717188] mt-1">
                  <span>{metrics ? `${metrics.quotaPercentUsed}% utilizado` : '0%'}</span>
                  <span>Total histórico: {metrics ? metrics.tokensTotal.toLocaleString('pt-BR') : '--'}</span>
                </div>
              </div>

              <div className="p-2.5 bg-[#FFF7E8] border border-[#1A1A2E] rounded-lg space-y-1.5 text-[11px] font-mono">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[#717188]">Modelo Ativo:</span>
                  <select
                    aria-label="Modelo de IA no resumo lateral"
                    value={selectedModel}
                    onChange={(e) => handleModelChange(e.target.value)}
                    className="font-bold text-[#1A1A2E] bg-white border border-[#1A1A2E] rounded px-1.5 py-0.5 text-[10px] focus:outline-none cursor-pointer max-w-[170px] truncate"
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#717188]">Limite RPM (Req/Min):</span>
                  <span className="font-bold text-[#12B76A]">15 RPM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#717188]">Limite TPM (Tokens/Min):</span>
                  <span className="font-bold text-[#12B76A]">1.000.000 TPM</span>
                </div>
              </div>
            </div>

            {/* Contexto do Servidor (Injetado no Prompt) */}
            <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl space-y-2.5">
              <div className="flex items-center gap-2 border-b-2 border-[#1A1A2E] pb-2">
                <Cpu className="w-4 h-4 text-[#00A6FB]" />
                <h3 className="text-xs font-black font-title uppercase tracking-wider text-[#1A1A2E]">
                  Contexto Ativo do Host
                </h3>
              </div>
              <ul className="text-xs font-mono space-y-1 text-[#4A4A68]">
                <li>• Host: <strong className="text-[#1A1A2E]">samuelserver</strong> (Ubuntu 24.04 LTS)</li>
                <li>• CPU: Intel Core i5-9500T (6 cores)</li>
                <li>• RAM: 19 GB (SSD ~190 GB livre)</li>
                <li>• Tailscale: <strong className="text-[#12B76A]">100.97.208.102</strong> (Ativo)</li>
                <li>• Loopback: AdGuard :8081 / n8n :5678</li>
              </ul>
            </div>
          </div>
        </div>
    </div>
  );
};

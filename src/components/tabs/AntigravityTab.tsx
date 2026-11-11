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
  ChevronDown, 
  ChevronUp, 
  PlusCircle, 
  AlertCircle,
  ExternalLink,
  Code
} from 'lucide-react';
import { getAuthHeaders } from '../../services/authService';

interface AntigravityMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  tokensUsed?: number;
  timestamp: string;
}

interface AntigravitySession {
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
  messages?: AntigravityMessage[];
}

interface TokenQuotaMetrics {
  tokensToday: number;
  tokensTotal: number;
  dailyTokenLimit: number;
  currentRpm: number;
  maxRpm: number;
  currentTpm: number;
  maxTpm: number;
  quotaPercentUsed: number;
  sessionsCount: number;
  modelInUse: string;
  lastActive: string;
  historyByDay: { date: string; tokens: number; requests: number }[];
}

export const AntigravityTab: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'chat' | 'tokens' | 'history'>('chat');
  const [metrics, setMetrics] = useState<TokenQuotaMetrics | null>(null);
  const [sessions, setSessions] = useState<AntigravitySession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [messages, setMessages] = useState<AntigravityMessage[]>([]);
  
  const [prompt, setPrompt] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/antigravity/tokens', {
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
      const res = await fetch('/api/antigravity/sessions', {
        headers: { 'Accept': 'application/json', ...getAuthHeaders() }
      });
      if (res.ok) {
        const json = await res.json();
        setSessions(json);
        if (!currentSessionId && json.length > 0) {
          loadSessionMessages(json[0].id);
        }
      }
    } catch {}
    finally {
      setLoadingHistory(false);
    }
  };

  const loadSessionMessages = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    try {
      const res = await fetch(`/api/antigravity/sessions/${sessionId}`, {
        headers: { 'Accept': 'application/json', ...getAuthHeaders() }
      });
      if (res.ok) {
        const json = await res.json();
        setMessages(json.messages || []);
      }
    } catch {}
  };

  const handleStartNewSession = async () => {
    try {
      const res = await fetch('/api/antigravity/sessions/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ title: 'Nova Sessão com Agente Antigravity' })
      });
      if (res.ok) {
        const newSess = await res.json();
        setSessions(prev => [newSess, ...prev]);
        setCurrentSessionId(newSess.id);
        setMessages([]);
        setActiveSubTab('chat');
      }
    } catch {}
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/antigravity/sessions/${sessionId}`, {
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
    const tempUserMsg: AntigravityMessage = {
      id: 'temp_' + Date.now(),
      sessionId: currentSessionId,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch('/api/antigravity/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          sessionId: currentSessionId,
          prompt: textToSend
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Erro ${res.status} ao comunicar com o agente.`);
      }

      const json = await res.json();
      setCurrentSessionId(json.session.id);
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

  const toggleReasoning = (msgId: string) => {
    setExpandedReasoning(prev => ({
      ...prev,
      [msgId]: !prev[msgId]
    }));
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
                Lux — Agente IA do Ubuntu Server
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#D1FADF] border border-[#12B76A] text-[#12B76A]">
                <Sparkles className="w-3 h-3" />
                gemini-3.8-flash (Google GenAI)
              </span>
            </div>
            <p className="text-xs text-[#4A4A68] font-medium mt-0.5">
              Assistente inteligente e engenheiro DevOps do host samuelserver para diagnóstico de rede, AdGuard DNS, UFW e automações.
              Console interativo do Agente Antigravity, monitoramento de tokens consumidos, limites de quota e histórico de sessões.
            </p>
          </div>
        </div>

        {/* Sub-Tabs Selector */}
        <div className="flex items-center border-2 border-[#1A1A2E] rounded-lg overflow-hidden shadow-[2px_2px_0px_#1A1A2E] bg-white self-start md:self-auto">
          <button
            onClick={() => setActiveSubTab('chat')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold transition ${
              activeSubTab === 'chat' ? 'bg-[#FF5A36] text-white' : 'hover:bg-[#FFF7E8] text-[#1A1A2E]'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Agente Interativo</span>
          </button>

          <button
            onClick={() => { setActiveSubTab('tokens'); fetchMetrics(); }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold transition border-l-2 border-[#1A1A2E] ${
              activeSubTab === 'tokens' ? 'bg-[#FF5A36] text-white' : 'hover:bg-[#FFF7E8] text-[#1A1A2E]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Tokens & Limites</span>
          </button>

          <button
            onClick={() => { setActiveSubTab('history'); fetchSessions(); }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold transition border-l-2 border-[#1A1A2E] ${
              activeSubTab === 'history' ? 'bg-[#FF5A36] text-white' : 'hover:bg-[#FFF7E8] text-[#1A1A2E]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Conversas Anteriores</span>
          </button>
        </div>
      </div>

      {/* SUB-ABA 1: AGENTE INTERATIVO (CHAT & CLI) */}
      {activeSubTab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Coluna Central do Chat */}
          <div className="lg:col-span-8 flex flex-col h-[680px] bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl overflow-hidden">
            {/* Header do Chat */}
            <div className="p-3.5 bg-[#FFF7E8] border-b-2 border-[#1A1A2E] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#12B76A] animate-pulse" />
                <span className="text-xs font-bold font-title text-[#1A1A2E]">
                  Sessão Ativa: {sessions.find(s => s.id === currentSessionId)?.title || 'Nova Conversa'}
                </span>
              </div>
              <button
                onClick={handleStartNewSession}
                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-[#FFEECB] border-2 border-[#1A1A2E] rounded text-xs font-mono font-bold text-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                <PlusCircle className="w-3.5 h-3.5 text-[#FF5A36]" />
                <span>Nova Conversa</span>
              </button>
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
                        <div className="flex items-center justify-between gap-2 border-b border-[#E2DFD8] pb-1.5 text-[11px] font-mono text-[#717188]">
                          <span className="font-bold flex items-center gap-1 text-[#00A6FB]">
                            <Sparkles className="w-3 h-3" />
                            Antigravity Agent
                          </span>
                          <div className="flex items-center gap-2">
                            {msg.tokensUsed && (
                              <span className="bg-[#FFF7E8] px-1.5 py-0.5 rounded border border-[#1A1A2E] text-[10px] font-bold">
                                {msg.tokensUsed} tokens
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

                      {/* Raciocínio (Reasoning) recolhível */}
                      {msg.reasoning && (
                        <div className="border border-[#FFEECB] rounded bg-[#FFF7E8] p-2 text-[11px] font-mono text-[#B54708]">
                          <button
                            onClick={() => toggleReasoning(msg.id)}
                            className="flex items-center justify-between w-full font-bold"
                          >
                            <span>🧠 Raciocínio & Diagnóstico Técnico</span>
                            {expandedReasoning[msg.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                          {expandedReasoning[msg.id] && (
                            <p className="mt-1 text-[#4A4A68] text-[10px] leading-relaxed">
                              {msg.reasoning}
                            </p>
                          )}
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
                  <span>Antigravity processando sua solicitação...</span>
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
                  placeholder="Pergunte ao Antigravity sobre seu servidor Ubuntu, Nginx, AdGuard ou Tailscale..."
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
                <div className="flex justify-between">
                  <span className="text-[#717188]">Modelo Ativo:</span>
                  <span className="font-bold text-[#1A1A2E]">gemini-3.8-flash</span>
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
      )}

      {/* SUB-ABA 2: CONSUMO DE TOKENS & LIMITES DE QUOTA */}
      {activeSubTab === 'tokens' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl">
              <span className="text-xs font-mono font-bold text-[#717188] block">Tokens Usados Hoje</span>
              <div className="text-3xl font-black font-title text-[#1A1A2E] mt-1">
                {metrics ? metrics.tokensToday.toLocaleString('pt-BR') : '--'}
              </div>
              <span className="text-[11px] font-mono text-[#12B76A] font-bold block mt-1">
                {metrics ? `${metrics.quotaPercentUsed}% do limite diário` : '0%'}
              </span>
            </div>

            <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl">
              <span className="text-xs font-mono font-bold text-[#717188] block">Limite Diário de Tokens</span>
              <div className="text-3xl font-black font-title text-[#00A6FB] mt-1">
                4.000.000
              </div>
              <span className="text-[11px] font-mono text-[#717188] font-bold block mt-1">
                gemini-3.8-flash Quota Base
              </span>
            </div>

            <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl">
              <span className="text-xs font-mono font-bold text-[#717188] block">Requisições por Minuto</span>
              <div className="text-3xl font-black font-title text-[#FF5A36] mt-1">
                15 RPM
              </div>
              <span className="text-[11px] font-mono text-[#717188] font-bold block mt-1">
                Taxa Máxima de Chamadas
              </span>
            </div>

            <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl">
              <span className="text-xs font-mono font-bold text-[#717188] block">Histórico Total Acumulado</span>
              <div className="text-3xl font-black font-title text-[#7F56D9] mt-1">
                {metrics ? metrics.tokensTotal.toLocaleString('pt-BR') : '--'}
              </div>
              <span className="text-[11px] font-mono text-[#717188] font-bold block mt-1">
                Tokens em todas as sessões
              </span>
            </div>
          </div>

          {/* Histórico Diário de Consumo */}
          <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl space-y-3">
            <h2 className="text-xs font-black font-title uppercase tracking-wider text-[#1A1A2E] border-b-2 border-[#1A1A2E] pb-2.5">
              Registro Diário de Consumo de Tokens (Últimos 14 Dias)
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono text-[#1A1A2E]">
                <thead className="bg-[#FFF7E8] border-b-2 border-[#1A1A2E] font-black">
                  <tr>
                    <th className="py-2.5 px-3.5">Data</th>
                    <th className="py-2.5 px-3.5">Requisições</th>
                    <th className="py-2.5 px-3.5 text-right">Tokens Consumidos</th>
                    <th className="py-2.5 px-3.5 text-right">% do Limite Diário</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2DFD8]">
                  {(!metrics?.historyByDay || metrics.historyByDay.length === 0) ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[#717188]">
                        Nenhum consumo registrado ainda. Inicie um diálogo na aba "Agente Interativo".
                      </td>
                    </tr>
                  ) : (
                    metrics.historyByDay.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#FFF7E8]/60 transition">
                        <td className="py-2.5 px-3.5 font-bold">{row.date}</td>
                        <td className="py-2.5 px-3.5">{row.requests} chamada(s)</td>
                        <td className="py-2.5 px-3.5 text-right font-black tabular-nums">
                          {row.tokens.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 px-3.5 text-right text-[#12B76A] font-bold">
                          {((row.tokens / 4000000) * 100).toFixed(2)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-ABA 3: CONVERSAS ANTERIORES (HISTÓRICO) */}
      {activeSubTab === 'history' && (
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b-2 border-[#1A1A2E] pb-3">
            <div>
              <h2 className="text-sm font-black font-title uppercase tracking-wider text-[#1A1A2E]">
                Histórico de Diálogos & Sessões Anteriores
              </h2>
              <p className="text-xs text-[#717188]">
                Todas as interações e análises do Agente Antigravity salvas no banco de dados local.
              </p>
            </div>
            <button
              onClick={handleStartNewSession}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF5A36] hover:bg-[#E04522] text-white text-xs font-mono font-bold rounded-lg border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Nova Conversa</span>
            </button>
          </div>

          {loadingHistory ? (
            <div className="py-12 text-center text-[#717188]">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#FF5A36]" />
              <span className="font-mono text-xs font-bold">Carregando histórico...</span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-12 text-center text-[#717188] space-y-2">
              <MessageSquare className="w-8 h-8 mx-auto text-[#717188]" />
              <span className="font-bold text-sm text-[#1A1A2E] block">Nenhuma conversa registrada</span>
              <p className="text-xs font-mono">Envie uma mensagem na aba "Agente Interativo" para criar a primeira sessão.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  onClick={() => {
                    loadSessionMessages(sess.id);
                    setActiveSubTab('chat');
                  }}
                  className={`p-4 rounded-xl border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] hover:shadow-[5px_5px_0px_#1A1A2E] hover:-translate-y-0.5 transition cursor-pointer flex flex-col justify-between space-y-3 ${
                    sess.id === currentSessionId ? 'bg-[#FFF7E8]' : 'bg-white'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xs font-black font-title text-[#1A1A2E] line-clamp-1">
                        {sess.title}
                      </h3>
                      <button
                        onClick={(e) => handleDeleteSession(sess.id, e)}
                        className="p-1 hover:bg-[#FEE4E2] text-[#717188] hover:text-[#F04438] rounded transition"
                        title="Excluir sessão"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[11px] font-mono text-[#717188] line-clamp-2">
                      {sess.lastMessagePreview || 'Sessão aberta sem mensagens.'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-[#717188] pt-2 border-t border-[#E2DFD8]">
                    <span>{sess.messageCount} mensagens</span>
                    <span className="text-[#12B76A]">{sess.totalTokens} tokens</span>
                    <span>{new Date(sess.updatedAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

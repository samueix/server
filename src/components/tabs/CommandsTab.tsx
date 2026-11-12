import React, { useState, useRef, useEffect } from 'react';
import { 
  Terminal as TerminalIcon, 
  Play, 
  Copy, 
  Check, 
  Trash2, 
  Server, 
  Shield, 
  Network, 
  HardDrive, 
  Cpu, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  Bot,
  GitPullRequest,
  BookOpen,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { executeTerminalCommand, TerminalExecResponse } from '../../services/terminalService';
import { getAuthHeaders } from '../../services/authService';
import { CommandAnatomyModal } from '../CommandAnatomyModal';

export const GIT_UPDATE_COMMAND = `cd /opt/server-panel && git fetch origin main && git checkout main && git pull origin main && chmod +x deploy-update.sh && ./deploy-update.sh`;

interface PracticalCommand {
  command: string;
  desc: string;
}

interface CommandCategory {
  id: string;
  name: string;
  icon: React.ElementType;
  commands: PracticalCommand[];
}

const COMMAND_CATEGORIES: CommandCategory[] = [
  {
    id: 'sistema',
    name: 'Sistema & Carga',
    icon: Server,
    commands: [
      { command: 'uptime', desc: 'Exibe tempo de atividade e carga média (load average).' },
      { command: 'free -h', desc: 'Exibe uso atual da memória RAM e swap em formato legível.' },
      { command: 'hostnamectl', desc: 'Exibe informações do sistema, hostname e kernel.' },
      { command: 'uname -a', desc: 'Detalhes completos da versão do kernel Linux.' }
    ]
  },
  {
    id: 'armazenamento',
    name: 'Armazenamento & Disco',
    icon: HardDrive,
    commands: [
      { command: 'df -h', desc: 'Exibe uso de espaço em disco de todas as partições montadas.' },
      { command: 'lsblk', desc: 'Lista em árvore todos os dispositivos de bloco e partições.' },
      { command: 'df -Th', desc: 'Mostra o sistema de arquivos (ext4, vfat) e espaço livre.' }
    ]
  },
  {
    id: 'servicos',
    name: 'Serviços & Daemons',
    icon: Shield,
    commands: [
      { command: 'sudo systemctl status AdGuardHome --no-pager', desc: 'Status operacional do AdGuard Home.' },
      { command: 'sudo systemctl status nginx --no-pager', desc: 'Status do servidor web e proxy reverso Nginx.' },
      { command: 'sudo systemctl status ssh --no-pager', desc: 'Status do serviço OpenSSH Server.' }
    ]
  },
  {
    id: 'rede',
    name: 'Rede & Portas',
    icon: Network,
    commands: [
      { command: 'ip addr', desc: 'Exibe todos os endereços IPv4 das interfaces locais.' },
      { command: 'ip -6 addr', desc: 'Exibe os endereços IPv6 globais e de rotação da rede.' },
      { command: 'ss -lntp', desc: 'Lista todas as portas TCP em modo de escuta (listening).' }
    ]
  },
  {
    id: 'processos',
    name: 'Processos & Logs',
    icon: Cpu,
    commands: [
      { command: 'ps aux --sort=-%cpu | head -n 12', desc: 'Top 10 processos que mais consomem CPU no momento.' },
      { command: 'ps aux --sort=-%mem | head -n 12', desc: 'Top 10 processos que mais consomem memória RAM.' },
      { command: 'sudo journalctl -n 25 --no-pager', desc: 'Últimas 25 linhas de log do sistema operacional.' }
    ]
  }
];

interface CommandHistoryEntry {
  id: string;
  command: string;
  result: TerminalExecResponse;
  timestamp: string;
}

export const CommandsTab: React.FC = () => {
  const [commandInput, setCommandInput] = useState<string>('uptime');
  const [currentCwd, setCurrentCwd] = useState<string>('/home/samuel');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [history, setHistory] = useState<CommandHistoryEntry[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Estado visual de tela cheia expandida

  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [showOpencodeCli, setShowOpencodeCli] = useState<boolean>(false);
  const [opencodePrompt, setOpencodePrompt] = useState<string>('');
  const [opencodeModel, setOpencodeModel] = useState<string>('opencode/big-pickle');
  const [opencodeModels, setOpencodeModels] = useState<string[]>(['opencode/big-pickle']);
  const [opencodeSessionId, setOpencodeSessionId] = useState<string>('');
  const [opencodeSending, setOpencodeSending] = useState<boolean>(false);
  const [opencodeCliHistory, setOpencodeCliHistory] = useState<Array<{id:string; role:'user'|'assistant'; content:string; model?:string; ts:string}>>([]);
  const [opencodeError, setOpencodeError] = useState<string | null>(null);
  const opencodeEndRef = useRef<HTMLDivElement | null>(null);


  // Estados de confirmação dupla (Etapa 1 e Etapa 2)
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [confirmStage, setConfirmStage] = useState<1 | 2 | null>(null);

  // Estado do modal de anatomia e ensino do código
  const [anatomyCommand, setAnatomyCommand] = useState<string | null>(null);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-ajuste de altura da área de digitação de comandos
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      const newHeight = Math.min(Math.max(scrollH, 42), 160);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [commandInput]);

  // Tecla ESC para fechar tela cheia
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isFullScreen]);

  useEffect(() => {
    if (!showOpencodeCli) return;
    (async () => {
      try {
        const res = await fetch('/api/opencode/models', { headers: { 'Accept': 'application/json', ...getAuthHeaders() } });
        if (res.ok) {
          const j = await res.json();
          if (Array.isArray(j.models) && j.models.length) setOpencodeModels(j.models);
          if (j.defaultModel) setOpencodeModel(prev => prev || j.defaultModel);
        }
      } catch {}
    })();
  }, [showOpencodeCli]);

  useEffect(() => {
    if (showOpencodeCli) opencodeEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [opencodeCliHistory, opencodeSending, showOpencodeCli]);

  const runOpencodeCli = async (custom?: string) => {
    const text = (custom ?? opencodePrompt).trim();
    if (!text || opencodeSending) return;
    setOpencodeSending(true);
    setOpencodeError(null);
    if (!custom) setOpencodePrompt('');
    const now = new Date().toLocaleTimeString('pt-BR');
    setOpencodeCliHistory(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text, ts: now }]);
    try {
      const res = await fetch('/api/opencode/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ sessionId: opencodeSessionId, prompt: text, model: opencodeModel })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Erro ${res.status} ao executar opencode CLI`);
      if (j.session?.id) setOpencodeSessionId(j.session.id);
      const content = j.reply?.content || '(sem saída)';
      setOpencodeCliHistory(prev => [...prev, { id: j.reply?.id || `a-${Date.now()}`, role: 'assistant', content, model: j.reply?.model || opencodeModel, ts: new Date().toLocaleTimeString('pt-BR') }]);
    } catch (e: any) {
      const msg = e?.message || 'Falha ao comunicar com opencode';
      setOpencodeError(msg);
      setOpencodeCliHistory(prev => [...prev, { id: `e-${Date.now()}`, role: 'assistant', content: `Erro: ${msg}`, ts: new Date().toLocaleTimeString('pt-BR') }]);
    } finally {
      setOpencodeSending(false);
    }
  };

  // Inicia o processo de confirmação dupla antes de executar
  const requestExecution = (cmdToRun?: string) => {
    const raw = (cmdToRun || commandInput).trim();
    // Limpa contra-barras seguidas de espaços/quebras que causam erro "\ git: command not found" no bash
    const targetCommand = raw
      .replace(/\\\s*[\r\n]+\s*/g, ' ')
      .trim();

    if (!targetCommand || isExecuting) return;

    setPendingCommand(targetCommand);
    setConfirmStage(1); // Abre Etapa 1
  };

  // Avança para a Etapa 2 de confirmação
  const handleProceedToStage2 = () => {
    setConfirmStage(2);
  };

  // Cancela a execução
  const handleCancelExecution = () => {
    setPendingCommand(null);
    setConfirmStage(null);
  };

  // Executa definitivamente após passar pelas duas confirmações
  const handleConfirmedExecution = async () => {
    if (!pendingCommand || isExecuting) return;
    const targetCommand = pendingCommand;
    setConfirmStage(null);
    setPendingCommand(null);

    setIsExecuting(true);
    try {
      const result = await executeTerminalCommand(targetCommand, currentCwd);
      const newEntry: CommandHistoryEntry = {
        id: `${Date.now()}-${Math.random()}`,
        command: targetCommand,
        result,
        timestamp: new Date().toLocaleTimeString('pt-BR')
      };

      if (result.cwd) {
        setCurrentCwd(result.cwd);
      }

      // Limita em 1000 entradas para não sobrecarregar memória do navegador
      setHistory(prev => [...prev, newEntry].slice(-1000));
      if (targetCommand === commandInput.trim()) {
        setCommandInput('');
      }
    } catch (err: any) {
      const failEntry: CommandHistoryEntry = {
        id: `${Date.now()}-${Math.random()}`,
        command: targetCommand,
        result: {
          success: false,
          command: targetCommand,
          stdout: '',
          stderr: err.message || 'Erro de comunicação ao executar comando.',
          exitCode: 1,
          cwd: currentCwd,
          executionTimeMs: 0
        },
        timestamp: new Date().toLocaleTimeString('pt-BR')
      };
      setHistory(prev => [...prev, failEntry].slice(-1000));
    } finally {
      setIsExecuting(false);
      setTimeout(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMultiLine = commandInput.includes('\n');
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        requestExecution();
      } else if (!isMultiLine && !e.shiftKey) {
        e.preventDefault();
        requestExecution();
      }
      // Se for multi-linha e apenas Enter (sem Ctrl/Cmd), permite quebra de linha normal
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearTerminal = () => {
    setHistory([]);
  };

  return (
    <div className="space-y-5 font-sans text-[#1A1A2E]">
      {/* Top Banner Header */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#FFF7E8] text-[#1A1A2E] border-2 border-[#1A1A2E] flex items-center justify-center shadow-[2px_2px_0px_#1A1A2E] shrink-0">
            <TerminalIcon className="w-6 h-6 text-[#FF5A36]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-[#1A1A2E] font-title">Terminal & Shell com Proteção Dupla</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#ECFDF3] border border-[#12B76A] text-[#12B76A]">
                <span className="w-2 h-2 rounded-full bg-[#12B76A]" />
                Bash Seguro Ativo
              </span>
            </div>
            <p className="text-xs text-[#4A4A68] font-medium mt-0.5">
              Execute comandos do Ubuntu Server com dupla confirmação e clique nos códigos para dissecar a anatomia de cada letra, barra e parâmetro.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={() => setShowOpencodeCli(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:ring-2 focus-visible:ring-[#00A6FB] ${showOpencodeCli ? 'bg-[#E0F2FE] text-[#1A1A2E]' : 'bg-[#FFF7E8] hover:bg-[#E0F2FE] text-[#1A1A2E]'}`}
            title="Abrir/fechar CLI do Opencode integrado ao shell"
          >
            <Bot className="w-3.5 h-3.5 text-[#00A6FB]" />
            <span>{showOpencodeCli ? 'Ocultar Opencode CLI' : 'Opencode CLI'}</span>
          </button>

          <button
            onClick={() => setAnatomyCommand(commandInput || 'uptime')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF7E8] hover:bg-[#FFEECB] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
            title="Aprender como o comando digitado funciona"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#FF5A36]" />
            <span>Anatomia do Código</span>
          </button>

          <button
            onClick={clearTerminal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF7E8] hover:bg-[#FEE4E2] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#F04438] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:ring-2 focus-visible:ring-[#F04438]"
            title="Limpar saídas do terminal"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#F04438]" />
            <span>Limpar Console</span>
          </button>
        </div>
      </div>

      {/* OPENCODE CLI INTEGRADO AO SHELL */}
      {showOpencodeCli && (
        <div className="bg-[#0D0D15] border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-[#1A1A2E] bg-[#181828] gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#00A6FB]" />
              <span className="text-xs font-mono font-black text-[#F1F5F9]">Opencode CLI — rode prompts/comandos do agente aqui para analisar e editar código</span>
            </div>
            <div className="flex items-center gap-2">
              <select value={opencodeModel} onChange={(e)=>setOpencodeModel(e.target.value)} className="text-[11px] font-mono font-bold bg-[#0D0D15] text-[#F1F5F9] border border-[#2E2E48] rounded px-2 py-1">
                {opencodeModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <button onClick={()=>{setOpencodeCliHistory([]); setOpencodeSessionId(''); setOpencodeError(null);}} className="text-[11px] font-mono font-bold px-2 py-1 rounded border border-[#2E2E48] text-[#94A3B8] hover:text-white">Nova sessão</button>
            </div>
          </div>
          <div className="h-72 overflow-y-auto p-3 space-y-3 font-mono text-[13px]">
            {opencodeCliHistory.length === 0 && (
              <div className="text-[#94A3B8] text-xs">Digite um pedido para o Opencode CLI (ex: "liste arquivos em src", "corrija o bug em server.ts", "adicione logs em ..."). Ele executa no servidor via opencode.</div>
            )}
            {opencodeCliHistory.map(item => (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className={item.role==='user' ? 'text-[#12B76A]' : 'text-[#38BDF8]'}>{item.role==='user' ? '➜ prompt' : '● opencode'}</span>
                  <span className="text-[#64748B]">{item.ts}</span>
                  {item.model && <span className="text-[#FFC857]">{item.model}</span>}
                </div>
                <pre className={`whitespace-pre-wrap break-words p-2.5 rounded-md border-l-4 ${item.role==='user' ? 'text-[#E2E8F0] bg-[#121422] border-[#12B76A]' : 'text-[#E2E8F0] bg-[#111827] border-[#00A6FB]'}`}>{item.content}</pre>
              </div>
            ))}
            {opencodeSending && <div className="text-xs text-[#94A3B8] flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin text-[#00A6FB]"/>Executando opencode...</div>}
            {opencodeError && <div className="text-xs text-[#FCA5A5]">{opencodeError}</div>}
            <div ref={opencodeEndRef} />
          </div>
          <div className="border-t border-[#2E2E48] p-2.5 bg-[#181828]">
            <div className="flex gap-2">
              <textarea value={opencodePrompt} onChange={(e)=>setOpencodePrompt(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter' && (e.ctrlKey||e.metaKey)){ e.preventDefault(); runOpencodeCli(); } }} placeholder='Prompt para o Opencode CLI (Ctrl+Enter para enviar). Ex: "edite X para fazer Y"...' className="flex-1 bg-[#0D0D15] text-[#F1F5F9] border-2 border-[#2E2E48] rounded-lg p-2.5 text-xs font-mono min-h-[52px] resize-y focus:outline-none" />
              <button onClick={()=>runOpencodeCli()} disabled={opencodeSending || !opencodePrompt.trim()} className="self-end flex items-center gap-1.5 px-4 py-2.5 bg-[#00A6FB] hover:bg-[#0284c7] disabled:opacity-50 text-white border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-black"><Play className="w-3.5 h-3.5 fill-white"/>Executar</button>
            </div>
          </div>
        </div>
      )}

      {/* CARD: ATUALIZAÇÃO DIRETA DO GIT NO SHELL */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FFC857] text-[#1A1A2E] flex items-center justify-center border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <GitPullRequest className="w-4 h-4 text-[#1A1A2E]" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#1A1A2E] font-title">
                Atualizar Painel Direto do Git no Servidor
              </h3>
              <span className="text-[11px] font-mono text-[#717188] font-bold">
                Script unificado de deploy, build e reload do Nginx
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setAnatomyCommand(GIT_UPDATE_COMMAND)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF7E8] hover:bg-[#FFEECB] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
              title="Aprender detalhadamente cada parte deste script"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#FF5A36]" />
              <span>Dissecar Script</span>
            </button>

            <button
              onClick={() => copyToClipboard(GIT_UPDATE_COMMAND, 'git-update-cmd')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:ring-2 focus-visible:ring-[#1A1A2E]"
              title="Copiar comando completo"
            >
              {copiedId === 'git-update-cmd' ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedId === 'git-update-cmd' ? 'Copiado!' : 'Copiar'}</span>
            </button>

            <button
              onClick={() => requestExecution(GIT_UPDATE_COMMAND)}
              disabled={isExecuting}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#FF5A36] hover:bg-[#E04522] disabled:opacity-50 text-[#1A1A2E] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-black transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
              title="Executar atualização com dupla confirmação"
            >
              <Play className="w-3.5 h-3.5 fill-[#1A1A2E]" />
              <span>Executar Atualização</span>
            </button>
          </div>
        </div>

        {/* Bloco de Código com cursor interativo */}
        <div 
          onClick={() => setAnatomyCommand(GIT_UPDATE_COMMAND)}
          className="p-3 bg-[#FFF7E8] text-[#1A1A2E] rounded-lg border-2 border-[#1A1A2E] font-mono text-xs overflow-x-hidden break-words whitespace-pre-wrap leading-relaxed shadow-inner cursor-pointer hover:border-[#FF5A36] transition relative group"
          title="Clique aqui para abrir o dicionário e aprender a função de cada letra e barra"
        >
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition bg-[#FF5A36] text-[#1A1A2E] text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-[#1A1A2E] shadow">
            Clique para dissecar código
          </div>
          <code>{GIT_UPDATE_COMMAND}</code>
        </div>
      </div>

      {/* TERMINAL CONSOLE WINDOW - REFORMULADO, MAIOR E CONFORTÁVEL */}
      <div 
        className={isFullScreen 
          ? "fixed inset-0 z-50 p-2 sm:p-4 bg-[#1A1A2E]/80 backdrop-blur-sm flex flex-col items-center justify-center motion-reduce:transition-none"
          : "w-full"
        }
      >
        <div 
          className={isFullScreen
            ? "w-full h-full max-w-full bg-[#0D0D15] border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] rounded-xl overflow-hidden flex flex-col font-mono text-[13px] md:text-[14px] leading-relaxed"
            : "w-full h-[60vh] md:h-[70vh] md:min-h-[480px] bg-[#0D0D15] border-2 border-[#1A1A2E] shadow-[5px_5px_0px_#1A1A2E] rounded-xl overflow-hidden flex flex-col font-mono text-[13px] md:text-[14px] leading-relaxed transition-all motion-reduce:transition-none"
          }
        >
          {/* Terminal Titlebar Estilo Janela Escura */}
          <div className="bg-[#181828] px-4 py-3 border-b-2 border-[#1A1A2E] flex items-center justify-between text-[#F1F5F9] shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#F04438] border border-[#1A1A2E]" />
              <span className="w-3 h-3 rounded-full bg-[#FFC857] border border-[#1A1A2E]" />
              <span className="w-3 h-3 rounded-full bg-[#12B76A] border border-[#1A1A2E]" />
              <span className="text-xs md:text-sm font-bold text-[#F1F5F9] ml-2 truncate">
                samuel@samuelserver ({currentCwd})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-bold text-[#94A3B8] hidden sm:inline">
                Bash Interativo Seguro
              </span>

              {/* Botão Expandir / Tela Cheia */}
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-[#222238] hover:bg-[#2F2F4E] border-2 border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] rounded-md text-xs font-mono font-bold text-[#F1F5F9] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
                title={isFullScreen ? "Sair da Tela Cheia (ESC)" : "Expandir Terminal (Tela Cheia)"}
              >
                {isFullScreen ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-[#FF5A36]" />
                    <span>Sair da Tela Cheia (ESC)</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-[#FF5A36]" />
                    <span>Tela Cheia</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Terminal Output Area Preto com rolagem suave */}
          <div className="flex-1 p-4 md:p-5 overflow-y-auto space-y-4 bg-[#0D0D15] text-[#E2E8F0] font-mono text-[13px] md:text-[14px] leading-relaxed">
            {history.length === 0 ? (
              <div className="text-[#94A3B8] py-12 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-[#181828] border-2 border-[#2E2E48] flex items-center justify-center shadow-[2px_2px_0px_#1A1A2E]">
                  <TerminalIcon className="w-6 h-6 text-[#12B76A]" />
                </div>
                <h4 className="text-sm font-bold text-[#F1F5F9]">Terminal preto pronto para execução</h4>
                <p className="text-xs max-w-md mx-auto text-[#94A3B8]">
                  Console shell com dupla confirmação e política de allowlist ativa para proteção do servidor Ubuntu.
                </p>
                <div className="inline-block bg-[#181828] px-3.5 py-1.5 rounded-lg border border-[#2E2E48] text-xs font-mono font-bold text-[#FFC857] shadow-[2px_2px_0px_#1A1A2E]">
                  Dica: Digite <code className="text-[#12B76A]">uptime</code>, <code className="text-[#12B76A]">df -h</code> ou <code className="text-[#12B76A]">free -h</code> e aperte Enter.
                </div>
              </div>
            ) : (
              history.map((entry) => (
                <div key={entry.id} className="space-y-2 border-b border-[#222238] pb-4">
                  {/* Command Prompt Line */}
                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs md:text-sm">
                    <div className="flex items-center gap-2 flex-wrap font-bold">
                      <span className="text-[#12B76A]">➜</span>
                      <span className="text-[#38BDF8]">samuel@samuelserver</span>
                      <span className="text-[#94A3B8]">:</span>
                      <span className="text-[#FFC857]">{entry.result.cwd || '~'}</span>
                      <span className="text-[#12B76A]">$</span>
                      <span 
                        onClick={() => setAnatomyCommand(entry.command)}
                        className="text-[#FFFFFF] font-black hover:text-[#12B76A] hover:underline cursor-pointer break-all"
                        title="Clique para dissecar a anatomia deste comando"
                      >
                        {entry.command}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-[#94A3B8] shrink-0 font-mono">
                      <span>{entry.result.executionTimeMs}ms</span>
                      <span>{entry.timestamp}</span>
                      <button
                        onClick={() => copyToClipboard(entry.result.stdout || entry.result.stderr, entry.id)}
                        className="p-1 hover:text-[#FFFFFF] transition rounded hover:bg-[#181828]"
                        title="Copiar saída do comando"
                      >
                        {copiedId === entry.id ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5 text-[#94A3B8]" />}
                      </button>
                    </div>
                  </div>

                  {/* Output Text - Terminal Preto com texto de alto contraste */}
                  {entry.result.stdout && (
                    <pre className="text-[#E2E8F0] whitespace-pre-wrap break-words leading-relaxed pl-3.5 pr-2 py-2.5 border-l-4 border-[#12B76A] bg-[#121422] rounded-r-md font-mono text-[13px] md:text-[14px] overflow-x-hidden">
                      {entry.result.stdout}
                    </pre>
                  )}

                  {/* Stderr Error Output - Vermelho Legível em fundo escuro */}
                  {entry.result.stderr && (
                    <pre className="text-[#FCA5A5] whitespace-pre-wrap break-words leading-relaxed pl-3.5 pr-2 py-2.5 border-l-4 border-[#F04438] bg-[#2A1518] rounded-r-md font-mono text-[13px] md:text-[14px] font-semibold overflow-x-hidden">
                      {entry.result.stderr}
                    </pre>
                  )}

                  {/* Exit Status Badge */}
                  <div className="flex items-center gap-2 text-xs font-mono font-bold">
                    {entry.result.success ? (
                      <span className="text-[#12B76A] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Exit code: 0 (Sucesso)
                      </span>
                    ) : (
                      <span className="text-[#F87171] flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Exit code: {entry.result.exitCode} (Erro)
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={terminalEndRef} />
          </div>

          {/* Command Input Prompt Bar Escuro - Sempre Visível na Parte Inferior */}
          <div className="bg-[#181828] border-t-2 border-[#1A1A2E] shrink-0">
            {/* Banner de Bloco Multi-Linha Detectado */}
            {commandInput.includes('\n') && (
              <div className="bg-[#121422] px-3.5 py-1.5 border-b border-[#2E2E48] flex items-center justify-between text-xs font-mono text-[#94A3B8]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#12B76A] animate-pulse" />
                  <span className="text-[#F1F5F9] font-bold">Bloco de Comandos:</span>
                  <span className="text-[#38BDF8]">
                    {commandInput.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length} comando(s)
                  </span>
                  <span className="text-[#64748B] hidden sm:inline">({commandInput.split('\n').length} linhas)</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] text-[#94A3B8] hidden sm:inline">
                    Pressione <kbd className="px-1.5 py-0.5 rounded bg-[#222238] text-[#F1F5F9] border border-[#3E3E58] text-[10px]">Ctrl+Enter</kbd> para rodar bloco
                  </span>
                  <button
                    onClick={() => setCommandInput('')}
                    className="text-[#F04438] hover:text-[#FFA5A5] text-[11px] font-bold hover:underline ml-2"
                  >
                    Limpar Bloco
                  </button>
                </div>
              </div>
            )}

            <div className="p-3 md:p-3.5 flex items-start gap-2">
              <div className="flex items-center gap-1 text-[#12B76A] font-black text-sm md:text-base shrink-0 select-none pt-2">
                <span>$</span>
              </div>

              <textarea
                ref={textareaRef}
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isExecuting}
                rows={1}
                placeholder="Digite ou cole comandos bash (ex: uptime, df -h ou cole um bloco de comandos completo)..."
                className="flex-1 bg-[#0D0D15] px-3 py-2 border-2 border-[#2E2E48] rounded-lg text-[#F1F5F9] text-[13px] md:text-[14px] font-mono font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12B76A] shadow-[2px_2px_0px_#1A1A2E] placeholder-[#64748B] resize-none overflow-y-auto leading-relaxed"
              />

              <button
                onClick={() => setAnatomyCommand(commandInput)}
                disabled={!commandInput.trim()}
                className="p-2.5 bg-[#222238] hover:bg-[#2F2F4E] disabled:opacity-30 text-[#F1F5F9] border-2 border-[#1A1A2E] rounded-lg shadow-[2px_2px_0px_#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shrink-0 focus-visible:ring-2 focus-visible:ring-[#FF5A36] mt-0.5"
                title="Aprender sobre o comando antes de rodar"
              >
                <BookOpen className="w-4 h-4 text-[#FFC857]" />
              </button>

              <button
                onClick={() => requestExecution()}
                disabled={isExecuting || !commandInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-[#FF5A36] hover:bg-[#E04522] disabled:opacity-40 disabled:cursor-not-allowed text-[#1A1A2E] text-xs md:text-sm font-mono font-black rounded-lg border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shrink-0 focus-visible:ring-2 focus-visible:ring-[#FF5A36] mt-0.5"
              >
                {isExecuting ? (
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#1A1A2E]" />
                    <span>Rodando...</span>
                  </span>
                ) : commandInput.includes('\n') ? (
                  <span className="flex items-center gap-1.5">
                    <Play className="w-4 h-4 fill-[#1A1A2E]" />
                    <span>Executar Bloco ({commandInput.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length})</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Play className="w-4 h-4 fill-[#1A1A2E]" />
                    <span>Executar</span>
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* QUICK PRESET COMMANDS EM LINHA COM QUEBRA (FLEX-WRAP) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#FF5A36]" />
            <h3 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              Comandos Rápidos do Ubuntu
            </h3>
          </div>
          <span className="text-[11px] font-mono text-[#717188] font-bold">
            Clique no código para aprender sua anatomia ou no botão para executar
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {COMMAND_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <div 
                key={cat.id} 
                className="bg-white border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] rounded-xl p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E] mb-3">
                    <Icon className="w-4 h-4 text-[#FF5A36]" />
                    <span className="text-xs font-bold font-title uppercase tracking-wider text-[#1A1A2E]">
                      {cat.name}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {cat.commands.map((cmd, idx) => (
                      <div 
                        key={cmd.command + idx}
                        className="p-2.5 rounded-lg bg-[#FFF7E8] border border-[#1A1A2E] hover:border-[#FF5A36] transition flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <code 
                            onClick={() => setAnatomyCommand(cmd.command)}
                            className="text-xs font-mono font-bold text-[#1A1A2E] truncate cursor-pointer hover:text-[#FF5A36] hover:underline"
                            title="Clique para dissecar e aprender este comando"
                          >
                            {cmd.command}
                          </code>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => setAnatomyCommand(cmd.command)}
                              className="p-1 rounded bg-white hover:bg-[#FFEECB] text-[#717188] hover:text-[#FF5A36] border border-[#1A1A2E] transition focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
                              title="Anatomia do código"
                            >
                              <BookOpen className="w-3 h-3" />
                            </button>

                            <button
                              onClick={() => requestExecution(cmd.command)}
                              disabled={isExecuting}
                              className="px-2.5 py-1 rounded bg-[#FFC857] hover:bg-[#e6b44e] text-[#1A1A2E] text-[11px] font-mono font-black border border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
                              title="Executar no terminal com dupla confirmação"
                            >
                              Rodar
                            </button>
                          </div>
                        </div>
                        <span className="text-[10px] text-[#717188] leading-tight font-medium">
                          {cmd.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL DE CONFIRMAÇÃO EM DUAS ETAPAS */}
      {confirmStage !== null && pendingCommand && (
        <div className="fixed inset-0 z-50 bg-[#1A1A2E]/70 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#1A1A2E] shadow-[8px_8px_0px_#1A1A2E] rounded-xl max-w-lg w-full p-6 space-y-4 font-sans">
            
            {/* Header da Confirmação */}
            <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E]">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-lg border-2 border-[#1A1A2E] flex items-center justify-center ${
                  confirmStage === 1 ? 'bg-[#FFF7E8] text-[#FF5A36]' : 'bg-[#FEE4E2] text-[#F04438]'
                }`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#1A1A2E] font-title">
                    {confirmStage === 1 
                      ? 'Confirmação 1 de 2: Executar Comando?' 
                      : 'Confirmação 2 de 2: Confirmação Definitiva!'}
                  </h3>
                  <span className="text-[11px] font-mono text-[#717188] font-bold">
                    {confirmStage === 1 
                      ? 'Primeira etapa de verificação de segurança' 
                      : 'O comando será enviado ao terminal do sistema'}
                  </span>
                </div>
              </div>

              <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${
                confirmStage === 1 
                  ? 'bg-[#FFF7E8] border-[#FFC857] text-[#1A1A2E]' 
                  : 'bg-[#FEE4E2] border-[#F04438] text-[#F04438]'
              }`}>
                Etapa {confirmStage}/2
              </span>
            </div>

            {/* Comando a ser executado */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-[#717188] font-bold">
                  Comando que será executado:
                </span>
                {pendingCommand.includes('\n') && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#ECFDF3] border border-[#12B76A] text-[#12B76A]">
                    Bloco com {pendingCommand.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length} comandos ativos ({pendingCommand.split('\n').length} linhas)
                  </span>
                )}
              </div>
              <div className="p-3 bg-[#FFF7E8] text-[#1A1A2E] rounded-lg border-2 border-[#1A1A2E] font-mono text-xs overflow-x-hidden break-words whitespace-pre-wrap max-h-48 overflow-y-auto shadow-inner leading-relaxed">
                {pendingCommand}
              </div>
            </div>

            {/* Mensagem da etapa */}
            {confirmStage === 1 ? (
              <p className="text-xs text-[#4A4A68] leading-relaxed">
                Você solicitou a execução deste comando no servidor Ubuntu. Para evitar execuções acidentais, clique abaixo para avançar para a confirmação final.
              </p>
            ) : (
              <div className="p-3 rounded-lg bg-[#FEF3F2] border border-[#F04438] text-xs text-[#B42318] space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-[#F04438]" />
                  Atenção: Ação real no sistema operacional!
                </div>
                <p>
                  Esta é a confirmação final. Tem certeza absoluta que deseja prosseguir e disparar o processo no shell?
                </p>
              </div>
            )}

            {/* Ações */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t-2 border-[#1A1A2E]">
              <button
                onClick={handleCancelExecution}
                className="px-4 py-2 bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:ring-2 focus-visible:ring-[#1A1A2E]"
              >
                Cancelar
              </button>

              {confirmStage === 1 ? (
                <button
                  onClick={handleProceedToStage2}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#FFC857] hover:bg-[#e6b44e] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-black text-[#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
                >
                  <span>Avançar para Etapa 2</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={handleConfirmedExecution}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#F04438] hover:bg-[#D92D20] text-[#1A1A2E] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-black transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:ring-2 focus-visible:ring-[#F04438]"
                >
                  <Play className="w-3.5 h-3.5 fill-[#1A1A2E]" />
                  <span>Sim, Executar Definitivamente</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ANATOMIA DO CÓDIGO */}
      {anatomyCommand && (
        <CommandAnatomyModal
          command={anatomyCommand}
          onClose={() => setAnatomyCommand(null)}
          onExecuteNow={() => requestExecution(anatomyCommand)}
        />
      )}
    </div>
  );
};

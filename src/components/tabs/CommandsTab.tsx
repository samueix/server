import React, { useState, useRef, useEffect } from 'react';
import { 
  Terminal as TerminalIcon, 
  Play, 
  RotateCcw, 
  Copy, 
  Check, 
  Trash2, 
  CornerDownLeft, 
  Search, 
  Server, 
  Shield, 
  Network, 
  HardDrive, 
  Cpu, 
  FileText, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { executeTerminalCommand, TerminalExecResponse } from '../../services/terminalService';

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
    name: 'Sistema',
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
    name: 'Armazenamento',
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
  const [searchCategory, setSearchCategory] = useState<string>('todos');

  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Execução do comando no shell do Ubuntu
  const handleExecute = async (cmdToRun?: string) => {
    const targetCommand = (cmdToRun || commandInput).trim();
    if (!targetCommand || isExecuting) return;

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

      setHistory(prev => [...prev, newEntry]);
      if (!cmdToRun) {
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
      setHistory(prev => [...prev, failEntry]);
    } finally {
      setIsExecuting(false);
      setTimeout(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleExecute();
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
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#1A1A2E] text-white flex items-center justify-center shadow-[2px_2px_0px_#1A1A2E] shrink-0">
            <TerminalIcon className="w-6 h-6 text-[#12B76A]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-[#1A1A2E] font-title">Terminal & Shell Interativo</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#ECFDF3] border border-[#12B76A] text-[#12B76A]">
                <span className="w-2 h-2 rounded-full bg-[#12B76A]" />
                Bash Ativo
              </span>
            </div>
            <p className="text-xs text-[#4A4A68] font-medium mt-0.5">
              Execute comandos diretamente no shell do Ubuntu Server e acompanhe o retorno do terminal em tempo real.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={clearTerminal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF7E8] hover:bg-[#FEE4E2] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            title="Limpar saídas do terminal"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#F04438]" />
            <span>Limpar Console</span>
          </button>
        </div>
      </div>

      {/* TERMINAL CONSOLE WINDOW */}
      <div className="bg-[#1A1A2E] border-2 border-[#1A1A2E] shadow-[5px_5px_0px_#1A1A2E] rounded-xl overflow-hidden flex flex-col font-mono text-xs">
        {/* Terminal Titlebar */}
        <div className="bg-[#131322] px-4 py-2.5 border-b border-[#2D2D42] flex items-center justify-between text-[#A0A0B8]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#F04438] border border-black/40" />
            <span className="w-3 h-3 rounded-full bg-[#FFC857] border border-black/40" />
            <span className="w-3 h-3 rounded-full bg-[#12B76A] border border-black/40" />
            <span className="text-[11px] font-bold text-white ml-2">bash - samuel@samuelserver ({currentCwd})</span>
          </div>

          <span className="text-[10px] text-[#A0A0B8]">Saída em tempo real</span>
        </div>

        {/* Terminal Output Area */}
        <div className="p-4 overflow-y-auto max-h-[460px] min-h-[220px] space-y-4 text-white">
          {history.length === 0 ? (
            <div className="text-[#A0A0B8] py-8 text-center space-y-2">
              <TerminalIcon className="w-8 h-8 mx-auto text-[#12B76A] stroke-[1.5]" />
              <p className="text-xs">Console pronto para execução. Digite um comando ou clique em um dos atalhos rápidos abaixo.</p>
              <div className="inline-block bg-[#131322] px-3 py-1 rounded border border-[#2D2D42] text-[11px] text-[#FFC857]">
                Dica: Digite <code className="font-bold text-white">uptime</code>, <code className="font-bold text-white">df -h</code> ou <code className="font-bold text-white">free -h</code> e aperte Enter.
              </div>
            </div>
          ) : (
            history.map((entry) => (
              <div key={entry.id} className="space-y-1.5 border-b border-[#2D2D42]/60 pb-3">
                {/* Command Prompt Line */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-[#12B76A] font-bold">
                    <span>➜</span>
                    <span className="text-[#00A6FB]">samuel@samuelserver</span>
                    <span className="text-white">:</span>
                    <span className="text-[#FFC857]">{entry.result.cwd || '~'}</span>
                    <span className="text-white">$</span>
                    <span className="text-white font-black">{entry.command}</span>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-[#A0A0B8]">
                    <span>{entry.result.executionTimeMs}ms</span>
                    <span>{entry.timestamp}</span>
                    <button
                      onClick={() => copyToClipboard(entry.result.stdout || entry.result.stderr, entry.id)}
                      className="p-1 hover:text-white transition"
                      title="Copiar saída"
                    >
                      {copiedId === entry.id ? <Check className="w-3 h-3 text-[#12B76A]" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {/* Output Text */}
                {entry.result.stdout && (
                  <pre className="text-[#E0E0EC] whitespace-pre-wrap break-all leading-relaxed pl-4 border-l-2 border-[#12B76A]/40 bg-[#131322]/50 p-2 rounded">
                    {entry.result.stdout}
                  </pre>
                )}

                {/* Stderr Error Output */}
                {entry.result.stderr && (
                  <pre className="text-[#F04438] whitespace-pre-wrap break-all leading-relaxed pl-4 border-l-2 border-[#F04438]/50 bg-[#F04438]/10 p-2 rounded">
                    {entry.result.stderr}
                  </pre>
                )}

                {/* Exit Status Badge */}
                <div className="flex items-center gap-2 text-[10px]">
                  {entry.result.success ? (
                    <span className="text-[#12B76A] flex items-center gap-1 font-bold">
                      <CheckCircle2 className="w-3 h-3" />
                      Exit code: 0 (Sucesso)
                    </span>
                  ) : (
                    <span className="text-[#F04438] flex items-center gap-1 font-bold">
                      <AlertCircle className="w-3 h-3" />
                      Exit code: {entry.result.exitCode} (Erro)
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Command Input Prompt Bar */}
        <div className="bg-[#131322] p-3 border-t border-[#2D2D42] flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[#12B76A] font-bold text-xs shrink-0">
            <span>$</span>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isExecuting}
            placeholder="Digite qualquer comando bash (ex: df -h, ip a, systemctl status...)"
            className="flex-1 bg-transparent border-none text-white text-xs font-mono font-bold focus:outline-none placeholder-[#717188]"
          />

          <button
            onClick={() => handleExecute()}
            disabled={isExecuting || !commandInput.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF5A36] hover:bg-[#e04826] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono font-bold rounded-lg border border-[#1A1A2E] shadow-[2px_2px_0px_black] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shrink-0"
          >
            {isExecuting ? (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                <span>Rodando...</span>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Executar</span>
              </span>
            )}
          </button>
        </div>
      </div>

      {/* QUICK PRESET COMMANDS (Atalhos rápidos com 1 clique para executar no shell) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#FF5A36]" />
            <h3 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              Comandos Rápidos do Ubuntu
            </h3>
          </div>
          <span className="text-[11px] font-mono text-[#717188] font-bold">
            Clique para rodar instantaneamente no terminal
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
                        className="p-2 rounded-lg bg-[#FFF7E8] border border-[#1A1A2E] hover:border-[#FF5A36] transition flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <code className="text-xs font-mono font-bold text-[#1A1A2E] truncate">
                            {cmd.command}
                          </code>

                          <button
                            onClick={() => handleExecute(cmd.command)}
                            disabled={isExecuting}
                            className="px-2 py-0.5 rounded bg-[#FF5A36] hover:bg-[#e04826] text-white text-[11px] font-mono font-bold border border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shrink-0"
                            title="Executar no terminal"
                          >
                            Rodar
                          </button>
                        </div>
                        <span className="text-[10px] text-[#717188] leading-tight">
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
    </div>
  );
};

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  ScrollText, 
  RefreshCw, 
  Play, 
  Pause, 
  Search, 
  Download, 
  Copy, 
  Check, 
  Trash2, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  Terminal, 
  Server, 
  Shield, 
  Cpu, 
  FileText, 
  Radio, 
  ArrowDownCircle, 
  SlidersHorizontal 
} from 'lucide-react';
import { fetchSystemLogs, LogSource } from '../../services/logsService';
import { SystemLogsResponse, SystemLogEntry } from '../../types';

interface SourceOption {
  id: LogSource;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  color: string;
}

const SOURCES: SourceOption[] = [
  {
    id: 'syslog',
    label: '/var/log/syslog',
    sublabel: 'Syslog Geral do Ubuntu',
    icon: FileText,
    color: 'emerald'
  },
  {
    id: 'agent',
    label: 'server-monitor',
    sublabel: 'Agente Python :8000',
    icon: Cpu,
    color: 'blue'
  },
  {
    id: 'panel',
    label: 'adguard-ai',
    sublabel: 'Painel Node.js :3000',
    icon: Terminal,
    color: 'violet'
  },
  {
    id: 'adguard',
    label: 'AdGuardHome',
    sublabel: 'DNS & Bloqueios :8081',
    icon: Shield,
    color: 'cyan'
  },
  {
    id: 'auth',
    label: '/var/log/auth.log',
    sublabel: 'Sudo, SSH & Sessões',
    icon: Server,
    color: 'amber'
  },
  {
    id: 'dmesg',
    label: 'dmesg',
    sublabel: 'Kernel & Hardware',
    icon: Radio,
    color: 'rose'
  }
];

export const LogsTab: React.FC = () => {
  const [selectedSource, setSelectedSource] = useState<LogSource>('syslog');
  const [lineCount, setLineCount] = useState<number>(50);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  
  // Streaming em tempo real
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [streamInterval, setStreamInterval] = useState<number>(2000); // 2 segundos padrão
  
  const [logsData, setLogsData] = useState<SystemLogsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  // Carrega os logs
  const loadLogs = useCallback(async (isManual = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (isManual) {
      setIsRefreshing(true);
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const data = await fetchSystemLogs(
        selectedSource,
        lineCount,
        '',
        abortControllerRef.current.signal
      );
      setLogsData(data);
      setErrorMessage(null);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMessage(err.message || 'Erro ao obter logs');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      isFetchingRef.current = false;
    }
  }, [selectedSource, lineCount]);

  const [secondsAgo, setSecondsAgo] = useState<number>(0);

  useEffect(() => {
    setSecondsAgo(0);
    const interval = setInterval(() => {
      setSecondsAgo(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [logsData]);

  // Carrega ao mudar fonte ou quantidade de linhas
  useEffect(() => {
    setIsLoading(true);
    loadLogs();
  }, [loadLogs]);

  // Timer para streaming em tempo real com pausa em document.hidden e retomada imediata
  useEffect(() => {
    if (!isStreaming) return;

    const timer = setInterval(() => {
      if (!document.hidden) {
        loadLogs();
      }
    }, streamInterval);

    const handleVisibility = () => {
      if (!document.hidden) {
        loadLogs();
      } else if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isStreaming, streamInterval, loadLogs]);

  // Auto-scroll contido exclusivamente dentro do container do terminal (sem rolar a página inteira)
  useEffect(() => {
    if (autoScroll && terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [logsData, autoScroll]);

  // Filtra logs localmente para máxima responsividade
  const filteredLogs = useMemo(() => {
    if (!logsData || !logsData.logs) return [];

    return logsData.logs.filter(entry => {
      // Filtro de nível
      if (levelFilter !== 'all' && entry.level !== levelFilter) {
        return false;
      }

      // Filtro de texto de busca
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const raw = entry.raw.toLowerCase();
        const msg = entry.message.toLowerCase();
        const proc = (entry.process || '').toLowerCase();
        return raw.includes(query) || msg.includes(query) || proc.includes(query);
      }

      return true;
    });
  }, [logsData, levelFilter, searchTerm]);

  // Contadores de estatísticas rápidas
  const stats = useMemo(() => {
    if (!logsData || !logsData.logs) return { total: 0, errors: 0, warns: 0, infos: 0 };
    let errors = 0;
    let warns = 0;
    let infos = 0;
    for (const log of logsData.logs) {
      if (log.level === 'error') errors++;
      else if (log.level === 'warn') warns++;
      else infos++;
    }
    return {
      total: logsData.logs.length,
      errors,
      warns,
      infos
    };
  }, [logsData]);

  // Copia logs para área de transferência
  const handleCopyLogs = () => {
    if (!filteredLogs.length) return;
    const text = filteredLogs.map(l => l.raw).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Faz download do arquivo de log formatado
  const handleDownloadLog = () => {
    if (!filteredLogs.length) return;
    const text = filteredLogs.map(l => l.raw).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedSource}-${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Limpa a tela localmente
  const handleClearView = () => {
    if (logsData) {
      setLogsData({
        ...logsData,
        logs: [],
        raw_lines: []
      });
    }
  };

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* Top Banner & Header */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-[#FF5A36]/15 border-2 border-[#1A1A2E] flex items-center justify-center text-[#FF5A36] shrink-0">
            <ScrollText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-black text-[#1A1A2E] font-title">Logs de Sistema em Tempo Real</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#D1FADF] border border-[#12B76A] text-[#12B76A]">
                <span className="w-2 h-2 rounded-full bg-[#12B76A]" />
                Root / Administrador
              </span>
            </div>
            <p className="text-xs text-[#4A4A68] font-medium mt-1">
              Visualização contínua das últimas {lineCount} linhas de <code className="text-[#1A1A2E] bg-[#FFF7E8] px-1.5 py-0.5 rounded border border-[#1A1A2E] font-mono font-bold">/var/log/syslog</code>, daemons do Ubuntu e serviços systemd.
            </p>
          </div>
        </div>

        {/* Live Controls */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto justify-end">
          <div className="flex items-center gap-2">
            {Boolean(errorMessage) && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FEF0C7] text-[#B54708] border border-[#F79009]">
                Dado em cache / desatualizado
              </span>
            )}
            <span className="text-[#FF5A36] font-bold font-mono text-[11px] bg-[#FFF7E8] px-2 py-0.5 rounded border border-[#1A1A2E]/20" aria-live="polite">
              Atualizado há {secondsAgo}s
            </span>
          </div>

          {/* Streaming Toggle */}
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono font-bold transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
              isStreaming
                ? 'bg-[#12B76A] text-white'
                : 'bg-[#FFF7E8] text-[#4A4A68] hover:text-[#1A1A2E]'
            }`}
            title={isStreaming ? 'Pausar streaming ao vivo' : 'Iniciar streaming ao vivo'}
          >
            {isStreaming ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Streaming Ativo ({streamInterval / 1000}s)</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-[#1A1A2E]" />
                <span>Streaming Pausado</span>
              </>
            )}
          </button>

          {/* Refresh manual */}
          <button
            onClick={() => loadLogs(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#FF5A36] hover:bg-[#e04826] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-white transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
            title="Atualizar logs agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Sources Selector Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {SOURCES.map((src) => {
          const Icon = src.icon;
          const isSelected = selectedSource === src.id;

          return (
            <button
              key={src.id}
              onClick={() => setSelectedSource(src.id)}
              className={`p-3.5 rounded-xl border-2 border-[#1A1A2E] text-left transition shadow-[2px_2px_0px_#1A1A2E] flex flex-col justify-between ${
                isSelected
                  ? 'bg-[#FF5A36] text-white'
                  : 'bg-white hover:bg-[#FFF7E8] text-[#1A1A2E]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-[#717188]'}`} />
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-white shadow-sm" />
                )}
              </div>
              <div>
                <div className={`text-xs font-black font-mono truncate ${isSelected ? 'text-white' : 'text-[#1A1A2E]'}`}>
                  {src.label}
                </div>
                <div className={`text-[10px] mt-0.5 truncate font-medium ${isSelected ? 'text-white/80' : 'text-[#717188]'}`}>
                  {src.sublabel}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Stats and Filter Bar */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#717188]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar mensagens, processos, PIDs, erros..."
            className="w-full pl-9 pr-7 py-2 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-[#1A1A2E] placeholder-[#717188] text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#FF5A36] font-mono transition shadow-[2px_2px_0px_#1A1A2E]"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#717188] hover:text-[#1A1A2E] text-xs font-bold px-1"
            >
              ×
            </button>
          )}
        </div>

        {/* Level Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setLevelFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] ${
              levelFilter === 'all'
                ? 'bg-[#1A1A2E] text-white'
                : 'bg-[#FFF7E8] text-[#4A4A68] hover:text-[#1A1A2E]'
            }`}
          >
            Todos ({stats.total})
          </button>
          <button
            onClick={() => setLevelFilter('error')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] ${
              levelFilter === 'error'
                ? 'bg-[#F04438] text-white'
                : 'bg-[#FEE4E2] text-[#F04438] hover:bg-[#FECDCA]'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Erros ({stats.errors})</span>
          </button>
          <button
            onClick={() => setLevelFilter('warn')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] ${
              levelFilter === 'warn'
                ? 'bg-[#F79009] text-white'
                : 'bg-[#FEF0C7] text-[#B54708] hover:bg-[#FEDF89]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Avisos ({stats.warns})</span>
          </button>
          <button
            onClick={() => setLevelFilter('info')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] ${
              levelFilter === 'info'
                ? 'bg-[#00A6FB] text-white'
                : 'bg-[#E0F2FE] text-[#026AA2] hover:bg-[#B9E6FE]'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Info ({stats.infos})</span>
          </button>
        </div>

        {/* Line Count Selector & Speed Selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg px-2 py-1">
            <span className="text-[11px] text-[#4A4A68] font-bold font-sans">Linhas:</span>
            {[50, 100, 200].map((num) => (
              <button
                key={num}
                onClick={() => setLineCount(num)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition ${
                  lineCount === num
                    ? 'bg-[#1A1A2E] text-white'
                    : 'text-[#4A4A68] hover:text-[#1A1A2E]'
                }`}
              >
                {num}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg px-2 py-1">
            <span className="text-[11px] text-[#4A4A68] font-bold font-sans">Taxa:</span>
            {[1000, 2000, 5000].map((ms) => (
              <button
                key={ms}
                onClick={() => {
                  setStreamInterval(ms);
                  setIsStreaming(true);
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition ${
                  streamInterval === ms && isStreaming
                    ? 'bg-[#00A6FB] text-white'
                    : 'text-[#4A4A68] hover:text-[#1A1A2E]'
                }`}
              >
                {ms / 1000}s
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Terminal Console View */}
      <div className="bg-white border-2 border-[#1A1A2E] rounded-xl overflow-hidden shadow-[4px_4px_0px_#1A1A2E]">
        {/* Terminal Header */}
        <div className="bg-[#FFF7E8] border-b-2 border-[#1A1A2E] px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#F04438] border border-[#1A1A2E]" />
              <div className="w-3 h-3 rounded-full bg-[#FFC857] border border-[#1A1A2E]" />
              <div className="w-3 h-3 rounded-full bg-[#12B76A] border border-[#1A1A2E]" />
            </div>
            <span className="text-[#1A1A2E] text-xs ml-2 font-bold">|</span>
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#1A1A2E]">
              <Terminal className="w-3.5 h-3.5 text-[#FF5A36]" />
              <span>{logsData?.source_path || selectedSource}</span>
              {logsData?.file_exists && (
                <span className="text-[10px] text-[#12B76A] bg-[#D1FADF] px-1.5 py-0.5 rounded border border-[#12B76A]">
                  arquivo nativo
                </span>
              )}
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] ${
                autoScroll
                  ? 'bg-[#00A6FB] text-white'
                  : 'bg-white text-[#4A4A68] hover:text-[#1A1A2E]'
              }`}
              title="Rolar automaticamente para novas linhas"
            >
              <ArrowDownCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Auto-scroll</span>
            </button>

            {/* Copy button */}
            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-[#FFEECB] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-md text-[11px] font-mono font-bold text-[#1A1A2E] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              title="Copiar logs exibidos"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#12B76A]" />
                  <span className="text-[#12B76A]">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#1A1A2E]" />
                  <span className="hidden sm:inline">Copiar</span>
                </>
              )}
            </button>

            {/* Download button */}
            <button
              onClick={handleDownloadLog}
              className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-[#FFEECB] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-md text-[11px] font-mono font-bold text-[#1A1A2E] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              title="Baixar arquivo de log (.log)"
            >
              <Download className="w-3.5 h-3.5 text-[#1A1A2E]" />
              <span className="hidden sm:inline">Baixar</span>
            </button>

            {/* Clear View button */}
            <button
              onClick={handleClearView}
              className="p-1 hover:bg-[#FEE4E2] text-[#F04438] border-2 border-[#1A1A2E] rounded-md transition"
              title="Limpar tela"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 bg-[#FEF3F2] border-b-2 border-[#F04438] text-[#F04438] text-xs flex items-center justify-between font-bold">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#F04438] shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => loadLogs(true)}
              className="text-xs text-[#F04438] underline hover:text-[#B42318]"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Terminal Body */}
        <div ref={terminalContainerRef} className="p-4 overflow-y-auto overflow-x-auto max-h-[560px] min-h-[380px] font-mono text-xs leading-relaxed selection:bg-[#FFEECB] bg-white text-[#1A1A2E]">
          {isLoading && !logsData ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#717188] gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-[#FF5A36]" />
              <span className="font-bold">Conectando ao daemon de logs do Ubuntu ({selectedSource})...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#717188] gap-2">
              <SlidersHorizontal className="w-6 h-6 text-[#717188]" />
              <span className="text-[#1A1A2E] font-black font-title">Nenhum registro encontrado</span>
              {searchTerm && (
                <span className="text-xs text-[#717188]">
                  Nenhuma linha corresponde ao termo de busca "{searchTerm}".
                </span>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredLogs.map((entry, idx) => {
                const lineNum = idx + 1;
                const isError = entry.level === 'error';
                const isWarn = entry.level === 'warn';

                return (
                  <div
                    key={entry.id || idx}
                    className={`group flex items-start gap-3 py-1 px-2.5 rounded-md transition-colors ${
                      isError
                        ? 'bg-[#FEF3F2] border-l-4 border-[#F04438] text-[#B42318]'
                        : isWarn
                        ? 'bg-[#FEF0C7] border-l-4 border-[#F79009] text-[#B54708]'
                        : 'hover:bg-[#FFF7E8] text-[#1A1A2E]'
                    }`}
                  >
                    {/* Line Number */}
                    <span className="w-8 shrink-0 text-right select-none text-[11px] text-[#717188] group-hover:text-[#1A1A2E] font-mono font-bold">
                      {lineNum}
                    </span>

                    {/* Timestamp */}
                    {entry.timestamp && (
                      <span className="text-[#717188] font-bold shrink-0 select-none text-[11px]">
                        {entry.timestamp}
                      </span>
                    )}

                    {/* Host & Process if parsed */}
                    {entry.process && (
                      <span className="text-[#00A6FB] font-bold shrink-0 select-none text-[11px]">
                        {entry.process}
                        {entry.pid && <span className="text-[#FF5A36] font-normal">[{entry.pid}]</span>}:
                      </span>
                    )}

                    {/* Message / Raw text */}
                    <span className="break-all whitespace-pre-wrap flex-1 font-medium">
                      {entry.message}
                    </span>
                  </div>
                );
              })}
              <div ref={terminalEndRef} />
            </div>
          )}
        </div>

        {/* Terminal Footer */}
        <div className="bg-[#FFF7E8] border-t-2 border-[#1A1A2E] px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between text-[11px] text-[#4A4A68] font-mono font-bold gap-2">
          <div className="flex items-center gap-3">
            <span>Total retornado: <strong className="text-[#1A1A2E]">{filteredLogs.length}</strong> de {logsData?.total_lines || 0}</span>
            <span>•</span>
            <span>Última leitura: <span className="text-[#1A1A2E]">{logsData?.last_updated || '--:--:--'}</span></span>
          </div>

          <div className="flex items-center gap-3 text-[#4A4A68]">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-[#12B76A]' : 'bg-[#717188]'}`} />
              {isStreaming ? `Tempo real (${streamInterval / 1000}s)` : 'Pausado'}
            </span>
            <span>•</span>
            <span className="text-[#1A1A2E]">Ubuntu Server 24.04 LTS</span>
          </div>
        </div>
      </div>
    </div>
  );
};

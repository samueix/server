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
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

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

  // Carrega ao mudar fonte ou quantidade de linhas
  useEffect(() => {
    setIsLoading(true);
    loadLogs();
  }, [loadLogs]);

  // Timer para streaming em tempo real
  useEffect(() => {
    if (!isStreaming) return;

    const timer = setInterval(() => {
      loadLogs();
    }, streamInterval);

    return () => clearInterval(timer);
  }, [isStreaming, streamInterval, loadLogs]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
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
    <div className="space-y-4">
      {/* Top Banner & Header */}
      <div className="bg-[#0b1222]/80 border border-white/10 rounded-2xl p-5 backdrop-blur-xl shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-blue-500/20 to-indigo-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <ScrollText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-white tracking-tight">Logs de Sistema em Tempo Real</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 border border-emerald-600/40 text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Root / Administrador
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Visualização contínua das últimas {lineCount} linhas de <code className="text-emerald-300 bg-black/40 px-1 py-0.5 rounded font-mono">/var/log/syslog</code>, daemons do Ubuntu e serviços systemd.
            </p>
          </div>
        </div>

        {/* Live Controls */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto justify-end">
          {/* Streaming Toggle */}
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition border ${
              isStreaming
                ? 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border-slate-700'
            }`}
            title={isStreaming ? 'Pausar streaming ao vivo' : 'Iniciar streaming ao vivo'}
          >
            {isStreaming ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <Pause className="w-3.5 h-3.5" />
                <span>Streaming Ativo ({streamInterval / 1000}s)</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-slate-400" />
                <span>Streaming Pausado</span>
              </>
            )}
          </button>

          {/* Refresh manual */}
          <button
            onClick={() => loadLogs(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-200 transition disabled:opacity-50"
            title="Atualizar logs agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Sources Selector Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {SOURCES.map((src) => {
          const Icon = src.icon;
          const isSelected = selectedSource === src.id;

          return (
            <button
              key={src.id}
              onClick={() => setSelectedSource(src.id)}
              className={`p-3 rounded-xl border text-left transition-all duration-150 flex flex-col justify-between ${
                isSelected
                  ? 'bg-emerald-500/15 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30'
                  : 'bg-[#0f172a]/60 hover:bg-[#0f172a] border-white/5 hover:border-white/15 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-4 h-4 ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`} />
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                )}
              </div>
              <div>
                <div className={`text-xs font-semibold font-mono truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                  {src.label}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                  {src.sublabel}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Stats and Filter Bar */}
      <div className="bg-[#0b1222]/80 border border-white/10 rounded-2xl p-4 backdrop-blur-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar mensagens, processos, PIDs, erros..."
            className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500/60 font-mono transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs px-1"
            >
              ×
            </button>
          )}
        </div>

        {/* Level Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setLevelFilter('all')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
              levelFilter === 'all'
                ? 'bg-slate-700 text-white font-semibold'
                : 'bg-black/30 hover:bg-black/50 text-slate-400 border border-white/5'
            }`}
          >
            Todos ({stats.total})
          </button>
          <button
            onClick={() => setLevelFilter('error')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition ${
              levelFilter === 'error'
                ? 'bg-rose-950/80 border border-rose-600/60 text-rose-300 font-semibold shadow-sm'
                : 'bg-black/30 hover:bg-rose-950/40 text-rose-400/80 border border-white/5'
            }`}
          >
            <AlertCircle className="w-3 h-3 text-rose-400" />
            <span>Erros ({stats.errors})</span>
          </button>
          <button
            onClick={() => setLevelFilter('warn')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition ${
              levelFilter === 'warn'
                ? 'bg-amber-950/80 border border-amber-600/60 text-amber-300 font-semibold shadow-sm'
                : 'bg-black/30 hover:bg-amber-950/40 text-amber-400/80 border border-white/5'
            }`}
          >
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>Avisos ({stats.warns})</span>
          </button>
          <button
            onClick={() => setLevelFilter('info')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition ${
              levelFilter === 'info'
                ? 'bg-blue-950/80 border border-blue-600/60 text-blue-300 font-semibold shadow-sm'
                : 'bg-black/30 hover:bg-blue-950/40 text-blue-400/80 border border-white/5'
            }`}
          >
            <Info className="w-3 h-3 text-blue-400" />
            <span>Info ({stats.infos})</span>
          </button>
        </div>

        {/* Line Count Selector & Speed Selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl px-2 py-1">
            <span className="text-[11px] text-slate-400 font-sans">Linhas:</span>
            {[50, 100, 200].map((num) => (
              <button
                key={num}
                onClick={() => setLineCount(num)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition ${
                  lineCount === num
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {num}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl px-2 py-1">
            <span className="text-[11px] text-slate-400 font-sans">Taxa:</span>
            {[1000, 2000, 5000].map((ms) => (
              <button
                key={ms}
                onClick={() => {
                  setStreamInterval(ms);
                  setIsStreaming(true);
                }}
                className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition ${
                  streamInterval === ms && isStreaming
                    ? 'bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {ms / 1000}s
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Terminal Console View */}
      <div className="bg-[#050811] border border-white/15 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-2xl">
        {/* Terminal macOS-style Window Header */}
        <div className="bg-[#0a0f1d] border-b border-white/10 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-rose-500/80 border border-rose-600/40" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-600/40" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-600/40" />
            </div>
            <span className="text-slate-500 text-xs ml-2">|</span>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>{logsData?.source_path || selectedSource}</span>
              {logsData?.file_exists && (
                <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/40">
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
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono transition border ${
                autoScroll
                  ? 'bg-blue-950/60 border-blue-500/40 text-blue-300'
                  : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
              }`}
              title="Rolar automaticamente para novas linhas"
            >
              <ArrowDownCircle className={`w-3.5 h-3.5 ${autoScroll ? 'text-blue-400' : ''}`} />
              <span className="hidden sm:inline">Auto-scroll</span>
            </button>

            {/* Copy button */}
            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-1 px-2.5 py-1 bg-black/40 hover:bg-slate-800 border border-white/10 hover:border-white/20 rounded-lg text-[11px] font-mono text-slate-300 transition"
              title="Copiar logs exibidos"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span className="hidden sm:inline">Copiar</span>
                </>
              )}
            </button>

            {/* Download button */}
            <button
              onClick={handleDownloadLog}
              className="flex items-center gap-1 px-2.5 py-1 bg-black/40 hover:bg-slate-800 border border-white/10 hover:border-white/20 rounded-lg text-[11px] font-mono text-slate-300 transition"
              title="Baixar arquivo de log (.log)"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Baixar</span>
            </button>

            {/* Clear View button */}
            <button
              onClick={handleClearView}
              className="p-1 hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 rounded-lg transition"
              title="Limpar tela"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 bg-rose-950/40 border-b border-rose-800/60 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => loadLogs(true)}
              className="text-xs text-rose-200 underline hover:text-white"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Terminal Body */}
        <div className="p-4 overflow-x-auto max-h-[560px] min-h-[380px] font-mono text-xs leading-relaxed selection:bg-emerald-500/30 selection:text-white">
          {isLoading && !logsData ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
              <span>Conectando ao daemon de logs do Ubuntu ({selectedSource})...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
              <SlidersHorizontal className="w-6 h-6 text-slate-600" />
              <span className="text-slate-400 font-medium">Nenhum registro encontrado</span>
              {searchTerm && (
                <span className="text-xs text-slate-600">
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
                    className={`group flex items-start gap-3 py-0.5 px-2 rounded-lg transition-colors ${
                      isError
                        ? 'bg-rose-950/40 border-l-2 border-rose-500 text-rose-200'
                        : isWarn
                        ? 'bg-amber-950/30 border-l-2 border-amber-500 text-amber-200'
                        : 'hover:bg-white/[0.03] text-slate-300'
                    }`}
                  >
                    {/* Line Number */}
                    <span className="w-8 shrink-0 text-right select-none text-[11px] text-slate-600 group-hover:text-slate-400 font-mono">
                      {lineNum}
                    </span>

                    {/* Timestamp */}
                    {entry.timestamp && (
                      <span className="text-slate-500 shrink-0 select-none text-[11px]">
                        {entry.timestamp}
                      </span>
                    )}

                    {/* Host & Process if parsed */}
                    {entry.process && (
                      <span className="text-cyan-400 font-semibold shrink-0 select-none text-[11px]">
                        {entry.process}
                        {entry.pid && <span className="text-purple-400 font-normal">[{entry.pid}]</span>}:
                      </span>
                    )}

                    {/* Message / Raw text */}
                    <span className="break-all whitespace-pre-wrap flex-1">
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
        <div className="bg-[#080d19] border-t border-white/10 px-4 py-2 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 font-mono gap-2">
          <div className="flex items-center gap-3">
            <span>Total retornado: <strong className="text-slate-300">{filteredLogs.length}</strong> de {logsData?.total_lines || 0}</span>
            <span>•</span>
            <span>Última leitura: <span className="text-slate-300">{logsData?.last_updated || '--:--:--'}</span></span>
          </div>

          <div className="flex items-center gap-3 text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {isStreaming ? `Tempo real (${streamInterval / 1000}s)` : 'Pausado'}
            </span>
            <span>•</span>
            <span className="text-slate-400">Ubuntu Server 24.04 LTS</span>
          </div>
        </div>
      </div>
    </div>
  );
};

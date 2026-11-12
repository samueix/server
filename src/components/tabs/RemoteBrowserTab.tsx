import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Monitor,
  Play,
  Square,
  Pause,
  Camera,
  ArrowRight,
  RefreshCw,
  Globe,
  History,
  AlertTriangle,
  Circle,
  Keyboard,
  MousePointer2,
  ShieldAlert,
  Loader2
} from 'lucide-react';
import { getStoredAuth } from '../../services/authService';
import {
  browserApi,
  type BrowserHistoryEntry,
  type BrowserState
} from '../../services/browserApi';

const EMPTY_STATE: BrowserState = {
  status: 'stopped',
  url: '',
  title: '',
  startedAt: null,
  lastActionAt: null,
  viewport: { width: 1280, height: 720 },
  clients: 0,
  paused: false,
  fps: 0,
  error: null
};

function statusLabel(state: BrowserState): string {
  switch (state.status) {
    case 'starting':
      return 'Iniciando';
    case 'running':
      return 'Em execução';
    case 'paused':
      return 'Pausado';
    case 'error':
      return 'Erro';
    default:
      return 'Parado';
  }
}

function statusColor(state: BrowserState): string {
  switch (state.status) {
    case 'running':
      return 'text-[#12B76A]';
    case 'starting':
      return 'text-[#F79009]';
    case 'paused':
      return 'text-[#F79009]';
    case 'error':
      return 'text-[#F04438]';
    default:
      return 'text-[#4A4A68]';
  }
}

function formatTime(value: string | null): string {
  if (!value) return '--';
  try {
    return new Date(value).toLocaleTimeString('pt-BR');
  } catch {
    return '--';
  }
}

export const RemoteBrowserTab: React.FC = () => {
  const [state, setState] = useState<BrowserState>(EMPTY_STATE);
  const [history, setHistory] = useState<BrowserHistoryEntry[]>([]);
  const [urlInput, setUrlInput] = useState('https://example.com');
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wsStatus, setWsStatus] = useState<'closed' | 'connecting' | 'open'>('closed');
  const [keyboardHint, setKeyboardHint] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const stateRef = useRef<BrowserState>(EMPTY_STATE);
  const reconnectTimerRef = useRef<number | null>(null);
  const lastMoveRef = useRef(0);
  const pollRef = useRef<number | null>(null);

  const isAdmin = (getStoredAuth()?.role || 'user') === 'admin';

  const applyState = useCallback((next: BrowserState) => {
    stateRef.current = next;
    setState(next);
    if (next.url && next.url !== 'about:blank') {
      setUrlInput((current) => (current === next.url ? current : next.url));
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const entries = await browserApi.history();
      if (mountedRef.current) setHistory(entries.slice().reverse());
    } catch {
      // histórico é opcional
    }
  }, []);

  const closeSocket = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    if (mountedRef.current) setWsStatus('closed');
  }, []);

  const connectSocket = useCallback(async () => {
    if (!mountedRef.current) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    closeSocket();
    setWsStatus('connecting');
    try {
      const { ticket } = await browserApi.ticket();
      if (!mountedRef.current) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/browser-ws`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setWsStatus('open');
        ws.send(JSON.stringify({ type: 'auth', ticket }));
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'state' && message.state) {
              applyState(message.state as BrowserState);
            } else if (message.type === 'error' && message.error) {
              setError(String(message.error));
            } else if (message.type === 'screenshot' && message.data) {
              const link = document.createElement('a');
              link.href = `data:image/jpeg;base64,${message.data}`;
              link.download = `navegador-${Date.now()}.jpg`;
              link.click();
            }
          } catch {
            // mensagem inválida
          }
          return;
        }

        const blob = new Blob([event.data], { type: 'image/jpeg' });
        const nextUrl = URL.createObjectURL(blob);
        const img = imgRef.current;
        if (img) {
          const previous = frameUrlRef.current;
          img.src = nextUrl;
          frameUrlRef.current = nextUrl;
          if (previous) {
            window.setTimeout(() => URL.revokeObjectURL(previous), 1000);
          }
        } else {
          URL.revokeObjectURL(nextUrl);
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        wsRef.current = null;
        setWsStatus('closed');
        const current = stateRef.current;
        if (current.status === 'running' || current.status === 'paused' || current.status === 'starting') {
          reconnectTimerRef.current = window.setTimeout(() => {
            void connectSocket();
          }, 2500);
        }
      };

      ws.onerror = () => {
        setError('Falha na conexão WebSocket com o painel.');
      };
    } catch (err: any) {
      if (mountedRef.current) {
        setWsStatus('closed');
        setError(err?.message || 'Falha ao obter ticket do WebSocket.');
      }
    }
  }, [applyState, closeSocket]);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await browserApi.status();
      if (!mountedRef.current) return;
      applyState(next);
      if ((next.status === 'running' || next.status === 'paused') && wsRef.current === null) {
        void connectSocket();
      }
    } catch (err: any) {
      if (mountedRef.current) setError(err?.message || 'Falha ao consultar o navegador.');
    }
  }, [applyState, connectSocket]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshStatus();
    void loadHistory();

    pollRef.current = window.setInterval(() => {
      if (document.hidden) return;
      if (wsRef.current === null) void refreshStatus();
    }, 5000);

    return () => {
      mountedRef.current = false;
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
      closeSocket();
      if (frameUrlRef.current) {
        URL.revokeObjectURL(frameUrlRef.current);
        frameUrlRef.current = null;
      }
    };
  }, [closeSocket, loadHistory, refreshStatus]);

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await browserApi.start();
      applyState(next);
      await connectSocket();
      await loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Falha ao iniciar o navegador.');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    setError(null);
    try {
      closeSocket();
      const next = await browserApi.stop();
      applyState(next);
      if (frameUrlRef.current) {
        URL.revokeObjectURL(frameUrlRef.current);
        frameUrlRef.current = null;
      }
      if (imgRef.current) imgRef.current.removeAttribute('src');
      await loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Falha ao parar o navegador.');
    } finally {
      setBusy(false);
    }
  };

  const handlePauseResume = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = stateRef.current.paused ? await browserApi.resume() : await browserApi.pause();
      applyState(next);
      if (!next.paused) await connectSocket();
      await loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Falha ao alterar o estado do navegador.');
    } finally {
      setBusy(false);
    }
  };

  const handleNavigate = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const target = urlInput.trim();
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const next = await browserApi.navigate(target);
      applyState(next);
      await loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Falha ao navegar.');
    } finally {
      setBusy(false);
    }
  };

  const handleScreenshot = async () => {
    setError(null);
    try {
      const blob = await browserApi.screenshot();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `navegador-${Date.now()}.jpg`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      await loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Falha ao capturar screenshot.');
    }
  };

  const send = (payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  const getNormalized = (event: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    };
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLImageElement>) => {
    event.preventDefault();
    const { x, y } = getNormalized(event);
    send({
      type: 'mouse',
      action: 'down',
      x,
      y,
      button: event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left'
    });
  };

  const handleMouseUp = (event: React.MouseEvent<HTMLImageElement>) => {
    event.preventDefault();
    const { x, y } = getNormalized(event);
    send({
      type: 'mouse',
      action: 'up',
      x,
      y,
      button: event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left'
    });
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLImageElement>) => {
    const now = Date.now();
    if (now - lastMoveRef.current < 33) return;
    lastMoveRef.current = now;
    const { x, y } = getNormalized(event);
    send({ type: 'mouse', action: 'move', x, y });
  };

  const handleWheel = (event: React.WheelEvent<HTMLImageElement>) => {
    event.preventDefault();
    const { x, y } = getNormalized(event);
    send({ type: 'mouse', action: 'wheel', x, y, deltaY: event.deltaY });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'F5' || event.key === 'F12') event.preventDefault();
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length > 1 || event.key === ' ') {
      event.preventDefault();
    }
    send({
      type: 'key',
      action: 'down',
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey
    });
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    send({
      type: 'key',
      action: 'up',
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey
    });
  };

  const handleSendText = () => {
    const text = textInput.trim();
    if (!text) return;
    send({ type: 'text', text });
    setTextInput('');
  };

  if (!isAdmin) {
    return (
      <div className="p-6 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] text-[#1A1A2E] space-y-2">
        <div className="flex items-center gap-2 text-[#F04438] font-bold">
          <ShieldAlert className="w-5 h-5" />
          <span className="font-title">Acesso restrito</span>
        </div>
        <p className="text-xs text-[#4A4A68] font-mono">
          O Navegador Remoto exige credenciais de administrador.
        </p>
      </div>
    );
  }

  const isRunning = state.status === 'running' || state.status === 'paused';

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-[#FF5A36]" />
            <h2 className="font-title font-black text-base text-[#1A1A2E]">Navegador Remoto</h2>
            <span className={`flex items-center gap-1.5 text-[11px] font-mono font-bold ${statusColor(state)}`}>
              <Circle className={`w-2.5 h-2.5 ${state.status === 'running' ? 'fill-current' : ''}`} />
              {statusLabel(state)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#4A4A68]">
            <span>WS: {wsStatus}</span>
            <span>FPS: {state.fps}</span>
            <span>Clientes: {state.clients}</span>
            <span>{state.viewport.width}x{state.viewport.height}</span>
          </div>
        </div>

        <form onSubmit={handleNavigate} className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[240px] flex items-center gap-2 px-3 py-2 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E]">
            <Globe className="w-4 h-4 text-[#4A4A68] shrink-0" />
            <input
              value={urlInput}
              onChange={(event) => setUrlInput(event.target.value)}
              placeholder="https://exemplo.com"
              className="w-full bg-transparent outline-none text-xs font-mono text-[#1A1A2E]"
              disabled={!isRunning}
            />
          </div>
          <button
            type="submit"
            disabled={!isRunning || busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#FF5A36] text-white text-xs font-bold border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] disabled:opacity-40"
          >
            <ArrowRight className="w-4 h-4" /> Ir
          </button>
          <button
            type="button"
            onClick={handleScreenshot}
            disabled={!isRunning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-white text-[#1A1A2E] text-xs font-bold border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] disabled:opacity-40"
          >
            <Camera className="w-4 h-4" /> Screenshot
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {!isRunning && state.status !== 'starting' && (
            <button
              type="button"
              onClick={handleStart}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#12B76A] text-white text-xs font-bold border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Iniciar
            </button>
          )}
          {state.status === 'starting' && (
            <span className="flex items-center gap-1.5 text-xs font-mono text-[#F79009]">
              <Loader2 className="w-4 h-4 animate-spin" /> Iniciando Chromium...
            </span>
          )}
          {isRunning && (
            <>
              <button
                type="button"
                onClick={handlePauseResume}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#F79009] text-white text-xs font-bold border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] disabled:opacity-40"
              >
                {state.paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                {state.paused ? 'Retomar' : 'Pausar'}
              </button>
              <button
                type="button"
                onClick={handleStop}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#F04438] text-white text-xs font-bold border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] disabled:opacity-40"
              >
                <Square className="w-4 h-4" /> Parar
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              void refreshStatus();
              void loadHistory();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-white text-[#1A1A2E] text-xs font-bold border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-[#FEF3F2] border border-[#F04438] text-[11px] font-mono text-[#B42318]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {state.error && state.status === 'error' && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-[#FEF3F2] border border-[#F04438] text-[11px] font-mono text-[#B42318]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3 space-y-2">
          <div
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onFocus={() => setKeyboardHint(true)}
            onBlur={() => setKeyboardHint(false)}
            className="relative w-full aspect-video rounded-xl overflow-hidden bg-[#1A1A2E] border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] outline-none focus:ring-4 focus:ring-[#FF5A36]/30"
          >
            {isRunning ? (
              <img
                ref={imgRef}
                alt="Tela do navegador remoto"
                draggable={false}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onWheel={handleWheel}
                onContextMenu={(event) => event.preventDefault()}
                className="w-full h-full object-contain cursor-crosshair select-none"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#FFF7E8] font-mono text-xs">
                <Monitor className="w-10 h-10 opacity-60" />
                <span>Navegador parado. Clique em Iniciar.</span>
              </div>
            )}
            {state.paused && (
              <div className="absolute top-2 right-2 px-2 py-1 rounded bg-[#F79009] text-white text-[10px] font-bold border border-[#1A1A2E]">
                PAUSADO
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
            <span className="flex items-center gap-1 text-[10px] font-mono text-[#4A4A68]">
              <Keyboard className="w-3.5 h-3.5" />
              {keyboardHint ? 'Teclado ativo' : 'Clique na tela para usar o teclado'}
            </span>
            <input
              value={textInput}
              onChange={(event) => setTextInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSendText();
                }
              }}
              placeholder="Digitar texto no navegador remoto..."
              disabled={!isRunning || state.paused}
              className="flex-1 min-w-[180px] px-2 py-1 rounded bg-[#FFF7E8] border border-[#1A1A2E] text-xs font-mono outline-none disabled:opacity-40"
            />
            <button
              type="button"
              onClick={handleSendText}
              disabled={!isRunning || state.paused}
              className="px-2.5 py-1 rounded bg-[#1A1A2E] text-white text-[11px] font-bold disabled:opacity-40"
            >
              Enviar
            </button>
            <span className="flex items-center gap-1 text-[10px] font-mono text-[#4A4A68]">
              <MousePointer2 className="w-3.5 h-3.5" /> clique, roda e teclado
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="p-3 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold font-title text-[#1A1A2E]">
              <History className="w-4 h-4 text-[#FF5A36]" /> Histórico
            </div>
            <div className="max-h-[420px] overflow-y-auto space-y-1">
              {history.length === 0 && (
                <p className="text-[10px] font-mono text-[#4A4A68]">Nenhuma ação ainda.</p>
              )}
              {history.map((entry, index) => (
                <div
                  key={`${entry.ts}-${index}`}
                  className="px-2 py-1 rounded bg-[#FFF7E8] border border-[#1A1A2E]/20 text-[10px] font-mono text-[#1A1A2E]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold uppercase">{entry.type}</span>
                    <span className="text-[#4A4A68]">{formatTime(entry.ts)}</span>
                  </div>
                  <div className="truncate text-[#4A4A68]" title={entry.detail}>
                    {entry.detail}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] space-y-1">
            <div className="text-[11px] font-bold font-title text-[#1A1A2E]">Sessão</div>
            <p className="text-[10px] font-mono text-[#4A4A68] break-all">
              {state.title || state.url || 'Sem página carregada'}
            </p>
            <p className="text-[10px] font-mono text-[#4A4A68]">
              Início: {formatTime(state.startedAt)} | Última ação: {formatTime(state.lastActionAt)}
            </p>
            <p className="text-[10px] font-mono text-[#4A4A68]">
              Perfil efêmero, histórico em memória, screenshots sob demanda.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

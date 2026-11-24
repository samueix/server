import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  RefreshCw,
  Maximize2,
  Minimize2,
  WifiOff,
  Activity,
  HardDrive,
  Shield,
  AlertTriangle,
  Info,
  Film,
  Gamepad2,
  CircleStop,
  Volume2,
  VolumeX,
  Lightbulb,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { getAuthHeaders } from '../../services/authService';
import { UbuntuRoundelLogo } from '../UbuntuRoundelLogo';

interface CamStatus {
  id: string;
  name: string;
  ip: string;
  mac?: string;
  nvrEnabled?: boolean;
  mainPath: string;
  subPath: string;
  streamNameMain: string;
  streamNameSub: string;
  online: boolean;
  error: string | null;
  latencyMs: number | null;
}

const PtzJoystick: React.FC<{
  onMove: (dir: 'up' | 'down' | 'left' | 'right') => void;
  onStop: () => void;
  disabled?: boolean;
}> = ({ onMove, onStop, disabled }) => {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activeDir = useRef<string | null>(null);
  const dragging = useRef(false);
  const R = 38;

  const resolveDir = (dx: number, dy: number) => {
    const dead = 10;
    if (Math.abs(dx) < dead && Math.abs(dy) < dead) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  };

  const updateFromEvent = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const clamp = Math.min(dist, R);
    dx = (dx / dist) * clamp;
    dy = (dy / dist) * clamp;
    setKnob({ x: dx, y: dy });
    const dir = resolveDir(dx, dy) as 'up' | 'down' | 'left' | 'right' | null;
    if (dir !== activeDir.current) {
      if (activeDir.current) onStop();
      if (dir) onMove(dir);
      activeDir.current = dir;
    }
  };

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setKnob({ x: 0, y: 0 });
    if (activeDir.current) {
      onStop();
      activeDir.current = null;
    }
  };

  useEffect(() => {
    const mv = (e: PointerEvent) => {
      if (dragging.current) updateFromEvent(e.clientX, e.clientY);
    };
    const up = () => endDrag();
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={baseRef}
        onPointerDown={(e) => {
          if (disabled) return;
          dragging.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          updateFromEvent(e.clientX, e.clientY);
        }}
        className={`relative w-32 h-32 rounded-full border-2 border-[#1A1A2E] bg-[#FFF7E8] shadow-[inset_0_2px_6px_rgba(26,26,46,0.12)] select-none touch-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <div className="absolute inset-3 rounded-full border border-dashed border-[#1A1A2E]/30" />
        <div className="absolute left-1/2 top-1.5 -translate-x-1/2 text-[#4A4A68] pointer-events-none">
          <ChevronUp className="w-3.5 h-3.5" />
        </div>
        <div className="absolute left-1/2 bottom-1.5 -translate-x-1/2 text-[#4A4A68] pointer-events-none">
          <ChevronDown className="w-3.5 h-3.5" />
        </div>
        <div className="absolute top-1/2 left-1.5 -translate-y-1/2 text-[#4A4A68] pointer-events-none">
          <ChevronLeft className="w-3.5 h-3.5" />
        </div>
        <div className="absolute top-1/2 right-1.5 -translate-y-1/2 text-[#4A4A68] pointer-events-none">
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
        <div
          className="absolute left-1/2 top-1/2 w-12 h-12 -ml-6 -mt-6 rounded-full border-2 border-[#1A1A2E] bg-white shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        >
          <div className="w-4 h-4 rounded-full bg-[#FF5A36] border border-[#1A1A2E]" />
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onStop();
        }}
        className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#FEE4E2] hover:bg-[#FECACA] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-y-[1px] text-[#B42318] font-mono font-bold text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
      >
        <CircleStop className="w-3.5 h-3.5" />
        Stop
      </button>
    </div>
  );
};

const CameraCard: React.FC<{
  cam: CamStatus;
  onRefresh: () => void;
  active: boolean;
  onActivate: () => void;
}> = ({ cam, onRefresh, active, onActivate }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const moveTimer = useRef<any>(null);
  const keysDown = useRef<Set<string>>(new Set());
  const reconnectTimer = useRef<any>(null);

  const [fullscreen, setFullscreen] = useState(false);
  const [liveState, setLiveState] = useState<'connecting' | 'live' | 'error'>('connecting');
  const liveStateRef = useRef<'connecting' | 'live' | 'error'>('connecting');
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rec, setRec] = useState<any>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [ptzBusy, setPtzBusy] = useState('');
  const [audioOn, setAudioOn] = useState(false);
  const [ledMsg, setLedMsg] = useState<string | null>(null);

  const setLive = (s: 'connecting' | 'live' | 'error') => {
    liveStateRef.current = s;
    setLiveState(s);
  };

  const stopStream = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const startStream = useCallback(async () => {
    stopStream();
    setLive('connecting');
    setPlayerError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch(`${cam.subPath}/stream.mjpeg`, {
        headers: getAuthHeaders(),
        signal: ac.signal,
        cache: 'no-store',
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      let buf = new Uint8Array(0);
      const findSeq = (arr: Uint8Array, a: number, b: number, from = 0) => {
        for (let i = from; i < arr.length - 1; i++) {
          if (arr[i] === a && arr[i + 1] === b) return i;
        }
        return -1;
      };
      const concat = (a: Uint8Array, b: Uint8Array) => {
        const c = new Uint8Array(a.length + b.length);
        c.set(a, 0);
        c.set(b, a.length);
        return c;
      };
      while (!ac.signal.aborted) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        buf = concat(buf, value);
        let soi = findSeq(buf, 0xff, 0xd8);
        while (soi !== -1) {
          const eoi = findSeq(buf, 0xff, 0xd9, soi + 2);
          if (eoi === -1) {
            if (soi > 0) buf = buf.slice(soi);
            break;
          }
          const frame = buf.slice(soi, eoi + 2);
          buf = buf.slice(eoi + 2);
          const url = URL.createObjectURL(new Blob([frame], { type: 'image/jpeg' }));
          const old = objectUrlRef.current;
          objectUrlRef.current = url;
          if (imgRef.current) imgRef.current.src = url;
          if (old) URL.revokeObjectURL(old);
          if (liveStateRef.current !== 'live') setLive('live');
          soi = findSeq(buf, 0xff, 0xd8);
        }
        if (buf.length > 2_000_000) buf = buf.slice(-1_000_000);
      }
      if (!ac.signal.aborted) throw new Error('stream encerrado');
    } catch (e: any) {
      if (ac.signal.aborted) return;
      setLive('error');
      setPlayerError(e?.message || 'Falha no stream ao vivo');
      reconnectTimer.current = setTimeout(() => {
        if (!ac.signal.aborted) startStream();
      }, 1500);
    }
  }, [cam.subPath, stopStream]);

  useEffect(() => {
    startStream();
    const onVis = () => {
      if (document.visibilityState === 'visible') startStream();
      else stopStream();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      stopStream();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [startStream, stopStream]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) await el.requestFullscreen?.();
    else await document.exitFullscreen?.();
  };

  const doPtz = useCallback(
    async (action: string) => {
      if (moveTimer.current) {
        clearTimeout(moveTimer.current);
        moveTimer.current = null;
      }
      setPtzBusy(action);
      try {
        await fetch(`/api/cameras/${cam.id}/ptz`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ action }),
        });
      } finally {
        setPtzBusy('');
      }
    },
    [cam.id]
  );

  useEffect(() => {
    if (!active) return;
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el?.isContentEditable;
    };
    const keyMap: Record<string, string> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };
    const onDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const action = keyMap[e.key];
      if (!action) return;
      e.preventDefault();
      if (keysDown.current.has(e.key)) return;
      keysDown.current.add(e.key);
      void doPtz(action);
    };
    const onUp = (e: KeyboardEvent) => {
      const action = keyMap[e.key];
      if (!action) return;
      e.preventDefault();
      keysDown.current.delete(e.key);
      if (keysDown.current.size === 0) void doPtz('stop');
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      keysDown.current.clear();
    };
  }, [active, doPtz]);

  const loadDetails = async () => {
    setDetailsOpen((v) => !v);
    if (details) return;
    try {
      const r = await fetch(`/api/cameras/${cam.id}/details`, { headers: getAuthHeaders() });
      setDetails(await r.json());
    } catch (e: any) {
      setDetails({ ok: false, error: e?.message || String(e) });
    }
  };

  const probeRecordings = async () => {
    setRecLoading(true);
    try {
      const r = await fetch(`/api/cameras/${cam.id}/recordings`, { headers: getAuthHeaders() });
      setRec(await r.json());
    } catch (e: any) {
      setRec({ ok: false, error: e?.message || String(e) });
    } finally {
      setRecLoading(false);
    }
  };

  const toggleAudio = async () => {
    const next = !audioOn;
    setAudioOn(next);
    if (!audioRef.current) return;
    if (next) {
      audioRef.current.src = `/api/cameras/${cam.id}/audio.wav`;
      audioRef.current.load();
      try {
        await audioRef.current.play();
      } catch {
        /* needs gesture */
      }
    } else {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
  };

  const setLed = async (mode: 'on' | 'off' | 'auto') => {
    setLedMsg('...');
    try {
      const r = await fetch(`/api/cameras/${cam.id}/led`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ mode }),
      });
      const d = await r.json();
      setLedMsg(d.error || d.message || (d.ok ? 'OK' : 'Não suportado'));
    } catch (e: any) {
      setLedMsg(e?.message || 'falha');
    }
  };

  return (
    <div
      onClick={onActivate}
      className={`rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] overflow-hidden transition-shadow ${
        active ? 'ring-2 ring-[#FF5A36] ring-offset-2 ring-offset-[#FFF7E8]' : ''
      }`}
    >
      {/* Cabeçalho do Card da Câmera */}
      <div className="p-4 bg-[#FFF7E8] border-b-2 border-[#1A1A2E] flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-7 h-7 rounded-md bg-white border-2 border-[#1A1A2E] flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4 text-[#FF5A36]" />
            </div>
            <h3 className="font-black font-title text-base text-[#1A1A2E] truncate">{cam.name}</h3>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-[#1A1A2E] ${
                cam.online ? 'bg-[#D1FADF] text-[#027A48]' : 'bg-[#FEE4E2] text-[#B42318]'
              }`}
            >
              {cam.online ? 'ONLINE' : 'OFFLINE'}
            </span>
            {active && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FF5A36] text-white border border-[#1A1A2E]">
                TECLADO ATIVO
              </span>
            )}
          </div>
          <div className="text-xs text-[#4A4A68] mt-1 font-mono font-semibold truncate">
            {cam.ip} {cam.mac ? `• ${cam.mac}` : ''}
            {cam.latencyMs !== null ? ` • ${cam.latencyMs} ms` : ''}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleAudio();
            }}
            aria-label="Alternar áudio da câmera"
            title="Áudio"
            className={`w-9 h-9 rounded-lg border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-y-[1px] flex items-center justify-center cursor-pointer ${
              audioOn
                ? 'bg-[#FF5A36] text-white'
                : 'bg-white hover:bg-[#FFC857]/30 text-[#1A1A2E]'
            }`}
          >
            {audioOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startStream();
              onRefresh();
            }}
            aria-label="Reconectar câmera"
            title="Reconectar"
            className="w-9 h-9 rounded-lg bg-white hover:bg-[#FFC857]/30 text-[#1A1A2E] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-y-[1px] flex items-center justify-center cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              loadDetails();
            }}
            aria-label="Informações da câmera"
            title="Informações"
            className={`w-9 h-9 rounded-lg border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-y-[1px] flex items-center justify-center cursor-pointer ${
              detailsOpen
                ? 'bg-[#00A6FB] text-white'
                : 'bg-white hover:bg-[#FFC857]/30 text-[#1A1A2E]'
            }`}
          >
            <Info className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            title="Tela cheia"
            className="w-9 h-9 rounded-lg bg-white hover:bg-[#FFC857]/30 text-[#1A1A2E] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-y-[1px] flex items-center justify-center cursor-pointer"
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Viewport do Stream MJPEG */}
      <div
        ref={containerRef}
        className="relative bg-[#12131F] aspect-video flex items-center justify-center overflow-hidden border-b-2 border-[#1A1A2E]"
      >
        <img
          ref={imgRef}
          alt={cam.name}
          className={`w-full h-full object-contain bg-[#12131F] transition-opacity duration-200 ${
            liveState === 'live' ? 'opacity-100' : 'opacity-25'
          }`}
        />
        {liveState !== 'live' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center bg-[#12131F]/65">
            <div className="p-2.5 rounded-2xl bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E]">
              <UbuntuRoundelLogo size="lg" />
            </div>
            <div className="text-sm text-white font-bold font-title">
              {liveState === 'connecting' ? 'Conectando à câmera...' : 'Reconectando...'}
            </div>
            <div className="text-[11px] font-mono text-white/80">
              Iniciando stream SD, pode levar alguns segundos
            </div>
          </div>
        )}
        <audio ref={audioRef} />
        <div className="absolute left-3 bottom-3 flex items-center gap-2 text-[11px] font-mono font-bold">
          <span
            className={`px-2.5 py-0.5 rounded-md border-2 border-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E] ${
              liveState === 'live'
                ? 'bg-[#D1FADF] text-[#027A48]'
                : liveState === 'connecting'
                ? 'bg-[#FEF0C7] text-[#B54708]'
                : 'bg-[#FEE4E2] text-[#B42318]'
            }`}
          >
            {liveState === 'live' ? 'AO VIVO' : liveState === 'connecting' ? 'CONECTANDO' : 'ERRO'}
          </span>
          <span className="px-2.5 py-0.5 rounded-md bg-white text-[#1A1A2E] border-2 border-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E]">
            SD
          </span>
          {audioOn && (
            <span className="px-2.5 py-0.5 rounded-md bg-[#FF5A36] text-white border-2 border-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E]">
              ÁUDIO
            </span>
          )}
        </div>
      </div>

      {/* Métricas Rápidas da Câmera */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
        <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg p-3 shadow-[2px_2px_0px_#1A1A2E]">
          <div className="text-[#4A4A68] font-bold flex items-center gap-1 text-[11px] uppercase tracking-wider">
            <Activity className="w-3.5 h-3.5 text-[#FF5A36]" /> Status
          </div>
          <div className={`mt-1 font-mono font-extrabold ${cam.online ? 'text-[#027A48]' : 'text-[#B42318]'}`}>
            {cam.online ? 'Online' : 'Sem sinal'}
          </div>
        </div>
        <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg p-3 shadow-[2px_2px_0px_#1A1A2E]">
          <div className="text-[#4A4A68] font-bold flex items-center gap-1 text-[11px] uppercase tracking-wider">
            <Camera className="w-3.5 h-3.5 text-[#00A6FB]" /> Fonte
          </div>
          <div className="mt-1 font-mono font-extrabold text-[#1A1A2E]">RTSP SD</div>
        </div>
        <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg p-3 shadow-[2px_2px_0px_#1A1A2E]">
          <div className="text-[#4A4A68] font-bold flex items-center gap-1 text-[11px] uppercase tracking-wider">
            <HardDrive className="w-3.5 h-3.5 text-[#F79009]" /> NVR
          </div>
          <div className="mt-1 font-mono font-extrabold text-[#1A1A2E]">
            {cam.nvrEnabled ? 'microSD' : '—'}
          </div>
        </div>
        <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg p-3 shadow-[2px_2px_0px_#1A1A2E]">
          <div className="text-[#4A4A68] font-bold flex items-center gap-1 text-[11px] uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5 text-[#12B76A]" /> Servidor
          </div>
          <div className="mt-1 font-mono font-extrabold text-[#027A48]">Sem gravação</div>
        </div>
      </div>

      {/* Controles PTZ, LED, Gravações microSD e Detalhes */}
      <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-3.5">
        <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-xl p-3.5 shadow-[2px_2px_0px_#1A1A2E] flex flex-col justify-between">
          <div className="text-xs font-black font-title text-[#1A1A2E] mb-3 flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-[#FF5A36]" /> PTZ
          </div>
          <PtzJoystick
            onMove={(d) => void doPtz(d)}
            onStop={() => void doPtz('stop')}
            disabled={!!ptzBusy}
          />
          <div className="text-[11px] text-[#4A4A68] font-medium mt-3 text-center">
            Joystick/setas. Solte para parar.
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-xl p-3.5 shadow-[2px_2px_0px_#1A1A2E]">
            <div className="text-xs font-black font-title text-[#1A1A2E] mb-2.5 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-[#FF5A36]" /> LED / Controles
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLed('on');
                }}
                className="min-h-[34px] px-3 py-1 text-xs font-mono font-bold rounded-lg bg-white hover:bg-[#FFC857]/30 border-2 border-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E] active:translate-y-[1px] text-[#1A1A2E] cursor-pointer"
              >
                LED On
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLed('off');
                }}
                className="min-h-[34px] px-3 py-1 text-xs font-mono font-bold rounded-lg bg-white hover:bg-[#FFC857]/30 border-2 border-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E] active:translate-y-[1px] text-[#1A1A2E] cursor-pointer"
              >
                LED Off
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLed('auto');
                }}
                className="min-h-[34px] px-3 py-1 text-xs font-mono font-bold rounded-lg bg-white hover:bg-[#FFC857]/30 border-2 border-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E] active:translate-y-[1px] text-[#1A1A2E] cursor-pointer"
              >
                Auto
              </button>
            </div>
            {ledMsg && (
              <div className="text-[11px] font-mono font-semibold text-[#4A4A68] mt-2 bg-white px-2.5 py-1 rounded border border-[#1A1A2E]/30 inline-block">
                {ledMsg}
              </div>
            )}
          </div>

          <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-xl p-3.5 shadow-[2px_2px_0px_#1A1A2E]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs font-black font-title text-[#1A1A2E] flex items-center gap-2">
                <Film className="w-4 h-4 text-[#FF5A36]" /> Gravações microSD
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  probeRecordings();
                }}
                className="min-h-[32px] text-[11px] font-mono font-bold px-2.5 py-1 bg-white hover:bg-[#FFC857]/30 border-2 border-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E] active:translate-y-[1px] rounded-lg text-[#1A1A2E] cursor-pointer"
              >
                {recLoading ? 'Sondando...' : 'Sondar'}
              </button>
            </div>
            {!rec && (
              <div className="text-[11px] text-[#4A4A68] leading-relaxed">
                Esta Yoosee não expõe replay ONVIF padrão. Sem endpoint de playback confirmado, não dá para exibir gravações SD no painel com segurança.
              </div>
            )}
            {rec && (
              <div className="text-[11px] text-[#1A1A2E] space-y-1 max-h-28 overflow-auto bg-white p-2.5 rounded-lg border border-[#1A1A2E]">
                <div className={`font-bold ${rec.supported ? 'text-[#027A48]' : 'text-[#B54708]'}`}>
                  {rec.supported ? 'Suporte detectado' : 'Sem replay padrão detectado'}
                </div>
                <div className="text-[#4A4A68]">{rec.reason}</div>
                {Array.isArray(rec.findings) &&
                  rec.findings.slice(0, 6).map((f: any, i: number) => (
                    <div key={i} className="font-mono text-[#4A4A68]">
                      {f.path}: {f.ok ? 'ok' : String(f.error || '').slice(0, 80)}
                    </div>
                  ))}
              </div>
            )}
          </div>

          {detailsOpen && (
            <div className="bg-white border-2 border-[#1A1A2E] rounded-xl p-3.5 text-xs text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <div className="font-black font-title text-[#1A1A2E] mb-2">Informações / Configs</div>
              {!details ? (
                <div className="text-[#4A4A68] font-medium">Carregando...</div>
              ) : details.error ? (
                <div className="text-[#B42318] font-semibold">{details.error}</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="text-[#4A4A68]">
                    Fabricante: <span className="text-[#1A1A2E] font-bold">{details.device?.manufacturer || '—'}</span>
                  </div>
                  <div className="text-[#4A4A68]">
                    Modelo: <span className="text-[#1A1A2E] font-bold">{details.device?.model || '—'}</span>
                  </div>
                  <div className="text-[#4A4A68]">
                    Firmware: <span className="text-[#1A1A2E] font-bold">{details.device?.firmware || '—'}</span>
                  </div>
                  <div className="text-[#4A4A68]">
                    Serial: <span className="text-[#1A1A2E] font-bold">{details.device?.serial || '—'}</span>
                  </div>
                  <div className="text-[#4A4A68]">
                    IP/MAC:{' '}
                    <span className="text-[#1A1A2E] font-bold">
                      {details.camera?.ip} / {details.network?.interfaces?.[0]?.hwAddress || details.camera?.mac || '—'}
                    </span>
                  </div>
                  <div className="text-[#4A4A68]">
                    DHCP: <span className="text-[#1A1A2E] font-bold">{details.network?.interfaces?.[0]?.dhcp || '—'}</span>
                  </div>
                  <div className="md:col-span-2 text-[#4A4A68]">
                    Capacidades:{' '}
                    <span className="text-[#1A1A2E] font-semibold">
                      {details.capabilities?.ptz ? 'PTZ ' : ''}
                      {details.capabilities?.events ? 'Events ' : ''}
                      {details.capabilities?.deviceIO ? 'DeviceIO ' : ''}
                      {details.capabilities?.audio ? 'Audio' : ''}
                    </span>
                  </div>
                  <div className="md:col-span-2 text-[#4A4A68]">LED: {details.controls?.led?.note}</div>
                  <div className="md:col-span-2 text-[#4A4A68]">Replay: {details.controls?.recordingPlayback?.note}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {(playerError || cam.error) && (
        <div className="px-4 pb-4">
          <div className="text-xs text-[#B54708] bg-[#FEF0C7] border-2 border-[#1A1A2E] rounded-lg p-3 flex gap-2 items-start shadow-[2px_2px_0px_#1A1A2E]">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-[#B54708]" />
            <div>
              <div className="font-bold">Aviso</div>
              <div className="mt-0.5 font-mono text-[11px]">{playerError || cam.error}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const CamerasTab: React.FC = () => {
  const [cameras, setCameras] = useState<CamStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCam, setActiveCam] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/cameras', { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);
      const cams = Array.isArray(data.cameras) ? data.cameras : [];
      setCameras(cams);
      setActiveCam((prev) => (prev && cams.some((c: CamStatus) => c.id === prev) ? prev : cams[0]?.id ?? null));
      setError(data?.go2rtc?.error || null);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar câmeras');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* Cabeçalho da Aba Câmeras */}
      <div className="p-4 sm:p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center shrink-0">
            <Camera className="w-5 h-5 text-[#FF5A36]" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black font-title text-[#1A1A2E] tracking-tight">
              Central de Câmeras
            </h2>
            <p className="text-xs sm:text-sm text-[#4A4A68] font-medium mt-0.5">
              Ao vivo SD (baixo consumo), PTZ, áudio e diagnóstico. Sem gravação no servidor Ubuntu.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="text-xs font-mono font-bold text-[#1A1A2E] bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg px-3 py-2 shadow-[2px_2px_0px_#1A1A2E]">
            Somente SD • ao vivo
          </div>
          <button
            type="button"
            onClick={refresh}
            className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#FF5A36] hover:bg-[#E04522] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-y-[1px] text-white font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Erro do Serviço de Câmera */}
      {error && (
        <div className="bg-[#FEE4E2] border-2 border-[#1A1A2E] text-[#B42318] rounded-xl p-4 text-sm flex items-start gap-2.5 shadow-[4px_4px_0px_#1A1A2E]">
          <WifiOff className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-bold">Erro no serviço de câmera</div>
            <div className="text-xs font-mono mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Lista de Câmeras / Carregando / Vazio */}
      {loading ? (
        <div className="p-8 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] text-center text-sm font-semibold text-[#4A4A68]">
          Carregando câmeras...
        </div>
      ) : cameras.length === 0 ? (
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-8 text-[#1A1A2E]">
          <div className="font-black font-title text-base mb-2">Nenhuma câmera configurada</div>
          <div className="text-sm text-[#4A4A68]">
            Adicione credenciais em{' '}
            <code className="font-mono font-bold text-[#1A1A2E] bg-[#FFF7E8] px-1.5 py-0.5 rounded border border-[#1A1A2E]/30">
              /opt/server-panel/.camera-secrets.json
            </code>
            .
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {cameras.map((cam) => (
            <CameraCard
              key={cam.id}
              cam={cam}
              onRefresh={refresh}
              active={activeCam === cam.id}
              onActivate={() => setActiveCam(cam.id)}
            />
          ))}
        </div>
      )}

      {/* Rodapé de Notas */}
      <div className="text-xs text-[#4A4A68] border-2 border-[#1A1A2E] rounded-xl p-3.5 bg-[#FFF7E8] shadow-[2px_2px_0px_#1A1A2E]">
        <span className="font-bold text-[#1A1A2E]">Notas:</span> SD fixa para estabilidade. PTZ/áudio por RTSP/ONVIF. LED e replay microSD não expostos por ONVIF padrão nesta Yoosee; UI mostra suporte real e limitações.
      </div>
    </div>
  );
};

export default CamerasTab;

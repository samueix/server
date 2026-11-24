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
  Volume2,
  VolumeX,
  Lightbulb
} from 'lucide-react';
import { getAuthHeaders, getAuthQueryParam } from '../../services/authService';
import { UbuntuRoundelLogo } from '../UbuntuRoundelLogo';

interface CamStatus {
  id: string;
  name: string;
  ip: string;
  mac?: string;
  nvrEnabled?: boolean;
  brand?: string;
  model?: string;
  onvifPort?: number;
  rtspPort?: number;
  mainPath: string;
  subPath: string;
  streamNameMain: string;
  streamNameSub: string;
  online: boolean;
  error: string | null;
  latencyMs: number | null;
}


const CameraCard: React.FC<{
  cam: CamStatus;
  onRefresh: () => void;
  active: boolean;
  onActivate: () => void;
}> = ({ cam, onRefresh, active, onActivate }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobRef = useRef<string | null>(null);
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
  const [ptzSpeed, setPtzSpeed] = useState(1);

  const setLive = (s: 'connecting' | 'live' | 'error') => {
    liveStateRef.current = s;
    setLiveState(s);
  };

  const audioAbortRef = useRef<AbortController | null>(null);
  const suppressAudioErrorRef = useRef(false);
  const ptzHeldRef = useRef(false);
  const stopAudio = useCallback(() => {
    suppressAudioErrorRef.current = true;
    audioAbortRef.current?.abort();
    audioAbortRef.current = null;
    const el = audioRef.current;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    if (audioBlobRef.current) { URL.revokeObjectURL(audioBlobRef.current); audioBlobRef.current=null; }
  }, []);

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
      stopAudio();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [startStream, stopStream, stopAudio]);

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

  const sendPtz = useCallback(async (action: string, speed?: number) => {
    setPtzBusy(action);
    try {
      await fetch(`/api/cameras/${cam.id}/ptz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action, speed: speed ?? ptzSpeed }),
      });
    } finally {
      setPtzBusy('');
    }
  }, [cam.id, ptzSpeed]);


  const doPtz = useCallback(
    async (action: string) => {
      if (moveTimer.current) {
        clearTimeout(moveTimer.current);
        moveTimer.current = null;
      }
      await sendPtz(action);
    },
    [sendPtz]
  );

  const startHoldPtz = useCallback((action: string) => {
    ptzHeldRef.current = true;
    void doPtz(action);
  }, [doPtz]);

  const endHoldPtz = useCallback(() => {
    if (!ptzHeldRef.current) return;
    ptzHeldRef.current = false;
    void doPtz('stop');
  }, [doPtz]);

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

  const [audioErr, setAudioErr] = useState<string | null>(null);

  const toggleAudio = async () => {
    const next = !audioOn;
    setAudioErr(null);
    setAudioOn(next);
    const el = audioRef.current;
    if (!el) return;
    if (!next) { stopAudio(); return; }
    try {
      stopAudio();
      suppressAudioErrorRef.current = false;
      // Prefer MediaSource streaming for MP3; fallback to src+auth query.
      const MS = (window as any).MediaSource;
      const canMS = !!MS && MS.isTypeSupported?.('audio/mpeg');
      if (canMS) {
        const mediaSource = new MS();
        const objUrl = URL.createObjectURL(mediaSource);
        audioBlobRef.current = objUrl;
        el.src = objUrl;
        el.load();
        const ac = new AbortController();
        audioAbortRef.current = ac;
        await new Promise<void>((resolve, reject) => {
          mediaSource.addEventListener('sourceopen', async () => {
            try {
              const sb = mediaSource.addSourceBuffer('audio/mpeg');
              const res = await fetch(`/api/cameras/${cam.id}/audio.mp3?t=${Date.now()}`, { headers: getAuthHeaders(), cache: 'no-store', signal: ac.signal });
              if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
              const reader = res.body.getReader();
              const pump = async (): Promise<void> => {
                if (ac.signal.aborted) { resolve(); return; }
                const { value, done } = await reader.read();
                if (done) { try { if (mediaSource.readyState==='open') mediaSource.endOfStream(); } catch {} resolve(); return; }
                if (value?.length) {
                  await new Promise<void>((r2, j2) => {
                    const onEnd = () => { sb.removeEventListener('updateend', onEnd); sb.removeEventListener('error', onErr); r2(); };
                    const onErr = () => { sb.removeEventListener('updateend', onEnd); sb.removeEventListener('error', onErr); j2(new Error('sourcebuffer error')); };
                    sb.addEventListener('updateend', onEnd); sb.addEventListener('error', onErr);
                    try { sb.appendBuffer(value.buffer.slice(value.byteOffset, value.byteOffset+value.byteLength)); } catch (e) { onErr(); }
                  });
                  if (el.paused) { try { await el.play(); resolve(); } catch {} }
                }
                return pump();
              };
              pump().catch(reject);
            } catch (e) { reject(e); }
          }, { once: true });
        });
      } else {
        const q = getAuthQueryParam();
        el.src = `/api/cameras/${cam.id}/audio.mp3?t=${Date.now()}${q ? `&${q}` : ''}`;
        el.load();
        await el.play();
      }
    } catch (e:any) {
      if (String(e?.name) === 'AbortError') return;
      setAudioOn(false);
      setAudioErr(e?.message || 'Falha ao reproduzir áudio');
      stopAudio();
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

      {/* Corpo Principal: Câmera à esquerda + Controles Laterais à direita */}
      <div className="p-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(290px,360px)] gap-3 items-start">
        {/* Coluna Esquerda: Vídeo + Status + Avisos */}
        <div className="min-w-0 space-y-3">
          {/* Viewport do Stream MJPEG */}
          <div
            ref={containerRef}
            className="relative bg-[#12131F] aspect-video max-h-[58vh] flex items-center justify-center overflow-hidden rounded-lg border-2 border-[#1A1A2E]"
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
            <audio
              ref={audioRef}
              playsInline
              onError={() => {
                if (suppressAudioErrorRef.current || !audioRef.current?.getAttribute('src')) return;
                setAudioOn(false);
                setAudioErr('Stream de áudio indisponível nesta câmera/codec.');
              }}
            />
            <div className="absolute left-3 bottom-3 flex items-center gap-2 text-[11px] font-mono font-bold flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-md border-2 border-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E] ${liveState === 'live' ? 'bg-[#D1FADF] text-[#027A48]' : liveState === 'connecting' ? 'bg-[#FEF0C7] text-[#B54708]' : 'bg-[#FEE4E2] text-[#B42318]'}`}>
                {liveState === 'live' ? 'AO VIVO' : liveState === 'connecting' ? 'CONECTANDO' : 'ERRO'}
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-white text-[#1A1A2E] border-2 border-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E]">SD</span>
              {audioOn && <span className="px-2.5 py-0.5 rounded-md bg-[#FF5A36] text-white border-2 border-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E]">ÁUDIO</span>}
              {audioErr && <span className="px-2.5 py-0.5 rounded-md bg-[#FEE4E2] text-[#B42318] border-2 border-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E]">{audioErr}</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div className="bg-[#FFF7E8] border border-[#1A1A2E]/30 rounded-md px-2 py-1.5"><div className="text-[#4A4A68] font-bold">Status</div><div className={`font-mono font-extrabold ${cam.online?'text-[#027A48]':'text-[#B42318]'}`}>{cam.online?'Online':'Sem sinal'}</div></div>
            <div className="bg-[#FFF7E8] border border-[#1A1A2E]/30 rounded-md px-2 py-1.5"><div className="text-[#4A4A68] font-bold">Fonte</div><div className="font-mono font-extrabold text-[#1A1A2E]">RTSP SD</div></div>
            <div className="bg-[#FFF7E8] border border-[#1A1A2E]/30 rounded-md px-2 py-1.5"><div className="text-[#4A4A68] font-bold">NVR</div><div className="font-mono font-extrabold text-[#1A1A2E]">{cam.nvrEnabled?'microSD':'—'}</div></div>
            <div className="bg-[#FFF7E8] border border-[#1A1A2E]/30 rounded-md px-2 py-1.5"><div className="text-[#4A4A68] font-bold">Servidor</div><div className="font-mono font-extrabold text-[#027A48]">Sem gravação</div></div>
          </div>

          {(playerError || cam.error) && (
            <div className="text-xs text-[#B54708] bg-[#FEF0C7] border-2 border-[#1A1A2E] rounded-lg p-3 flex gap-2 items-start shadow-[2px_2px_0px_#1A1A2E]">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-[#B54708]" />
              <div>
                <div className="font-bold">Aviso</div>
                <div className="mt-0.5 font-mono text-[11px]">{playerError || cam.error}</div>
              </div>
            </div>
          )}
        </div>

        {/* Coluna Lateral Direita: PTZ, LED / Controles, Gravações microSD e Detalhes */}
        <aside className="space-y-3 min-w-0" aria-label={`Controles da câmera ${cam.name}`}>
          <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-xl p-3.5 shadow-[2px_2px_0px_#1A1A2E]">
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-xs font-black font-title text-[#1A1A2E] flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-[#FF5A36]" /> PTZ
                {ptzBusy && <span className="text-[10px] font-mono text-[#FF5A36] uppercase">({ptzBusy})</span>}
              </div>
              <div className="text-[10px] font-mono font-bold text-[#4A4A68]">{ptzSpeed.toFixed(1)}x</div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 w-[156px] mx-auto select-none touch-none">
              <div />
              <button type="button" aria-label="Mover câmera para cima" onPointerDown={(e)=>{e.preventDefault(); startHoldPtz('up');}} onPointerUp={endHoldPtz} onPointerLeave={endHoldPtz} onPointerCancel={endHoldPtz} className="h-11 rounded-lg border-2 border-[#1A1A2E] bg-white hover:bg-[#FFC857]/30 shadow-[2px_2px_0px_#1A1A2E] active:translate-y-[1px] font-bold cursor-pointer">↑</button>
              <div />
              <button type="button" aria-label="Mover câmera para esquerda" onPointerDown={(e)=>{e.preventDefault(); startHoldPtz('left');}} onPointerUp={endHoldPtz} onPointerLeave={endHoldPtz} onPointerCancel={endHoldPtz} className="h-11 rounded-lg border-2 border-[#1A1A2E] bg-white hover:bg-[#FFC857]/30 shadow-[2px_2px_0px_#1A1A2E] active:translate-y-[1px] font-bold cursor-pointer">←</button>
              <button type="button" aria-label="Parar movimento PTZ" onClick={(e)=>{e.stopPropagation(); ptzHeldRef.current = false; void doPtz('stop');}} className="h-11 rounded-lg border-2 border-[#1A1A2E] bg-[#FEE4E2] hover:bg-[#F04438]/20 shadow-[2px_2px_0px_#1A1A2E] active:translate-y-[1px] font-bold text-[#B42318] cursor-pointer">■</button>
              <button type="button" aria-label="Mover câmera para direita" onPointerDown={(e)=>{e.preventDefault(); startHoldPtz('right');}} onPointerUp={endHoldPtz} onPointerLeave={endHoldPtz} onPointerCancel={endHoldPtz} className="h-11 rounded-lg border-2 border-[#1A1A2E] bg-white hover:bg-[#FFC857]/30 shadow-[2px_2px_0px_#1A1A2E] active:translate-y-[1px] font-bold cursor-pointer">→</button>
              <div />
              <button type="button" aria-label="Mover câmera para baixo" onPointerDown={(e)=>{e.preventDefault(); startHoldPtz('down');}} onPointerUp={endHoldPtz} onPointerLeave={endHoldPtz} onPointerCancel={endHoldPtz} className="h-11 rounded-lg border-2 border-[#1A1A2E] bg-white hover:bg-[#FFC857]/30 shadow-[2px_2px_0px_#1A1A2E] active:translate-y-[1px] font-bold cursor-pointer">↓</button>
              <div />
            </div>
            <input type="range" min="0.2" max="1" step="0.1" value={ptzSpeed} onChange={(e)=>setPtzSpeed(Number(e.target.value))} aria-label="Velocidade PTZ" className="w-full mt-2.5 accent-[#FF5A36]" />
            <div className="text-[10px] text-[#4A4A68] text-center mt-1">Segure direção; solte para parar.</div>
          </div>

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
                  {rec.supported ? 'Armazenamento detectado' : 'Sem replay padrão detectado'}
                </div>
                <div className="text-[#4A4A68]">{rec.reason}</div>
                {rec.storage && (
                  <div className="text-[#4A4A68]">Storage ONVIF: {rec.storage.supported ? 'suportado' : 'não exposto'} {rec.storage.source ? `(${rec.storage.source})` : ''}</div>
                )}
                {Array.isArray(rec.storage?.items) && rec.storage.items.length>0 && rec.storage.items.map((it:any,i:number)=>(
                  <div key={`s${i}`} className="font-mono text-[#4A4A68]">SD: {it.state||it.type||'item'} total={it.total||'-'} free={it.free||'-'}</div>
                ))}
                {Array.isArray(rec.findings) &&
                  rec.findings.slice(0, 8).map((f: any, i: number) => (
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
              {!details ? <div className="text-[#4A4A68] font-medium">Carregando...</div> : details.error ? <div className="text-[#B42318] font-semibold">{details.error}</div> : (
                <div className="grid grid-cols-1 gap-1.5 font-mono text-[11px]">
                  <div className="text-[#4A4A68]">Fabricante: <span className="text-[#1A1A2E] font-bold">{details.device?.manufacturer || '—'}</span></div>
                  <div className="text-[#4A4A68]">Modelo: <span className="text-[#1A1A2E] font-bold">{details.device?.model || '—'}</span></div>
                  <div className="text-[#4A4A68]">Firmware: <span className="text-[#1A1A2E] font-bold">{details.device?.firmware || '—'}</span></div>
                  <div className="text-[#4A4A68]">Serial: <span className="text-[#1A1A2E] font-bold">{details.device?.serial || '—'}</span></div>
                  <div className="text-[#4A4A68]">LED: {details.controls?.led?.note}</div>
                  <div className="text-[#4A4A68]">Replay: {details.controls?.recordingPlayback?.note}</div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export const CamerasTab: React.FC = () => {
  const [cameras, setCameras] = useState<CamStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCam, setActiveCam] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name:'', ip:'', username:'admin', password:'', brand:'generic', rtspPort:'554', onvifPort:'5000', mainStream:'/onvif1', subStream:'/onvif2', model:'' });

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

  const addCamera = async () => {
    setAddBusy(true); setAddMsg(null);
    try {
      const body = { ...form, rtspPort: Number(form.rtspPort)||554, onvifPort: Number(form.onvifPort)||5000 };
      const res = await fetch('/api/cameras/config', { method:'POST', headers:{ ...getAuthHeaders(), 'Content-Type':'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(()=>null);
      if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);
      setAddMsg(`Câmera adicionada: ${data?.camera?.name || form.name || form.ip}`);
      setForm({ name:'', ip:'', username:'admin', password:'', brand:form.brand, rtspPort:'554', onvifPort:'5000', mainStream:'/onvif1', subStream:'/onvif2', model:'' });
      setShowAdd(false);
      await refresh();
    } catch (e:any) { setAddMsg(e?.message || 'Falha ao adicionar câmera'); }
    finally { setAddBusy(false); }
  };

  const removeCamera = async (id: string) => {
    try {
      const res = await fetch(`/api/cameras/${encodeURIComponent(id)}/config`, { method:'DELETE', headers:getAuthHeaders() });
      const data = await res.json().catch(()=>null);
      if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);
      setConfirmDeleteId(null);
      await refresh();
    } catch (e:any) { setError(e?.message || 'Falha ao remover câmera'); }
  };

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
          <button type="button" onClick={()=>setShowAdd(v=>!v)} className="min-h-[40px] px-3.5 py-2 rounded-lg bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-y-[1px] text-[#1A1A2E] font-bold text-xs sm:text-sm cursor-pointer">{showAdd?'Fechar':'Adicionar câmera'}</button>
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

      {showAdd && (
        <div className="p-4 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-3">
          <div className="font-black font-title text-[#1A1A2E]">Adicionar câmera (RTSP/ONVIF)</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {[
              ['name','Nome'],['ip','IP *'],['username','Usuário'],['password','Senha *'],['model','Modelo'],['mainStream','Stream principal'],['subStream','Stream SD'],
            ].map(([k,l]) => (
              <label key={k} className="text-xs font-bold text-[#4A4A68]">{l}
                <input value={(form as any)[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} type={k==='password'?'password':'text'} className="mt-1 w-full min-h-[38px] px-2 rounded-lg border-2 border-[#1A1A2E] bg-[#FFF7E8] font-mono text-xs" />
              </label>
            ))}
            <label className="text-xs font-bold text-[#4A4A68]">Marca
              <select value={form.brand} onChange={e=>setForm(f=>({...f,brand:e.target.value}))} className="mt-1 w-full min-h-[38px] px-2 rounded-lg border-2 border-[#1A1A2E] bg-[#FFF7E8] font-mono text-xs">
                <option value="generic">Genérica RTSP/ONVIF</option><option value="yoosee">Yoosee</option><option value="icsee">iCSee</option><option value="v380">V380</option><option value="camhi">CamHi</option><option value="custom">Custom</option>
              </select>
            </label>
            <label className="text-xs font-bold text-[#4A4A68]">RTSP porta<input value={form.rtspPort} onChange={e=>setForm(f=>({...f,rtspPort:e.target.value}))} className="mt-1 w-full min-h-[38px] px-2 rounded-lg border-2 border-[#1A1A2E] bg-[#FFF7E8] font-mono text-xs"/></label>
            <label className="text-xs font-bold text-[#4A4A68]">ONVIF porta<input value={form.onvifPort} onChange={e=>setForm(f=>({...f,onvifPort:e.target.value}))} className="mt-1 w-full min-h-[38px] px-2 rounded-lg border-2 border-[#1A1A2E] bg-[#FFF7E8] font-mono text-xs"/></label>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <button type="button" disabled={addBusy} onClick={addCamera} className="min-h-[38px] px-3 py-2 rounded-lg bg-[#FF5A36] text-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] font-bold text-xs disabled:opacity-50">{addBusy?'Salvando...':'Salvar câmera'}</button>
            {addMsg && <div className="text-xs font-mono text-[#4A4A68]">{addMsg}</div>}
          </div>
          <div className="text-[11px] text-[#4A4A68]">Suporta RTSP/ONVIF genérico. Yoosee: ao vivo OK; PTZ/LED/SD podem exigir protocolo proprietário.</div>
        </div>
      )}

      {addMsg && !showAdd && (
        <div className="p-3 rounded-xl bg-[#D1FADF] border-2 border-[#1A1A2E] text-[#027A48] text-xs font-mono font-bold flex items-center justify-between gap-3 shadow-[3px_3px_0px_#1A1A2E]">
          <span>{addMsg}</span>
          <button type="button" onClick={() => setAddMsg(null)} className="px-2 py-0.5 rounded bg-white border border-[#1A1A2E] text-[#1A1A2E] cursor-pointer">Fechar</button>
        </div>
      )}

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
        <div className="grid grid-cols-1 gap-5">
          {cameras.map((cam) => (
            <div key={cam.id} className="space-y-2">
              <div className="flex justify-end items-center gap-2">
                {confirmDeleteId === cam.id ? (
                  <>
                    <span className="text-[11px] font-mono font-bold text-[#B42318]">Confirmar remoção?</span>
                    <button type="button" onClick={() => removeCamera(cam.id)} className="text-[11px] font-mono font-bold px-2.5 py-1 rounded border-2 border-[#1A1A2E] bg-[#F04438] text-white cursor-pointer">Sim, remover</button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-[11px] font-mono font-bold px-2.5 py-1 rounded border-2 border-[#1A1A2E] bg-white text-[#1A1A2E] cursor-pointer">Cancelar</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmDeleteId(cam.id)} className="text-[11px] font-mono px-2.5 py-1 rounded border-2 border-[#1A1A2E] bg-white hover:bg-[#FEE4E2] cursor-pointer">Remover</button>
                )}
              </div>
              <CameraCard
                cam={cam}
                onRefresh={refresh}
                active={activeCam === cam.id}
                onActivate={() => setActiveCam(cam.id)}
              />
            </div>
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

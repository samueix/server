import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, RefreshCw, Maximize2, Minimize2, WifiOff, Activity, HardDrive, Shield, AlertTriangle, Info, Film, Gamepad2, CircleStop, Volume2, VolumeX, Lightbulb } from 'lucide-react';
import { getAuthHeaders } from '../../services/authService';
import { UbuntuRoundelLogo } from '../UbuntuRoundelLogo';

interface CamStatus {
  id: string; name: string; ip: string; mac?: string; nvrEnabled?: boolean;
  mainPath: string; subPath: string; streamNameMain: string; streamNameSub: string;
  online: boolean; error: string | null; latencyMs: number | null;
}
const PtzJoystick: React.FC<{ onMove: (dir: 'up'|'down'|'left'|'right') => void; onStop: () => void; disabled?: boolean }> = ({ onMove, onStop, disabled }) => {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activeDir = useRef<string | null>(null);
  const dragging = useRef(false);
  const R = 38;
  const resolveDir = (dx: number, dy: number) => { const dead = 10; if (Math.abs(dx) < dead && Math.abs(dy) < dead) return null; if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'; return dy > 0 ? 'down' : 'up'; };
  const updateFromEvent = (clientX: number, clientY: number) => {
    const el = baseRef.current; if (!el) return;
    const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = clientX - cx, dy = clientY - cy; const dist = Math.sqrt(dx * dx + dy * dy) || 1; const clamp = Math.min(dist, R);
    dx = (dx / dist) * clamp; dy = (dy / dist) * clamp; setKnob({ x: dx, y: dy });
    const dir = resolveDir(dx, dy) as any;
    if (dir !== activeDir.current) { if (activeDir.current) onStop(); if (dir) onMove(dir); activeDir.current = dir; }
  };
  const endDrag = () => { if (!dragging.current) return; dragging.current = false; setKnob({ x: 0, y: 0 }); if (activeDir.current) { onStop(); activeDir.current = null; } };
  useEffect(() => { const mv = (e: PointerEvent) => { if (dragging.current) updateFromEvent(e.clientX, e.clientY); }; const up = () => endDrag(); window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); }; }, []);
  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={baseRef} onPointerDown={(e) => { if (disabled) return; dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); updateFromEvent(e.clientX, e.clientY); }} className={`relative w-32 h-32 rounded-full border-2 ${disabled ? 'opacity-50' : 'cursor-grab active:cursor-grabbing'} bg-[#111827] border-[#374151] select-none touch-none`} style={{ boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.45)' }}>
        <div className="absolute inset-3 rounded-full border border-[#374151]/60" />
        <div className="absolute left-1/2 top-2 -translate-x-1/2 text-[#6B7280] text-[10px]">▲</div>
        <div className="absolute left-1/2 bottom-2 -translate-x-1/2 text-[#6B7280] text-[10px]">▼</div>
        <div className="absolute top-1/2 left-2 -translate-y-1/2 text-[#6B7280] text-[10px]">◀</div>
        <div className="absolute top-1/2 right-2 -translate-y-1/2 text-[#6B7280] text-[10px]">▶</div>
        <div className="absolute left-1/2 top-1/2 w-12 h-12 -ml-6 -mt-6 rounded-full border-2 border-[#FF5A36]/50 bg-[#1F2937] flex items-center justify-center" style={{ transform: `translate(${knob.x}px, ${knob.y}px)`, boxShadow: '0 4px 10px rgba(0,0,0,0.35)' }}><div className="w-4 h-4 rounded-full bg-[#FF5A36]/80" /></div>
      </div>
      <button disabled={disabled} onClick={onStop} className="px-3 py-1.5 rounded-md bg-[#FF5A36]/15 hover:bg-[#FF5A36]/25 border border-[#FF5A36]/30 text-[#FFB4A3] text-xs flex items-center gap-1.5 disabled:opacity-50"><CircleStop size={13} /> Stop</button>
    </div>
  );
};

const CameraCard: React.FC<{ cam: CamStatus; onRefresh: () => void; active: boolean; onActivate: () => void; }> = ({ cam, onRefresh, active, onActivate }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const moveTimer = useRef<any>(null);
  const keysDown = useRef<Set<string>>(new Set());
  const reconnectTimer = useRef<any>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [liveState, setLiveState] = useState<'connecting'|'live'|'error'>('connecting');
  const liveStateRef = useRef<'connecting'|'live'|'error'>('connecting');
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rec, setRec] = useState<any>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [ptzBusy, setPtzBusy] = useState('');
  const [audioOn, setAudioOn] = useState(false);
  const [ledMsg, setLedMsg] = useState<string | null>(null);
  const setLive = (s:'connecting'|'live'|'error') => { liveStateRef.current = s; setLiveState(s); };

  const stopStream = useCallback(() => {
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    abortRef.current?.abort(); abortRef.current = null;
  }, []);

  const startStream = useCallback(async () => {
    stopStream(); setLive('connecting'); setPlayerError(null);
    const ac = new AbortController(); abortRef.current = ac;
    try {
      const res = await fetch(`${cam.subPath}/stream.mjpeg`, { headers: getAuthHeaders(), signal: ac.signal, cache: 'no-store' });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      let buf = new Uint8Array(0);
      const findSeq = (arr: Uint8Array, a: number, b: number, from = 0) => { for (let i = from; i < arr.length - 1; i++) if (arr[i] === a && arr[i + 1] === b) return i; return -1; };
      const concat = (a: Uint8Array, b: Uint8Array) => { const c = new Uint8Array(a.length + b.length); c.set(a, 0); c.set(b, a.length); return c; };
      while (!ac.signal.aborted) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        buf = concat(buf, value);
        let soi = findSeq(buf, 0xff, 0xd8);
        while (soi !== -1) {
          const eoi = findSeq(buf, 0xff, 0xd9, soi + 2);
          if (eoi === -1) { if (soi > 0) buf = buf.slice(soi); break; }
          const frame = buf.slice(soi, eoi + 2); buf = buf.slice(eoi + 2);
          const url = URL.createObjectURL(new Blob([frame], { type: 'image/jpeg' }));
          const old = objectUrlRef.current; objectUrlRef.current = url;
          if (imgRef.current) imgRef.current.src = url; if (old) URL.revokeObjectURL(old);
          if (liveStateRef.current !== 'live') setLive('live');
          soi = findSeq(buf, 0xff, 0xd8);
        }
        if (buf.length > 2_000_000) buf = buf.slice(-1_000_000);
      }
      if (!ac.signal.aborted) throw new Error('stream encerrado');
    } catch (e: any) {
      if (ac.signal.aborted) return;
      setLive('error'); setPlayerError(e?.message || 'Falha no stream ao vivo');
      reconnectTimer.current = setTimeout(() => { if (!ac.signal.aborted) startStream(); }, 1500);
    }
  }, [cam.subPath, stopStream]);

  useEffect(() => { startStream(); const onVis = () => { if (document.visibilityState === 'visible') startStream(); else stopStream(); }; document.addEventListener('visibilitychange', onVis); return () => { document.removeEventListener('visibilitychange', onVis); stopStream(); if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; } }; }, [startStream, stopStream]);

  useEffect(() => { const onFs = () => setFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', onFs); return () => document.removeEventListener('fullscreenchange', onFs); }, []);
  const toggleFullscreen = async () => { const el = containerRef.current; if (!el) return; if (!document.fullscreenElement) await el.requestFullscreen?.(); else await document.exitFullscreen?.(); };

  const doPtz = useCallback(async (action: string) => {
    if (moveTimer.current) { clearTimeout(moveTimer.current); moveTimer.current = null; }
    setPtzBusy(action);
    try {
      await fetch(`/api/cameras/${cam.id}/ptz`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ action }) });
    } finally { setPtzBusy(''); }
  }, [cam.id]);

  useEffect(() => {
    if (!active) return;
    const isTyping = (t: EventTarget | null) => { const el = t as HTMLElement | null; const tag = el?.tagName?.toLowerCase(); return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el?.isContentEditable; };
    const keyMap: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const onDown = (e: KeyboardEvent) => { if (isTyping(e.target)) return; const action = keyMap[e.key]; if (!action) return; e.preventDefault(); if (keysDown.current.has(e.key)) return; keysDown.current.add(e.key); void doPtz(action); };
    const onUp = (e: KeyboardEvent) => { const action = keyMap[e.key]; if (!action) return; e.preventDefault(); keysDown.current.delete(e.key); if (keysDown.current.size === 0) void doPtz('stop'); };
    window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); keysDown.current.clear(); };
  }, [active, doPtz]);

  const loadDetails = async () => { setDetailsOpen(v => !v); if (details) return; try { const r = await fetch(`/api/cameras/${cam.id}/details`, { headers: getAuthHeaders() }); setDetails(await r.json()); } catch (e: any) { setDetails({ ok: false, error: e?.message || String(e) }); } };
  const probeRecordings = async () => { setRecLoading(true); try { const r = await fetch(`/api/cameras/${cam.id}/recordings`, { headers: getAuthHeaders() }); setRec(await r.json()); } catch (e: any) { setRec({ ok: false, error: e?.message || String(e) }); } finally { setRecLoading(false); } };
  const toggleAudio = async () => {
    const next = !audioOn; setAudioOn(next);
    if (!audioRef.current) return;
    if (next) {
      audioRef.current.src = `/api/cameras/${cam.id}/audio.wav`;
      audioRef.current.load();
      try { await audioRef.current.play(); } catch { /* needs gesture */ }
    } else { audioRef.current.pause(); audioRef.current.removeAttribute('src'); audioRef.current.load(); }
  };
  const setLed = async (mode: 'on'|'off'|'auto') => {
    setLedMsg('...');
    try { const r = await fetch(`/api/cameras/${cam.id}/led`, { method:'POST', headers:{'Content-Type':'application/json',...getAuthHeaders()}, body: JSON.stringify({mode}) }); const d = await r.json(); setLedMsg(d.error || d.message || (d.ok ? 'OK' : 'Não suportado')); }
    catch (e:any) { setLedMsg(e?.message || 'falha'); }
  };

  return (
    <div onClick={onActivate} className={`rounded-xl border overflow-hidden ${active ? 'border-[#FF5A36]/50' : 'border-gray-700/50'} bg-gray-800/60`}>
      <div className="p-4 flex items-center justify-between gap-3 border-b border-gray-700/50">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Camera size={16} className="text-[#FF5A36]" />
            <h3 className="font-semibold text-gray-100 truncate">{cam.name}</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cam.online ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>{cam.online ? 'ONLINE' : 'OFFLINE'}</span>
            {active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF5A36]/10 text-[#FFB4A3] border border-[#FF5A36]/25">TECLADO ATIVO</span>}
          </div>
          <div className="text-xs text-gray-400 mt-1 font-mono truncate">{cam.ip} {cam.mac ? `• ${cam.mac}` : ''}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={(e)=>{e.stopPropagation(); toggleAudio();}} className={`p-2 rounded-lg border ${audioOn?'bg-[#FF5A36]/20 border-[#FF5A36]/40 text-[#FFB4A3]':'bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-700'}`} title="Áudio">{audioOn ? <Volume2 size={14}/> : <VolumeX size={14}/>}</button>
          <button onClick={(e)=>{e.stopPropagation(); startStream(); onRefresh();}} className="p-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-gray-200 border border-gray-700" title="Reconectar"><RefreshCw size={14} /></button>
          <button onClick={(e)=>{e.stopPropagation(); loadDetails();}} className="p-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-gray-200 border border-gray-700" title="Informações"><Info size={14} /></button>
          <button onClick={(e)=>{e.stopPropagation(); toggleFullscreen();}} className="p-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-gray-200 border border-gray-700" title="Tela cheia">{fullscreen ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</button>
        </div>
      </div>

      <div ref={containerRef} className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
        <img ref={imgRef} alt={cam.name} className={`w-full h-full object-contain bg-black transition-opacity duration-300 ${liveState==='live' ? 'opacity-100' : 'opacity-30'}`} />
        {liveState !== 'live' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30">
            <div className="animate-bounce"><UbuntuRoundelLogo size="lg" /></div>
            <div className="text-sm text-gray-200 font-medium">{liveState === 'connecting' ? 'Conectando à câmera...' : 'Reconectando...'}</div>
            <div className="text-[11px] text-gray-400">Iniciando stream SD, pode levar alguns segundos</div>
          </div>
        )}
        <audio ref={audioRef} />
        <div className="absolute left-3 bottom-3 flex items-center gap-2 text-[11px]">
          <span className={`px-2 py-1 rounded bg-black/60 border border-white/10 ${liveState==='live'?'text-emerald-300':'text-gray-300'}`}>{liveState==='live'?'AO VIVO':liveState==='connecting'?'CONECTANDO':'ERRO'}</span>
          <span className="px-2 py-1 rounded bg-black/60 border border-white/10 text-gray-300">SD</span>
          {audioOn && <span className="px-2 py-1 rounded bg-black/60 border border-[#FF5A36]/30 text-[#FFB4A3]">ÁUDIO</span>}
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs border-t border-gray-700/50">
        <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-3"><div className="text-gray-500 flex items-center gap-1"><Activity size={12}/> Status</div><div className={`mt-1 font-medium ${cam.online ? 'text-emerald-300':'text-red-300'}`}>{cam.online ? 'Online':'Sem sinal'}</div></div>
        <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-3"><div className="text-gray-500 flex items-center gap-1"><Camera size={12}/> Fonte</div><div className="mt-1 font-medium text-gray-200">RTSP SD</div></div>
        <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-3"><div className="text-gray-500 flex items-center gap-1"><HardDrive size={12}/> NVR</div><div className="mt-1 font-medium text-gray-200">{cam.nvrEnabled ? 'microSD':'—'}</div></div>
        <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-3"><div className="text-gray-500 flex items-center gap-1"><Shield size={12}/> Servidor</div><div className="mt-1 font-medium text-emerald-300">Sem gravação</div></div>
      </div>

      <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4">
        <div className="bg-gray-900/40 border border-gray-700/50 rounded-lg p-3">
          <div className="text-xs text-gray-300 mb-3 flex items-center gap-2"><Gamepad2 size={13} className="text-[#FF5A36]" /> PTZ</div>
          <PtzJoystick onMove={(d)=>void doPtz(d)} onStop={()=>void doPtz('stop')} disabled={!!ptzBusy} />
          <div className="text-[11px] text-gray-500 mt-3 text-center">Joystick/setas. Solte para parar.</div>
        </div>
        <div className="space-y-3">
          <div className="bg-gray-900/40 border border-gray-700/50 rounded-lg p-3">
            <div className="text-xs text-gray-300 mb-2 flex items-center gap-2"><Lightbulb size={13} className="text-[#FF5A36]"/> LED / Controles</div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={()=>setLed('on')} className="px-2 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200">LED On</button>
              <button onClick={()=>setLed('off')} className="px-2 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200">LED Off</button>
              <button onClick={()=>setLed('auto')} className="px-2 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200">Auto</button>
            </div>
            {ledMsg && <div className="text-[11px] text-gray-500 mt-2">{ledMsg}</div>}
          </div>
          <div className="bg-gray-900/40 border border-gray-700/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2"><div className="text-xs text-gray-300 flex items-center gap-2"><Film size={13} className="text-[#FF5A36]" /> Gravações microSD</div><button onClick={(e)=>{e.stopPropagation(); probeRecordings();}} className="text-[11px] px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-200">{recLoading ? 'Sondando...' : 'Sondar'}</button></div>
            {!rec && <div className="text-[11px] text-gray-500">Esta Yoosee não expõe replay ONVIF padrão. Sem endpoint de playback confirmado, não dá para exibir gravações SD no painel com segurança.</div>}
            {rec && <div className="text-[11px] text-gray-300 space-y-1 max-h-28 overflow-auto"><div className={rec.supported ? 'text-emerald-300':'text-amber-300'}>{rec.supported ? 'Suporte detectado':'Sem replay padrão detectado'}</div><div className="text-gray-500">{rec.reason}</div>{Array.isArray(rec.findings) && rec.findings.slice(0,6).map((f:any,i:number)=><div key={i} className="text-gray-500">{f.path}: {f.ok?'ok':String(f.error||'').slice(0,80)}</div>)}</div>}
          </div>
          {detailsOpen && <div className="bg-gray-900/40 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-300">
            <div className="font-medium text-gray-200 mb-2">Informações / Configs</div>
            {!details ? <div className="text-gray-500">Carregando...</div> : details.error ? <div className="text-red-300">{details.error}</div> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>Fabricante: <span className="text-gray-100">{details.device?.manufacturer||'—'}</span></div>
                <div>Modelo: <span className="text-gray-100">{details.device?.model||'—'}</span></div>
                <div>Firmware: <span className="text-gray-100">{details.device?.firmware||'—'}</span></div>
                <div>Serial: <span className="text-gray-100">{details.device?.serial||'—'}</span></div>
                <div>IP/MAC: <span className="text-gray-100">{details.camera?.ip} / {details.network?.interfaces?.[0]?.hwAddress||details.camera?.mac||'—'}</span></div>
                <div>DHCP: <span className="text-gray-100">{details.network?.interfaces?.[0]?.dhcp||'—'}</span></div>
                <div className="md:col-span-2 text-gray-500">Capacidades: {details.capabilities?.ptz?'PTZ ':''}{details.capabilities?.events?'Events ':''}{details.capabilities?.deviceIO?'DeviceIO ':''}{details.capabilities?.audio?'Audio':''}</div>
                <div className="md:col-span-2 text-gray-500">LED: {details.controls?.led?.note}</div>
                <div className="md:col-span-2 text-gray-500">Replay: {details.controls?.recordingPlayback?.note}</div>
              </div>
            )}
          </div>}
        </div>
      </div>
      {(playerError || cam.error) && <div className="px-4 pb-4"><div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-2 items-start"><AlertTriangle size={14} className="mt-0.5 shrink-0"/><div><div className="font-medium">Aviso</div><div className="text-amber-100/80 mt-0.5">{playerError || cam.error}</div></div></div></div>}
    </div>
  );
};

export const CamerasTab: React.FC = () => {
  const [cameras, setCameras] = useState<CamStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCam, setActiveCam] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try { const res = await fetch('/api/cameras', { headers: getAuthHeaders() }); const data = await res.json(); if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`); const cams = Array.isArray(data.cameras)?data.cameras:[]; setCameras(cams); setActiveCam(prev=>prev && cams.some((c:CamStatus)=>c.id===prev)?prev:(cams[0]?.id??null)); setError(data?.go2rtc?.error||null); }
    catch(e:any){ setError(e?.message || 'Falha ao carregar câmeras'); }
    finally{ setLoading(false); }
  }, []);
  useEffect(()=>{ refresh(); const id=setInterval(refresh,15000); return ()=>clearInterval(id); },[refresh]);

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-100 tracking-tight flex items-center gap-3"><Camera className="text-[#FF5A36]" /> Central de Câmeras</h2>
          <p className="text-gray-400 mt-1">Ao vivo SD (baixo consumo), PTZ, áudio e diagnóstico. Sem gravação no servidor Ubuntu.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-400 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2">Somente SD • ao vivo</div>
          <button onClick={refresh} className="px-3 py-2 rounded-lg bg-gray-800/60 hover:bg-gray-700 border border-gray-700/50 text-gray-200 text-sm flex items-center gap-2"><RefreshCw size={14}/> Atualizar</button>
        </div>
      </div>
      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl p-4 text-sm flex items-start gap-2"><WifiOff size={16} className="mt-0.5"/><div><div className="font-medium">Erro no serviço de câmera</div><div className="opacity-90">{error}</div></div></div>}
      {loading ? <div className="text-gray-400">Carregando câmeras...</div> : cameras.length===0 ? (
        <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-8 text-gray-300"><div className="font-semibold text-gray-100 mb-2">Nenhuma câmera configurada</div><div className="text-sm text-gray-400">Adicione credenciais em <code className="text-gray-200">/opt/server-panel/.camera-secrets.json</code>.</div></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">{cameras.map(cam => <CameraCard key={cam.id} cam={cam} onRefresh={refresh} active={activeCam===cam.id} onActivate={()=>setActiveCam(cam.id)} />)}</div>
      )}
      <div className="text-[11px] text-gray-500 border border-gray-700/50 rounded-xl p-3 bg-gray-800/30"><span className="font-medium text-gray-400">Notas:</span> SD fixa para estabilidade. PTZ/áudio por RTSP/ONVIF. LED e replay microSD não expostos por ONVIF padrão nesta Yoosee; UI mostra suporte real e limitações.</div>
    </div>
  );
};
export default CamerasTab;

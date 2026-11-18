import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  Activity,
  Route,
  MapPin,
  Target,
  Wifi,
  Crosshair
} from 'lucide-react';
import { fetchPingTelemetry, fetchTrace } from '../../services/api';
import { PingResponse, TraceHop } from '../../types';

type TraceStatus = 'idle' | 'running' | 'done' | 'error';

export const PingTab: React.FC = () => {
  const [data, setData] = useState<PingResponse | null>(null);
  const [history, setHistory] = useState<{ time: string; avgMs: number }[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastCheck, setLastCheck] = useState<string>('--:--:--');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedHost, setSelectedHost] = useState<string>('1.1.1.1');
  const [hops, setHops] = useState<TraceHop[]>([]);
  const [traceStatus, setTraceStatus] = useState<TraceStatus>('idle');
  const [traceLoading, setTraceLoading] = useState<boolean>(false);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [traceUpdated, setTraceUpdated] = useState<string>('--:--:--');
  const [traceReached, setTraceReached] = useState<boolean | null>(null);
  const [traceSource, setTraceSource] = useState<string>('stream');
  const [autoTrace, setAutoTrace] = useState<boolean>(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const traceAbortRef = useRef<AbortController | null>(null);
  const traceLoopRef = useRef<any>(null);
  const isBusyRef = useRef<boolean>(false);
  const traceRunIdRef = useRef<number>(0);
  const selectedHostRef = useRef<string>(selectedHost);
  const autoTraceRef = useRef<boolean>(autoTrace);

  useEffect(() => { selectedHostRef.current = selectedHost; }, [selectedHost]);
  useEffect(() => { autoTraceRef.current = autoTrace; }, [autoTrace]);

  const loadPing = async (isManual = false) => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;

    if (isManual) setRefreshing(true);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetchPingTelemetry(abortControllerRef.current.signal);
      setData(res);
      setErrorMsg(null);
      setLastCheck(new Date().toLocaleTimeString('pt-BR'));

      const sampleMs = res.average_ms !== null && res.average_ms !== undefined ? res.average_ms : 0;
      setHistory(prev => {
        const point = {
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          avgMs: sampleMs
        };
        const next = [...prev, point];
        return next.slice(-25);
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMsg(err.message || 'Falha ao medir latência do servidor.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      isBusyRef.current = false;
    }
  };

  const scheduleNextTrace = useCallback((delayMs: number) => {
    if (traceLoopRef.current) clearTimeout(traceLoopRef.current);
    traceLoopRef.current = setTimeout(() => {
      if (autoTraceRef.current && !document.hidden) {
        startTrace(selectedHostRef.current);
      } else {
        scheduleNextTrace(3000);
      }
    }, delayMs);
  }, []);

  const fallbackTrace = useCallback(async (host: string, runId: number) => {
    try {
      if (traceAbortRef.current) traceAbortRef.current.abort();
      traceAbortRef.current = new AbortController();
      const res = await fetchTrace(host, 2, traceAbortRef.current.signal);
      if (traceRunIdRef.current !== runId) return;
      setHops(res.hops || []);
      setTraceSource(res.source || 'mtr');
      setTraceReached(null);
      setTraceError(res.success ? (res.warning || null) : (res.error || 'Falha no rastreamento'));
      setTraceStatus(res.success ? 'done' : 'error');
      setTraceUpdated(new Date().toLocaleTimeString('pt-BR'));
    } catch (err: any) {
      if (traceRunIdRef.current !== runId || err?.name === 'AbortError') return;
      setTraceError(err.message || 'Falha ao executar traceroute');
      setTraceStatus('error');
    } finally {
      if (traceRunIdRef.current === runId) {
        setTraceLoading(false);
        scheduleNextTrace(6000);
      }
    }
  }, [scheduleNextTrace]);

  const startTrace = useCallback(async (host: string) => {
    if (!host) return;
    const runId = ++traceRunIdRef.current;

    if (traceLoopRef.current) { clearTimeout(traceLoopRef.current); traceLoopRef.current = null; }
    if (traceAbortRef.current) traceAbortRef.current.abort();
    traceAbortRef.current = new AbortController();

    setHops([]);
    setTraceError(null);
    setTraceReached(null);
    setTraceSource('stream');
    setTraceStatus('running');
    setTraceLoading(true);
    setTraceUpdated(new Date().toLocaleTimeString('pt-BR'));

    let gotAnyHop = false;
    let finished = false;

    const finish = (status: TraceStatus) => {
      if (traceRunIdRef.current !== runId || finished) return;
      finished = true;
      setTraceStatus(status);
      setTraceLoading(false);
      setTraceUpdated(new Date().toLocaleTimeString('pt-BR'));
      scheduleNextTrace(6000);
    };

    try {
      const resp = await fetch(`/api/trace/stream?host=${encodeURIComponent(host)}&maxHops=30`, {
        signal: traceAbortRef.current.signal,
        headers: { 'Accept': 'text/event-stream' },
        cache: 'no-store'
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handleEvent = (rawEvent: string) => {
        const lines = rawEvent.split('\n');
        let eventName = 'message';
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        const dataStr = dataLines.join('\n');
        if (!dataStr) return;
        let payload: any = null;
        try { payload = JSON.parse(dataStr); } catch { payload = null; }
        if (!payload) return;

        if (eventName === 'hop') {
          gotAnyHop = true;
          const hop = payload as TraceHop;
          setHops(prev => {
            const next = prev.filter(h => h.count !== hop.count);
            next.push(hop);
            next.sort((a, b) => a.count - b.count);
            return next;
          });
          setTraceUpdated(new Date().toLocaleTimeString('pt-BR'));
          if ((hop as any).reached) setTraceReached(true);
        } else if (eventName === 'done') {
          if (typeof payload.reached === 'boolean') setTraceReached(payload.reached);
          setTraceSource('ping (ICMP, stream)');
          finish('done');
        } else if (eventName === 'trace-error') {
          setTraceError(payload.error || 'Falha no rastreamento');
          finish('error');
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (traceRunIdRef.current !== runId) { try { reader.cancel(); } catch {} return; }
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (rawEvent.trim()) handleEvent(rawEvent);
        }
      }
      // flush restante
      if (buffer.trim() && traceRunIdRef.current === runId) handleEvent(buffer);

      if (traceRunIdRef.current === runId && !finished) {
        // stream terminou sem 'done' explícito
        if (gotAnyHop) finish('done'); else throw new Error('Stream encerrado sem dados');
      }
    } catch (err: any) {
      if (traceRunIdRef.current !== runId) return;
      if (err?.name === 'AbortError') return;
      // fallback para mtr/tracepath se stream falhar
      await fallbackTrace(host, runId);
    }
  }, [fallbackTrace, scheduleNextTrace]);

  useEffect(() => {
    loadPing(false);
    const interval = setInterval(() => {
      if (!document.hidden) loadPing(false);
    }, 4000);
    const handleVisibility = () => { if (!document.hidden) loadPing(false); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // trace loop: progressivo, roda ao mudar host e após concluir
  useEffect(() => {
    traceRunIdRef.current++;
    startTrace(selectedHost);
    const onVis = () => {
      if (!document.hidden && autoTraceRef.current && traceStatus !== 'running') {
        // se estava parado por aba oculta, retoma
        if (!traceLoopRef.current) scheduleNextTrace(1000);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      traceRunIdRef.current++;
      if (traceLoopRef.current) clearTimeout(traceLoopRef.current);
      document.removeEventListener('visibilitychange', onVis);
      if (traceAbortRef.current) traceAbortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHost]);

  // reagir a toggle de autoTrace
  useEffect(() => {
    if (autoTrace && traceStatus !== 'running' && !traceLoopRef.current) {
      scheduleNextTrace(1500);
    }
  }, [autoTrace, traceStatus, scheduleNextTrace]);

  const pingStats = React.useMemo(() => {
    if (history.length === 0) return { min: 0, max: 0, avg: 0, packetLoss: 0, samples: 0 };
    const valid = history.map(h => h.avgMs).filter(v => v > 0);
    const min = valid.length > 0 ? Math.min(...valid) : 0;
    const max = valid.length > 0 ? Math.max(...valid) : 0;
    const avg = valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
    const failedCount = history.filter(h => h.avgMs <= 0).length;
    const packetLoss = Math.round((failedCount / history.length) * 100);
    return { min, max, avg, packetLoss, samples: history.length };
  }, [history]);

  const getQualityBadge = (quality: string) => {
    switch (quality) {
      case 'EXCELENTE':
        return { bg: 'bg-[#D1FADF] border-2 border-[#1A1A2E] text-[#12B76A]', dot: 'bg-[#12B76A]' };
      case 'BOM':
        return { bg: 'bg-[#E0F2FE] border-2 border-[#1A1A2E] text-[#00A6FB]', dot: 'bg-[#00A6FB]' };
      case 'MEDIO':
        return { bg: 'bg-[#FEF0C7] border-2 border-[#1A1A2E] text-[#F79009]', dot: 'bg-[#F79009]' };
      default:
        return { bg: 'bg-[#FEE4E2] border-2 border-[#1A1A2E] text-[#F04438]', dot: 'bg-[#F04438]' };
    }
  };

  const hopTone = (hop: TraceHop) => {
    const isTimeout = hop.host === '???' || hop.loss >= 100;
    if (isTimeout) return { ring: 'border-[#F79009] bg-[#FEF0C7]', text: 'text-[#B54708]', line: '#F79009', label: 'Sem resposta' };
    if (hop.loss > 0 || hop.avg > 120) return { ring: 'border-[#F04438] bg-[#FEE4E2]', text: 'text-[#B42318]', line: '#F04438', label: 'Alto/Perda' };
    if (hop.avg > 50) return { ring: 'border-[#F79009] bg-[#FFF7E8]', text: 'text-[#B54708]', line: '#F79009', label: 'Médio' };
    return { ring: 'border-[#12B76A] bg-[#D1FADF]', text: 'text-[#027A48]', line: '#12B76A', label: 'Bom' };
  };

  const targets = data?.targets || [];
  const isTracing = traceStatus === 'running';

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* Header */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center shrink-0">
            <Route className="w-5 h-5 text-[#FF5A36]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold font-title text-[#1A1A2E]">Ping e rastreamento de rota</h2>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border-2 border-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E] ${isTracing ? 'bg-[#FEF0C7] text-[#B54708]' : 'bg-[#D1FADF] text-[#12B76A]'}`}>
                <span className={`w-2 h-2 rounded-full border border-[#1A1A2E] ${isTracing ? 'bg-[#F79009] animate-pulse' : 'bg-[#12B76A]'}`} />
                {isTracing ? 'RASTREANDO (ao vivo)' : 'ICMP/TCP real'}
              </span>
            </div>
            <p className="text-xs text-[#4A4A68] mt-0.5 font-medium">
              Traceroute progressivo: cada salto aparece assim que é descoberto, com latência real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-right hidden sm:block bg-[#FFF7E8] px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E]">
            <span className="text-[10px] text-[#4A4A68] block font-mono font-bold uppercase tracking-wider">Último ping</span>
            <span className="text-xs text-[#1A1A2E] font-mono font-bold tabular-nums">{lastCheck}</span>
          </div>
          <button
            onClick={() => { loadPing(true); startTrace(selectedHost); }}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#FF5A36] hover:bg-[#E04522] text-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-md text-xs font-bold transition disabled:opacity-50 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(refreshing || isTracing) ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-[#FEE4E2] border-2 border-[#F04438] text-[#B42318] text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {errorMsg}
        </div>
      )}

      {/* Estatísticas rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <span className="text-[10px] font-sans font-bold text-[#4A4A68] uppercase tracking-wider block">Latência média</span>
          <div className="text-xl font-mono font-black text-[#1A1A2E] mt-0.5 tabular-nums">{data?.average_ms != null ? `${data.average_ms} ms` : '--'}</div>
          <span className="text-[10px] text-[#717188] font-mono">{pingStats.samples} amostras</span>
        </div>
        <div className="p-3.5 bg-[#ECFDF3] border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <span className="text-[10px] font-sans font-bold text-[#12B76A] uppercase tracking-wider block">Melhor (mín)</span>
          <div className="text-xl font-mono font-black text-[#12B76A] mt-0.5 tabular-nums">{pingStats.min ? `${pingStats.min} ms` : '--'}</div>
          <span className="text-[10px] text-[#12B76A]/80 font-mono">menor RTT</span>
        </div>
        <div className="p-3.5 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <span className="text-[10px] font-sans font-bold text-[#F79009] uppercase tracking-wider block">Pico (máx)</span>
          <div className="text-xl font-mono font-black text-[#F79009] mt-0.5 tabular-nums">{pingStats.max ? `${pingStats.max} ms` : '--'}</div>
          <span className="text-[10px] text-[#717188] font-mono">maior RTT</span>
        </div>
        <div className="p-3.5 bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <span className="text-[10px] font-sans font-bold text-[#4A4A68] uppercase tracking-wider block">Perda (amostras)</span>
          <div className={`text-xl font-mono font-black mt-0.5 tabular-nums ${pingStats.packetLoss === 0 ? 'text-[#12B76A]' : 'text-[#F04438]'}`}>{pingStats.packetLoss}%</div>
          <span className="text-[10px] text-[#717188] font-mono">falhas recentes</span>
        </div>
      </div>

      {/* Path Trace */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b-2 border-[#1A1A2E]/10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <MapPin className="w-4 h-4 text-[#00A6FB]" />
            </div>
            <div>
              <h3 className="text-xs font-bold font-title text-[#1A1A2E]">Rota dos pacotes (traceroute ao vivo)</h3>
              <span className="text-[10px] text-[#4A4A68] font-mono">Cada salto aparece em tempo real • origem: samuelserver</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedHost}
              onChange={(e) => setSelectedHost(e.target.value)}
              className="text-xs font-mono font-semibold bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg px-2.5 py-1.5 shadow-[2px_2px_0px_#1A1A2E] focus:outline-none focus:border-[#FF5A36]"
              aria-label="Destino do traceroute"
            >
              {targets.length > 0 ? targets.map(t => (
                <option key={t.id} value={t.host}>{t.name} ({t.host})</option>
              )) : (
                <>
                  <option value="1.1.1.1">Cloudflare DNS (1.1.1.1)</option>
                  <option value="8.8.8.8">Google DNS (8.8.8.8)</option>
                  <option value="9.9.9.9">Quad9 DNS (9.9.9.9)</option>
                  <option value="192.168.100.1">Gateway Local (192.168.100.1)</option>
                </>
              )}
            </select>
            <button
              onClick={() => setAutoTrace(a => !a)}
              className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] ${autoTrace ? 'bg-[#D1FADF] text-[#027A48]' : 'bg-[#F2F4F7] text-[#4A4A68]'}`}
            >
              Auto: {autoTrace ? 'ON' : 'OFF'}
            </button>
            <span className={`text-[10px] font-mono px-2 py-1 rounded border border-[#1A1A2E] ${isTracing ? 'bg-[#FEF0C7] text-[#92400E]' : 'bg-[#FFF7E8] text-[#4A4A68]'}`}>
              {isTracing ? `Rastreando... ${hops.length} salto(s)` : `Atualizado: ${traceUpdated}`}
            </span>
          </div>
        </div>

        {traceError && (
          <div className="p-2.5 rounded-lg bg-[#FEF0C7] border-2 border-[#F79009] text-[#92400E] text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {traceError}
          </div>
        )}

        {/* Mapa visual da rota */}
        <div className="relative rounded-xl border-2 border-[#1A1A2E] bg-[#FFF7E8]/50 p-4 sm:p-5 overflow-x-auto">
          {traceLoading && hops.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-[#4A4A68] font-mono text-xs gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[#FF5A36]" />
              <span>Iniciando rastreamento até {selectedHost}...</span>
              <span className="text-[10px]">Os saltos aparecerão conforme forem descobertos</span>
            </div>
          ) : hops.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-[#4A4A68]">Nenhum salto retornado. Tente atualizar o rastreamento.</div>
          ) : (
            <div className="min-w-[320px]">
              {/* origem */}
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center w-10 shrink-0">
                  <div className="w-9 h-9 rounded-full bg-[#FF5A36] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center z-10">
                    <Server className="w-4 h-4 text-white" />
                  </div>
                  <div className="w-1 h-6 bg-[#1A1A2E]/30 relative overflow-hidden">
                    <div className="absolute left-0 right-0 h-3 bg-[#00A6FB] rounded-sm animate-bounce" style={{ animationDuration: '1.2s' }} />
                  </div>
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-xs font-bold text-[#1A1A2E]">Origem • samuelserver</div>
                  <div className="text-[11px] font-mono text-[#4A4A68]">Este servidor → destino {selectedHost}</div>
                </div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-[#1A1A2E] ${isTracing ? 'bg-[#FEF0C7] text-[#92400E]' : 'bg-[#D1FADF] text-[#027A48]'}`}>
                  {isTracing ? 'EM ROTA' : traceReached ? 'ALCANÇADO' : 'CONCLUÍDO'}
                </span>
              </div>

              {/* saltos */}
              {hops.map((hop, idx) => {
                const tone = hopTone(hop);
                const isLast = idx === hops.length - 1;
                const isDest = hop.host === selectedHost || (traceReached === true && isLast && hop.host !== '???');
                const isTimeout = hop.host === '???' || hop.loss >= 100;
                const showPulse = isLast && isTracing;
                return (
                  <div key={`${hop.count}-${idx}`} className="flex items-stretch gap-3">
                    <div className="flex flex-col items-center w-10 shrink-0">
                      <div className={`w-9 h-9 rounded-full border-2 ${tone.ring} shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center z-10 relative transition-all`}>
                        {isDest ? <Target className="w-4 h-4 text-[#1A1A2E]" /> : <span className="text-[11px] font-mono font-black text-[#1A1A2E]">{hop.count}</span>}
                        {(!isTimeout || showPulse) && (
                          <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#1A1A2E] ${showPulse ? 'bg-[#00A6FB]' : 'bg-[#12B76A]'} animate-ping`} style={{ animationDuration: `${1.5 + idx * 0.1}s` }} />
                        )}
                      </div>
                      {(!isLast || isTracing) && (
                        <div className="w-1 flex-1 min-h-[28px] bg-[#1A1A2E]/20 relative overflow-hidden">
                          <div className="absolute left-0 right-0 h-3 rounded-sm" style={{ backgroundColor: tone.line, animation: `trace-packet 1.4s linear infinite`, animationDelay: `${idx * 0.15}s`, opacity: 0.9 }} />
                        </div>
                      )}
                    </div>
                    <div className={`flex-1 ${(!isLast || isTracing) ? 'pb-3' : ''}`}>
                      <div className={`p-2.5 rounded-lg border-2 border-[#1A1A2E] bg-white shadow-[2px_2px_0px_#1A1A2E] ${isDest ? 'ring-2 ring-[#FF5A36] ring-offset-1' : ''}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-[#1A1A2E]">Salto {hop.count}</span>
                              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-[#1A1A2E] ${tone.ring} ${tone.text}`}>{isTimeout ? 'TIMEOUT' : tone.label}</span>
                              {isDest && <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-[#1A1A2E] bg-[#FF5A36] text-white">DESTINO</span>}
                              {showPulse && <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-[#1A1A2E] bg-[#00A6FB] text-white">NOVO</span>}
                            </div>
                            <div className="text-[11px] font-mono font-semibold text-[#4A4A68] break-all mt-0.5">{isTimeout ? '* * * (sem resposta neste salto)' : hop.host}</div>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] font-mono shrink-0">
                            <div className="text-right">
                              <div className="text-[#4A4A68] text-[10px]">latência</div>
                              <div className="font-bold text-[#1A1A2E] tabular-nums">{isTimeout ? '--' : `${(hop.avg || hop.last || 0).toFixed(1)} ms`}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[#4A4A68] text-[10px]">último</div>
                              <div className="font-bold text-[#1A1A2E] tabular-nums">{isTimeout ? '--' : `${(hop.last || hop.avg || 0).toFixed(1)} ms`}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[#4A4A68] text-[10px]">perda</div>
                              <div className={`font-bold tabular-nums ${hop.loss > 0 ? 'text-[#F04438]' : 'text-[#12B76A]'}`}>{Math.round(hop.loss)}%</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {isTracing && (
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex flex-col items-center w-10 shrink-0">
                    <div className="w-9 h-9 rounded-full border-2 border-dashed border-[#00A6FB] bg-[#E0F2FE] flex items-center justify-center">
                      <RefreshCw className="w-4 h-4 text-[#00A6FB] animate-spin" />
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-[#026AA2] font-semibold">Aguardando próximo salto...</div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-[#4A4A68] flex-wrap gap-2">
          <span className="flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5 text-[#12B76A]" /> Sondagem ICMP progressiva (TTL incremental, em tempo real)</span>
          <span>Fonte: <strong className="text-[#1A1A2E]">{traceSource}</strong>{isTracing ? ' • em andamento...' : traceReached === true ? ' • destino alcançado' : ''}</span>
        </div>
      </div>

      {/* Tabela detalhada de saltos */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5">
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E]/10 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-[#FF5A36]" />
            </div>
            <h3 className="text-xs font-bold font-title text-[#1A1A2E]">Detalhes por salto (RTT real)</h3>
          </div>
          <span className="text-xs font-mono font-bold text-[#1A1A2E] bg-[#FFF7E8] px-2.5 py-0.5 rounded-full border border-[#1A1A2E] tabular-nums">{hops.length} salto(s){isTracing ? '...' : ''}</span>
        </div>
        <div className="overflow-x-auto border-2 border-[#1A1A2E] rounded-lg">
          <table className="w-full text-left text-xs text-[#1A1A2E]">
            <thead className="bg-[#FFF7E8] text-[#1A1A2E] border-b-2 border-[#1A1A2E] font-sans font-bold">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Host / IP</th>
                <th className="py-2.5 px-3 text-right">Perda</th>
                <th className="py-2.5 px-3 text-right">Último</th>
                <th className="py-2.5 px-3 text-right">Média</th>
                <th className="py-2.5 px-3 text-right">Melhor</th>
                <th className="py-2.5 px-3 text-right">Pior</th>
                <th className="py-2.5 px-3 text-right">Desvio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A2E]/20 font-mono bg-white">
              {hops.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-[#4A4A68] font-sans font-semibold">{traceLoading ? 'Rastreando...' : 'Sem dados de rota.'}</td></tr>
              ) : hops.map((h, i) => {
                const isTimeout = h.host === '???' || h.loss >= 100;
                return (
                  <tr key={i} className="hover:bg-[#FFF7E8]/50 transition">
                    <td className="py-2.5 px-3 font-bold">{h.count}</td>
                    <td className="py-2.5 px-3 font-semibold break-all">{isTimeout ? '* * *' : h.host}</td>
                    <td className={`py-2.5 px-3 text-right font-bold ${h.loss > 0 ? 'text-[#F04438]' : 'text-[#12B76A]'}`}>{Math.round(h.loss)}%</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{isTimeout ? '--' : (h.last || h.avg || 0).toFixed(1)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold">{isTimeout ? '--' : (h.avg || h.last || 0).toFixed(1)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-[#12B76A]">{isTimeout ? '--' : (h.best || h.avg || h.last || 0).toFixed(1)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-[#F79009]">{isTimeout ? '--' : (h.wrst || h.avg || h.last || 0).toFixed(1)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-[#4A4A68]">{isTimeout ? '--' : (h.stdev || 0).toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alvos de ping */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5">
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E]/10 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <Crosshair className="w-3.5 h-3.5 text-[#FF5A36]" />
            </div>
            <h3 className="text-xs font-bold font-title text-[#1A1A2E]">Alvos de ping (RTT direto)</h3>
          </div>
          <span className="text-xs font-mono font-bold text-[#1A1A2E] bg-[#FFF7E8] px-2.5 py-0.5 rounded-full border border-[#1A1A2E] tabular-nums">{targets.length} destinos</span>
        </div>
        <div className="overflow-x-auto border-2 border-[#1A1A2E] rounded-lg">
          <table className="w-full text-left text-xs text-[#1A1A2E]">
            <thead className="bg-[#FFF7E8] border-b-2 border-[#1A1A2E] font-sans font-bold">
              <tr>
                <th className="py-2.5 px-3">Serviço / alvo</th>
                <th className="py-2.5 px-3">Endereço</th>
                <th className="py-2.5 px-3">Tipo</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Latência</th>
                <th className="py-2.5 px-3 text-right">Qualidade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A2E]/20 font-mono bg-white">
              {targets.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-[#4A4A68] font-sans font-semibold">{loading ? 'Medindo...' : 'Sem alvos.'}</td></tr>
              ) : targets.map((t) => {
                const badge = getQualityBadge(t.quality);
                return (
                  <tr key={t.id} className="hover:bg-[#FFF7E8]/50 transition">
                    <td className="py-2.5 px-3 font-bold font-sans">{t.name}</td>
                    <td className="py-2.5 px-3 text-[#4A4A68] font-semibold tabular-nums">{t.host}</td>
                    <td className="py-2.5 px-3 font-sans"><span className={`text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold border border-[#1A1A2E] ${t.type === 'local' ? 'bg-[#D1FADF] text-[#12B76A]' : 'bg-[#FFF7E8] text-[#1A1A2E]'}`}>{t.type === 'local' ? 'Rede local' : 'Internet'}</span></td>
                    <td className="py-2.5 px-3 font-sans">
                      {t.status === 'ONLINE' ? (
                        <span className="inline-flex items-center gap-1.5 text-[#12B76A] font-bold text-xs"><CheckCircle2 className="w-4 h-4" />Online</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[#F04438] font-bold text-xs"><AlertTriangle className="w-4 h-4" />Inacessível</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold tabular-nums">{t.pingMs != null ? `${t.pingMs} ms` : '--'}</td>
                    <td className="py-2.5 px-3 text-right font-sans">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold shadow-[1px_1px_0px_#1A1A2E] ${badge.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full border border-[#1A1A2E] ${badge.dot}`} />{t.quality}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

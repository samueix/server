import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Clock, Activity } from 'lucide-react';
import { getAuthHeaders } from '../services/authService';

interface HistoryPoint { ts: number; deltaQueries: number; deltaBlocked: number; }
interface DualQueryChartProps {
  height?: number;
}

const MIN_MS = 60 * 1000;
const MAX_WINDOW_MS = 7 * 24 * 3600 * 1000;

export const DualQueryChart: React.FC<DualQueryChartProps> = ({ height = 170 }) => {
  const now0 = Date.now();
  const [windowStart, setWindowStart] = useState<number>(now0 - MAX_WINDOW_MS);
  const [windowEnd, setWindowEnd] = useState<number>(now0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [drag, setDrag] = useState<null | { mode: 'start' | 'end' | 'pan'; originX: number; start0: number; end0: number }>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/adguard/history?from=${Math.floor(windowStart)}&to=${Math.floor(windowEnd)}`, { headers: { ...getAuthHeaders() } });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && Array.isArray(data.points)) setHistory(data.points);
      } catch {}
    };
    load();
    const id = setInterval(load, 60000);
    return () => { mounted = false; clearInterval(id); };
  }, [windowStart, windowEnd]);

  const { normalizedAllowed, normalizedBlocked, length, bucketDates } = useMemo(() => {
    const smooth = (arr: number[]) => arr.map((_, i) => {
      const w = 2; let sum=0, c=0;
      for (let j=Math.max(0,i-w); j<=Math.min(arr.length-1,i+w); j++){ sum+=arr[j]; c++; }
      return c ? sum/c : arr[i];
    });
    const rawA = history.map(p => Math.max(0, Number(p.deltaQueries || 0) - Number(p.deltaBlocked || 0)));
    const rawB = history.map(p => Math.max(0, Number(p.deltaBlocked || 0)));
    const a = smooth(rawA);
    const b = smooth(rawB);
    const dates = history.map(p => new Date(Number(p.ts) || Date.now()));
    return { normalizedAllowed: a, normalizedBlocked: b, length: a.length || 1, bucketDates: dates };
  }, [history]);

  const statsAllowed = useMemo(() => {
    const cur = normalizedAllowed[normalizedAllowed.length - 1] ?? 0;
    const min = normalizedAllowed.length > 0 ? Math.min(...normalizedAllowed) : 0;
    const max = normalizedAllowed.length > 0 ? Math.max(...normalizedAllowed) : 0;
    const sum = normalizedAllowed.reduce((acc, v) => acc + v, 0);
    return { cur, min, max, sum };
  }, [normalizedAllowed]);

  const statsBlocked = useMemo(() => {
    const cur = normalizedBlocked[normalizedBlocked.length - 1] ?? 0;
    const min = normalizedBlocked.length > 0 ? Math.min(...normalizedBlocked) : 0;
    const max = normalizedBlocked.length > 0 ? Math.max(...normalizedBlocked) : 0;
    const sum = normalizedBlocked.reduce((acc, v) => acc + v, 0);
    return { cur, min, max, sum };
  }, [normalizedBlocked]);

  const timeLabels = useMemo(() => {
    const markers: { pct: number; label: string }[] = [];
    if (length <= 0) return markers;
    const steps = [0, 0.25, 0.5, 0.75, 1];
    const sameDay = new Date(windowStart).toDateString() === new Date(windowEnd).toDateString();
    const fmt = (d: Date) => sameDay
      ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    steps.forEach((pct) => {
      const idx = Math.min(length - 1, Math.max(0, Math.round(pct * (length - 1))));
      const d = bucketDates[idx];
      markers.push({ pct, label: d ? fmt(d) : '' });
    });
    return markers;
  }, [length, bucketDates, windowStart, windowEnd]);

  const { allowedPath, blockedPath, allowedCoords, blockedCoords, maxVal, width } = useMemo(() => {
    const svgWidth = 800;
    const paddingY = 12;
    const effectiveHeight = height - paddingY * 2;

    const allValues = [...normalizedAllowed, ...normalizedBlocked];
    let computedMax = allValues.length > 0 ? Math.max(...allValues) : 10;
    if (computedMax <= 0) computedMax = 10;
    computedMax = Math.ceil(computedMax * 1.12);
    const computedMin = 0;
    const range = computedMax - computedMin || 1;

    const toCoords = (series: number[]): [number, number][] => {
      if (series.length === 0) return [];
      return series.map((val, idx) => {
        const x = (idx / Math.max(1, series.length - 1)) * svgWidth;
        const normalized = Math.max(0, Math.min(1, (val - computedMin) / range));
        const y = height - paddingY - normalized * effectiveHeight;
        return [x, y];
      });
    };

    const aCoords = toCoords(normalizedAllowed);
    const bCoords = toCoords(normalizedBlocked);

    const generateBezierPath = (coords: [number, number][]): string => {
      if (coords.length <= 1) return coords.length === 1 ? `M 0 ${coords[0][1]} L ${svgWidth} ${coords[0][1]}` : '';
      if (coords.length === 2) return `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)} L ${coords[1][0].toFixed(1)} ${coords[1][1].toFixed(1)}`;
      let path = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
      for (let i = 0; i < coords.length - 1; i++) {
        const p0 = coords[Math.max(0, i - 1)];
        const p1 = coords[i];
        const p2 = coords[i + 1];
        const p3 = coords[Math.min(coords.length - 1, i + 2)];
        const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
        const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
        const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
        const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
        path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
      }
      return path;
    };

    return {
      allowedPath: generateBezierPath(aCoords),
      blockedPath: generateBezierPath(bCoords),
      allowedCoords: aCoords,
      blockedCoords: bCoords,
      maxVal: computedMax,
      width: svgWidth
    };
  }, [normalizedAllowed, normalizedBlocked, height]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const xRatio = Math.max(0, Math.min(1, relativeX / rect.width));
    const idx = Math.round(xRatio * (length - 1));
    setHoverIndex(idx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const fmtFull = (ts: number) => new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const rangeLabel = `${fmtFull(windowStart)} → ${fmtFull(windowEnd)} (1 min)`;

  const hoverTimeInfo = useMemo(() => {
    if (hoverIndex === null) return null;
    const d = bucketDates[hoverIndex];
    if (!d) return null;
    const hourFormatted = d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return { hourFormatted, relativeLabel: '' };
  }, [hoverIndex, bucketDates]);

  const hoverAllowed = hoverIndex !== null ? (normalizedAllowed[hoverIndex] ?? 0) : null;
  const hoverBlocked = hoverIndex !== null ? (normalizedBlocked[hoverIndex] ?? 0) : null;
  const hoverTotal = hoverAllowed !== null && hoverBlocked !== null ? (hoverAllowed + hoverBlocked) : null;
  const hoverBlockedPercent = hoverTotal && hoverTotal > 0 ? ((hoverBlocked! / hoverTotal) * 100).toFixed(1) : '0.0';
  const hoverXPercent = hoverIndex !== null ? (hoverIndex / Math.max(1, length - 1)) * 100 : 0;

  const clampWindow = (sMs: number, eMs: number) => {
    const now = Date.now();
    let e = Math.min(now, eMs);
    let s = Math.max(now - MAX_WINDOW_MS, sMs);
    if (e - s < MIN_MS) {
      if (eMs !== windowEnd) e = s + MIN_MS;
      else s = e - MIN_MS;
    }
    if (e > now) { s -= e - now; e = now; }
    if (s < now - MAX_WINDOW_MS) { e += (now - MAX_WINDOW_MS - s); s = now - MAX_WINDOW_MS; }
    s = Math.max(now - MAX_WINDOW_MS, Math.min(s, e - MIN_MS));
    e = Math.min(now, Math.max(e, s + MIN_MS));
    return { s, e };
  };

  const onSliderPointerDown = (mode: 'start' | 'end' | 'pan') => (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    setDrag({ mode, originX: ev.clientX, start0: windowStart, end0: windowEnd });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (ev: PointerEvent) => {
      const rect = sliderRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const total = MAX_WINDOW_MS;
      const dxMs = ((ev.clientX - drag.originX) / rect.width) * total;
      let s = drag.start0; let e = drag.end0;
      if (drag.mode === 'pan') { s = drag.start0 + dxMs; e = drag.end0 + dxMs; }
      if (drag.mode === 'start') s = drag.start0 + dxMs;
      if (drag.mode === 'end') e = drag.end0 + dxMs;
      const c = clampWindow(s, e);
      setWindowStart(c.s); setWindowEnd(c.e);
    };
    const onUp = () => setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [drag, windowStart, windowEnd]);

  const nowTs = Date.now();
  const sliderMin = nowTs - MAX_WINDOW_MS;
  const leftPct = ((windowStart - sliderMin) / MAX_WINDOW_MS) * 100;
  const rightPct = ((windowEnd - sliderMin) / MAX_WINDOW_MS) * 100;

  return (
    <div className="w-full flex flex-col font-sans select-none">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono mb-2 pb-2 border-b-2 border-[#1A1A2E]/20">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 rounded-sm bg-[#12B76A]" />
            <span className="text-[#12B76A] font-bold">Permitidas</span>
            <span className="text-xs text-[#4A4A68] tabular-nums font-semibold">
              {hoverAllowed !== null ? `(${hoverAllowed.toLocaleString()})` : `(soma: ${statsAllowed.sum.toLocaleString()} | pico: ${statsAllowed.max.toLocaleString()})`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 rounded-sm bg-[#F04438]" />
            <span className="text-[#F04438] font-bold">Bloqueadas</span>
            <span className="text-xs text-[#4A4A68] tabular-nums font-semibold">
              {hoverBlocked !== null ? `(${hoverBlocked.toLocaleString()})` : `(soma: ${statsBlocked.sum.toLocaleString()} | pico: ${statsBlocked.max.toLocaleString()})`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {hoverTimeInfo ? (
            <span className="text-[#1A1A2E] bg-white px-2.5 py-1 rounded-md border-2 border-[#1A1A2E] text-[11px] font-mono font-bold flex items-center gap-1 shadow-[1.5px_1.5px_0px_#1A1A2E] max-w-[260px] truncate">
              <Clock className="w-3.5 h-3.5 text-[#FF5A36] shrink-0" />
              <span className="truncate">{hoverTimeInfo.hourFormatted}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[#4A4A68] text-[11px] font-mono font-semibold">
              <Activity className="w-3.5 h-3.5 text-[#12B76A]" />
              <span className="truncate max-w-[360px]">{rangeLabel}</span>
            </span>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="w-full relative overflow-hidden rounded-lg bg-[#FFF7E8]/70 border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] cursor-crosshair"
        style={{ height: `${height}px` }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
          <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="#1A1A2E" strokeOpacity="0.1" strokeDasharray="3 3" strokeWidth="1" />
          <line x1="0" y1={height * 0.50} x2={width} y2={height * 0.50} stroke="#1A1A2E" strokeOpacity="0.1" strokeDasharray="3 3" strokeWidth="1" />
          <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="#1A1A2E" strokeOpacity="0.1" strokeDasharray="3 3" strokeWidth="1" />

          {allowedPath && <path d={`${allowedPath} L ${width} ${height} L 0 ${height} Z`} fill="#12B76A" fillOpacity="0.12" stroke="none" />}
          {blockedPath && <path d={`${blockedPath} L ${width} ${height} L 0 ${height} Z`} fill="#F04438" fillOpacity="0.10" stroke="none" />}
          {allowedPath && <path d={allowedPath} fill="none" stroke="#12B76A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
          {blockedPath && <path d={blockedPath} fill="none" stroke="#F04438" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}

          {hoverIndex !== null && allowedCoords[hoverIndex] && blockedCoords[hoverIndex] && (
            <g>
              <line x1={allowedCoords[hoverIndex][0]} y1={0} x2={allowedCoords[hoverIndex][0]} y2={height} stroke="#1A1A2E" strokeWidth="1.5" strokeDasharray="3 3" />
              <circle cx={allowedCoords[hoverIndex][0]} cy={allowedCoords[hoverIndex][1]} r="4" fill="#12B76A" stroke="#1A1A2E" strokeWidth="1.5" />
              <circle cx={blockedCoords[hoverIndex][0]} cy={blockedCoords[hoverIndex][1]} r="4" fill="#F04438" stroke="#1A1A2E" strokeWidth="1.5" />
            </g>
          )}
        </svg>

        <div className="absolute right-2 top-1 text-[11px] font-mono font-bold text-[#4A4A68] pointer-events-none tabular-nums">{maxVal.toLocaleString()}</div>
        <div className="absolute right-2 bottom-1 text-[11px] font-mono font-bold text-[#4A4A68] pointer-events-none tabular-nums">0</div>

        {hoverIndex !== null && hoverTimeInfo && (
          <div
            className="absolute pointer-events-none z-20 top-2 transition-all duration-75"
            style={{
              left: `${hoverXPercent}%`,
              transform: hoverXPercent < 20 ? 'translateX(8px)' : hoverXPercent > 80 ? 'translateX(calc(-100% - 8px))' : 'translateX(-50%)'
            }}
          >
            <div className="bg-white border-2 border-[#1A1A2E] rounded-lg p-2.5 shadow-[4px_4px_0px_#1A1A2E] text-xs font-mono min-w-[210px]">
              <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b-2 border-[#1A1A2E]">
                <span className="font-bold text-[#1A1A2E] capitalize">{hoverTimeInfo.hourFormatted}</span>
                {hoverTimeInfo.relativeLabel && <span className="text-[11px] font-semibold text-[#4A4A68]">{hoverTimeInfo.relativeLabel}</span>}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[#12B76A] tabular-nums font-semibold"><span className="text-[#4A4A68]">Permitidas:</span><span>{hoverAllowed?.toLocaleString()}</span></div>
                <div className="flex items-center justify-between text-[#F04438] tabular-nums font-semibold"><span className="text-[#4A4A68]">Bloqueadas:</span><span>{hoverBlocked?.toLocaleString()}</span></div>
                <div className="flex items-center justify-between pt-1 border-t border-[#1A1A2E]/20 text-[11px] text-[#4A4A68] tabular-nums font-semibold"><span>Total: <strong className="text-[#1A1A2E]">{hoverTotal?.toLocaleString()}</strong></span><span className="text-[#F04438]">{hoverBlockedPercent}%</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono font-medium text-[#4A4A68] mt-1.5 px-1 gap-1">
        {timeLabels.map((tl, i) => (
          <span key={i} className={hoverIndex !== null && Math.abs(hoverXPercent / 100 - tl.pct) < 0.12 ? 'text-[#1A1A2E] font-bold' : ''}>{tl.label}</span>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t-2 border-[#1A1A2E]/10">
        <div className="flex items-center justify-between text-[11px] font-mono font-bold text-[#4A4A68] mb-1.5">
          <span>Janela de tempo (1 min)</span>
          <span className="text-[#1A1A2E]">{fmtFull(windowStart)} — {fmtFull(windowEnd)}</span>
        </div>
        <div ref={sliderRef} className="relative h-8 rounded-md border-2 border-[#1A1A2E] bg-[#FFF7E8] shadow-[1px_1px_0px_#1A1A2E] overflow-hidden touch-none">
          <div className="absolute inset-y-0 bg-[#1A1A2E]/5" style={{ left: 0, width: `${leftPct}%` }} />
          <div className="absolute inset-y-0 bg-[#1A1A2E]/5" style={{ left: `${rightPct}%`, right: 0 }} />
          <div className="absolute top-1/2 h-2 -mt-1 rounded-full bg-[#FF5A36]/25 border border-[#FF5A36]/60" style={{ left: `${leftPct}%`, width: `${Math.max(0.5, rightPct-leftPct)}%` }} onPointerDown={onSliderPointerDown('pan')} title="Arraste para mover a janela" />
          <div className="absolute top-1/2 w-4 h-4 -ml-2 -mt-2 rounded-full cursor-ew-resize bg-[#FF5A36] border-2 border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E]" style={{ left: `${leftPct}%` }} onPointerDown={onSliderPointerDown('start')} title="Início" />
          <div className="absolute top-1/2 w-4 h-4 -ml-2 -mt-2 rounded-full cursor-ew-resize bg-[#FF5A36] border-2 border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E]" style={{ left: `${rightPct}%` }} onPointerDown={onSliderPointerDown('end')} title="Fim" />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-[#4A4A68] mt-1">
          <span>{fmtFull(sliderMin)}</span>
          <span>{fmtFull(nowTs)}</span>
        </div>
      </div>
    </div>
  );
};

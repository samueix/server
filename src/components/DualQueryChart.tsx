import React, { useState, useMemo, useRef } from 'react';
import { Clock, Activity } from 'lucide-react';

interface DualQueryChartProps {
  allowedData: number[];
  blockedData: number[];
  totalData?: number[];
  height?: number;
  timeUnits?: string;
  defaultTimeRange?: '24h' | '48h' | '7d' | 'by_day';
}

type RangeKey = '24h' | '48h' | '7d' | 'by_day';

export const DualQueryChart: React.FC<DualQueryChartProps> = ({
  allowedData,
  blockedData,
  height = 140,
  defaultTimeRange = '24h'
}) => {
  const [timeRange, setTimeRange] = useState<RangeKey>(defaultTimeRange);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const rawLength = Math.max(allowedData.length, blockedData.length, 0);
  const fullAllowed = useMemo(() => {
    return Array.from({ length: rawLength }, (_, i) => {
      const v = allowedData[i];
      return v !== undefined && !isNaN(v) ? Math.max(0, v) : 0;
    });
  }, [allowedData, rawLength]);

  const fullBlocked = useMemo(() => {
    return Array.from({ length: rawLength }, (_, i) => {
      const v = blockedData[i];
      return v !== undefined && !isNaN(v) ? Math.max(0, v) : 0;
    });
  }, [blockedData, rawLength]);

  const { normalizedAllowed, normalizedBlocked, length, bucketDates } = useMemo(() => {
    // data is hourly, oldest -> newest; last element ~ current hour
    const sliceLast = (arr: number[], n: number) => (n >= arr.length ? arr.slice() : arr.slice(arr.length - n));

    if (timeRange === 'by_day') {
      // aggregate into daily buckets (oldest->newest), up to 7 days
      const totalHours = fullAllowed.length;
      const days: number[][] = [];
      const bDays: number[][] = [];
      const dateBuckets: Date[] = [];
      const now = new Date();
      const dayCount = Math.max(1, Math.ceil(totalHours / 24));
      const startIdx = Math.max(0, totalHours - dayCount * 24);
      for (let d = 0; d < dayCount; d++) {
        const sIdx = startIdx + d * 24;
        const eIdx = Math.min(totalHours, sIdx + 24);
        if (sIdx >= totalHours) break;
        days.push(fullAllowed.slice(sIdx, eIdx));
        bDays.push(fullBlocked.slice(sIdx, eIdx));
        const hoursFromEnd = totalHours - eIdx; // how many hours after this bucket end to now
        const bucketEnd = new Date(now.getTime() - hoursFromEnd * 3600 * 1000);
        dateBuckets.push(bucketEnd);
      }
      const a = days.map(g => g.reduce((s, v) => s + v, 0));
      const b = bDays.map(g => g.reduce((s, v) => s + v, 0));
      // keep last 7 days
      const trim = 7;
      const aa = a.length > trim ? a.slice(a.length - trim) : a;
      const bb = b.length > trim ? b.slice(b.length - trim) : b;
      const dd = dateBuckets.length > trim ? dateBuckets.slice(dateBuckets.length - trim) : dateBuckets;
      return { normalizedAllowed: aa, normalizedBlocked: bb, length: aa.length || 1, bucketDates: dd };
    }

    let n = 24;
    if (timeRange === '48h') n = 48;
    if (timeRange === '7d') n = 168;
    const a = sliceLast(fullAllowed, n);
    const b = sliceLast(fullBlocked, n);
    const now = new Date();
    const dates = a.map((_, i) => new Date(now.getTime() - (a.length - 1 - i) * 3600 * 1000));
    return { normalizedAllowed: a, normalizedBlocked: b, length: a.length || 1, bucketDates: dates };
  }, [fullAllowed, fullBlocked, timeRange]);

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
    const fmtDay = (d: Date) => d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }).replace('.', '');
    const fmtHour = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const fmtDayHour = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + fmtHour(d);

    steps.forEach((pct) => {
      const idx = Math.min(length - 1, Math.max(0, Math.round(pct * (length - 1))));
      const d = bucketDates[idx];
      if (!d) { markers.push({ pct, label: '' }); return; }
      if (timeRange === 'by_day') {
        markers.push({ pct, label: fmtDay(d) });
      } else if (timeRange === '24h') {
        markers.push({ pct, label: fmtHour(d) });
      } else {
        markers.push({ pct, label: fmtDayHour(d) });
      }
    });
    return markers;
  }, [timeRange, length, bucketDates]);

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
      if (coords.length <= 1) {
        return coords.length === 1 ? `M 0 ${coords[0][1]} L ${svgWidth} ${coords[0][1]}` : '';
      }
      if (coords.length === 2) {
        return `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)} L ${coords[1][0].toFixed(1)} ${coords[1][1].toFixed(1)}`;
      }
      let path = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
      const tension = 0.22;
      for (let i = 0; i < coords.length - 1; i++) {
        const p0 = coords[Math.max(0, i - 1)];
        const p1 = coords[i];
        const p2 = coords[i + 1];
        const p3 = coords[Math.min(coords.length - 1, i + 2)];
        const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
        const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
        const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
        const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
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
    setMousePos({ x: relativeX, y: e.clientY - rect.top });
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
    setMousePos(null);
  };

  const rangeLabel = timeRange === '24h' ? 'Últimas 24h' : timeRange === '48h' ? 'Últimas 48h' : timeRange === '7d' ? 'Últimos 7 dias (por hora)' : 'Por dia (últimos 7 dias)';

  const hoverTimeInfo = useMemo(() => {
    if (hoverIndex === null) return null;
    const d = bucketDates[hoverIndex];
    if (!d) return null;
    if (timeRange === 'by_day') {
      const day = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
      return { hourFormatted: day, relativeLabel: hoverIndex === length - 1 ? 'Hoje/último dia' : '' };
    }
    const hourFormatted = d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const hoursAgo = (length - 1) - hoverIndex;
    const relativeLabel = hoursAgo === 0 ? 'Agora' : (timeRange === '24h' ? `Há ${hoursAgo}h` : `Há ${hoursAgo}h`);
    return { hourFormatted, relativeLabel };
  }, [hoverIndex, length, timeRange, bucketDates]);

  const hoverAllowed = hoverIndex !== null ? (normalizedAllowed[hoverIndex] ?? 0) : null;
  const hoverBlocked = hoverIndex !== null ? (normalizedBlocked[hoverIndex] ?? 0) : null;
  const hoverTotal = hoverAllowed !== null && hoverBlocked !== null ? (hoverAllowed + hoverBlocked) : null;
  const hoverBlockedPercent = hoverTotal && hoverTotal > 0 ? ((hoverBlocked! / hoverTotal) * 100).toFixed(1) : '0.0';
  const hoverXPercent = hoverIndex !== null ? (hoverIndex / Math.max(1, length - 1)) * 100 : 0;

  const btn = (key: RangeKey, label: string) => (
    <button
      key={key}
      onClick={() => setTimeRange(key)}
      className={`px-2.5 py-0.5 rounded font-bold transition whitespace-nowrap ${
        timeRange === key
          ? 'bg-[#FF5A36] text-white shadow-[1px_1px_0px_#1A1A2E]'
          : 'text-[#1A1A2E] hover:bg-white'
      }`}
    >
      {label}
    </button>
  );

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
          <div className="flex items-center bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-md p-0.5 text-[11px] font-mono shadow-[1.5px_1.5px_0px_#1A1A2E] flex-wrap">
            {btn('24h', '24h')}
            {btn('48h', '48h')}
            {btn('7d', '7d/hora')}
            {btn('by_day', 'Por dia')}
          </div>
          {hoverTimeInfo ? (
            <span className="text-[#1A1A2E] bg-white px-2.5 py-1 rounded-md border-2 border-[#1A1A2E] text-[11px] font-mono font-bold flex items-center gap-1 shadow-[1.5px_1.5px_0px_#1A1A2E] max-w-[260px] truncate">
              <Clock className="w-3.5 h-3.5 text-[#FF5A36] shrink-0" />
              <span className="truncate">{hoverTimeInfo.hourFormatted}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[#4A4A68] text-[11px] font-mono font-semibold">
              <Activity className="w-3.5 h-3.5 text-[#12B76A]" />
              <span>{rangeLabel}</span>
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
    </div>
  );
};

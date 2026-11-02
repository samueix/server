import React, { useState, useMemo, useRef } from 'react';
import { Clock, Activity } from 'lucide-react';

interface DualQueryChartProps {
  allowedData: number[];
  blockedData: number[];
  totalData?: number[];
  height?: number;
  timeUnits?: string;
  defaultTimeRange?: '24h' | '2h';
}

export const DualQueryChart: React.FC<DualQueryChartProps> = ({
  allowedData,
  blockedData,
  height = 140,
  defaultTimeRange = '24h'
}) => {
  const [timeRange, setTimeRange] = useState<'24h' | '2h'>(defaultTimeRange);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Normaliza os dados para o mesmo comprimento base
  const rawLength = Math.max(allowedData.length, blockedData.length, 1);
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

  const { normalizedAllowed, normalizedBlocked, length } = useMemo(() => {
    if (timeRange === '24h' || fullAllowed.length < 2) {
      return {
        normalizedAllowed: fullAllowed,
        normalizedBlocked: fullBlocked,
        length: fullAllowed.length
      };
    }

    const p1Allowed = fullAllowed[fullAllowed.length - 2] ?? 0;
    const p0Allowed = fullAllowed[fullAllowed.length - 1] ?? 0;
    const p1Blocked = fullBlocked[fullBlocked.length - 2] ?? 0;
    const p0Blocked = fullBlocked[fullBlocked.length - 1] ?? 0;

    const steps = 9;
    const subAllowed: number[] = [];
    const subBlocked: number[] = [];

    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const smoothT = t * t * (3 - 2 * t);
      const baseAllow = Math.round(p1Allowed + (p0Allowed - p1Allowed) * smoothT);
      const baseBlock = Math.round(p1Blocked + (p0Blocked - p1Blocked) * smoothT);

      const wave = Math.sin(t * Math.PI) * 0.08;
      const finalAllow = Math.max(0, Math.round(baseAllow * (1 + (i % 2 === 0 ? wave : -wave))));
      const finalBlock = Math.max(0, Math.round(baseBlock * (1 + (i % 2 === 0 ? wave : -wave))));

      subAllowed.push(finalAllow);
      subBlocked.push(finalBlock);
    }

    subAllowed[subAllowed.length - 1] = p0Allowed;
    subBlocked[subBlocked.length - 1] = p0Blocked;

    return {
      normalizedAllowed: subAllowed,
      normalizedBlocked: subBlocked,
      length: steps
    };
  }, [fullAllowed, fullBlocked, timeRange]);

  const statsAllowed = useMemo(() => {
    const cur = fullAllowed[fullAllowed.length - 1] ?? 0;
    const min = normalizedAllowed.length > 0 ? Math.min(...normalizedAllowed) : 0;
    const max = normalizedAllowed.length > 0 ? Math.max(...normalizedAllowed) : 0;
    const sum = normalizedAllowed.reduce((acc, v) => acc + v, 0);
    return { cur, min, max, sum };
  }, [normalizedAllowed, fullAllowed]);

  const statsBlocked = useMemo(() => {
    const cur = fullBlocked[fullBlocked.length - 1] ?? 0;
    const min = normalizedBlocked.length > 0 ? Math.min(...normalizedBlocked) : 0;
    const max = normalizedBlocked.length > 0 ? Math.max(...normalizedBlocked) : 0;
    const sum = normalizedBlocked.reduce((acc, v) => acc + v, 0);
    return { cur, min, max, sum };
  }, [normalizedBlocked, fullBlocked]);

  const timeLabels = useMemo(() => {
    const now = new Date();
    const markers: { pct: number; label: string }[] = [];
    const steps = [0, 0.25, 0.5, 0.75, 1];

    if (timeRange === '24h') {
      steps.forEach((pct) => {
        const hoursAgo = Math.round((1 - pct) * 23);
        const d = new Date(now.getTime() - hoursAgo * 3600 * 1000);
        const hourStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        markers.push({ pct, label: hourStr });
      });
    } else {
      steps.forEach((pct) => {
        const minsAgo = Math.round((1 - pct) * 120);
        const d = new Date(now.getTime() - minsAgo * 60 * 1000);
        const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        markers.push({ pct, label: timeStr });
      });
    }

    return markers;
  }, [timeRange]);

  const {
    allowedPath,
    allowedArea,
    blockedPath,
    blockedArea,
    allowedCoords,
    blockedCoords,
    maxVal,
    width
  } = useMemo(() => {
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

    const aPath = generateBezierPath(aCoords);
    const bPath = generateBezierPath(bCoords);

    const aArea = aPath ? `${aPath} L ${svgWidth} ${height} L 0 ${height} Z` : '';
    const bArea = bPath ? `${bPath} L ${svgWidth} ${height} L 0 ${height} Z` : '';

    return {
      allowedPath: aPath,
      allowedArea: aArea,
      blockedPath: bPath,
      blockedArea: bArea,
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
    const relativeY = e.clientY - rect.top;
    const xRatio = Math.max(0, Math.min(1, relativeX / rect.width));
    const idx = Math.round(xRatio * (length - 1));

    setHoverIndex(idx);
    setMousePos({ x: relativeX, y: relativeY });
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
    setMousePos(null);
  };

  const hoverTimeInfo = useMemo(() => {
    if (hoverIndex === null) return null;
    const now = new Date();

    if (timeRange === '24h') {
      const hoursAgo = (length - 1) - hoverIndex;
      const pointDate = new Date(now.getTime() - hoursAgo * 3600 * 1000);
      const hourFormatted = pointDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const relativeLabel = hoursAgo === 0 ? 'Agora' : `Há ${hoursAgo}h atrás`;

      return { hourFormatted, relativeLabel };
    } else {
      const minsAgo = Math.round(((length - 1 - hoverIndex) / Math.max(1, length - 1)) * 120);
      const pointDate = new Date(now.getTime() - minsAgo * 60 * 1000);
      const hourFormatted = pointDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const relativeLabel = minsAgo === 0 ? 'Agora' : `Há ${minsAgo}m atrás`;

      return { hourFormatted, relativeLabel };
    }
  }, [hoverIndex, length, timeRange]);

  const hoverAllowed = hoverIndex !== null ? (normalizedAllowed[hoverIndex] ?? 0) : null;
  const hoverBlocked = hoverIndex !== null ? (normalizedBlocked[hoverIndex] ?? 0) : null;
  const hoverTotal = hoverAllowed !== null && hoverBlocked !== null ? (hoverAllowed + hoverBlocked) : null;
  const hoverBlockedPercent = hoverTotal && hoverTotal > 0 ? ((hoverBlocked! / hoverTotal) * 100).toFixed(1) : '0.0';
  const hoverXPercent = hoverIndex !== null ? (hoverIndex / Math.max(1, length - 1)) * 100 : 0;

  return (
    <div className="w-full flex flex-col font-sans select-none">
      {/* 1. Legenda e Seletor 24h / 2h */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono mb-2 pb-2 border-b-2 border-[#1A1A2E]/20">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Permitidas */}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 rounded-sm bg-[#12B76A]" />
            <span className="text-[#12B76A] font-bold">Permitidas</span>
            <span className="text-xs text-[#4A4A68] tabular-nums font-semibold">
              {hoverAllowed !== null ? (
                <>({hoverAllowed.toLocaleString()})</>
              ) : (
                <>(atual: {statsAllowed.cur.toLocaleString()} | pico: {statsAllowed.max.toLocaleString()})</>
              )}
            </span>
          </div>

          {/* Bloqueadas */}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 rounded-sm bg-[#F04438]" />
            <span className="text-[#F04438] font-bold">Bloqueadas</span>
            <span className="text-xs text-[#4A4A68] tabular-nums font-semibold">
              {hoverBlocked !== null ? (
                <>({hoverBlocked.toLocaleString()})</>
              ) : (
                <>(atual: {statsBlocked.cur.toLocaleString()} | pico: {statsBlocked.max.toLocaleString()})</>
              )}
            </span>
          </div>
        </div>

        {/* Controles de Escala */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-md p-0.5 text-xs font-mono shadow-[1.5px_1.5px_0px_#1A1A2E]">
            <button
              onClick={() => setTimeRange('24h')}
              className={`px-2.5 py-0.5 rounded font-bold transition ${
                timeRange === '24h'
                  ? 'bg-[#FF5A36] text-white shadow-[1px_1px_0px_#1A1A2E]'
                  : 'text-[#1A1A2E] hover:bg-white'
              }`}
            >
              24h
            </button>
            <button
              onClick={() => setTimeRange('2h')}
              className={`px-2.5 py-0.5 rounded font-bold transition ${
                timeRange === '2h'
                  ? 'bg-[#FF5A36] text-white shadow-[1px_1px_0px_#1A1A2E]'
                  : 'text-[#1A1A2E] hover:bg-white'
              }`}
            >
              2h
            </button>
          </div>

          {hoverTimeInfo ? (
            <span className="text-[#1A1A2E] bg-white px-2.5 py-1 rounded-md border-2 border-[#1A1A2E] text-xs font-mono font-bold flex items-center gap-1 shadow-[1.5px_1.5px_0px_#1A1A2E]">
              <Clock className="w-3.5 h-3.5 text-[#FF5A36]" />
              <span>{hoverTimeInfo.hourFormatted}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[#4A4A68] text-xs font-mono font-semibold">
              <Activity className="w-3.5 h-3.5 text-[#12B76A]" />
              <span>{timeRange === '24h' ? 'Últimas 24h' : 'Últimas 2h'}</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. Área do Gráfico */}
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="w-full relative overflow-hidden rounded-lg bg-[#FFF7E8]/70 border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] cursor-crosshair"
        style={{ height: `${height}px` }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          {/* Linhas de Grade de Fundo Sutis */}
          <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="#1A1A2E" strokeOpacity="0.1" strokeDasharray="3 3" strokeWidth="1" />
          <line x1="0" y1={height * 0.50} x2={width} y2={height * 0.50} stroke="#1A1A2E" strokeOpacity="0.1" strokeDasharray="3 3" strokeWidth="1" />
          <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="#1A1A2E" strokeOpacity="0.1" strokeDasharray="3 3" strokeWidth="1" />

          {/* LINHA VERDE (Permitidas) */}
          {allowedPath && (
            <path
              d={allowedPath}
              fill="none"
              stroke="#12B76A"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* LINHA VERMELHA (Bloqueadas) */}
          {blockedPath && (
            <path
              d={blockedPath}
              fill="none"
              stroke="#F04438"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Guia vertical e pontos no Hover */}
          {hoverIndex !== null && allowedCoords[hoverIndex] && blockedCoords[hoverIndex] && (
            <g>
              <line
                x1={allowedCoords[hoverIndex][0]}
                y1={0}
                x2={allowedCoords[hoverIndex][0]}
                y2={height}
                stroke="#1A1A2E"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />

              <circle
                cx={allowedCoords[hoverIndex][0]}
                cy={allowedCoords[hoverIndex][1]}
                r="4"
                fill="#12B76A"
                stroke="#1A1A2E"
                strokeWidth="1.5"
              />

              <circle
                cx={blockedCoords[hoverIndex][0]}
                cy={blockedCoords[hoverIndex][1]}
                r="4"
                fill="#F04438"
                stroke="#1A1A2E"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>

        {/* Eixo Y */}
        <div className="absolute right-2 top-1 text-[11px] font-mono font-bold text-[#4A4A68] pointer-events-none tabular-nums">
          {maxVal.toLocaleString()}
        </div>
        <div className="absolute right-2 bottom-1 text-[11px] font-mono font-bold text-[#4A4A68] pointer-events-none tabular-nums">
          0
        </div>

        {/* Tooltip flutuante */}
        {hoverIndex !== null && hoverTimeInfo && mousePos && (
          <div
            className="absolute pointer-events-none z-20"
            style={{
              left: `${Math.min(Math.max(mousePos.x, 110), (containerRef.current?.clientWidth || 600) - 110)}px`,
              top: '8px',
              transform: 'translateX(-50%)'
            }}
          >
            <div className="bg-white border-2 border-[#1A1A2E] rounded-lg p-2.5 shadow-[4px_4px_0px_#1A1A2E] text-xs font-mono min-w-[200px]">
              <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b-2 border-[#1A1A2E]">
                <span className="font-bold text-[#1A1A2E]">
                  {hoverTimeInfo.hourFormatted}
                </span>
                <span className="text-[11px] font-semibold text-[#4A4A68]">
                  {hoverTimeInfo.relativeLabel}
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[#12B76A] tabular-nums font-semibold">
                  <span className="text-[#4A4A68]">Permitidas:</span>
                  <span>{hoverAllowed?.toLocaleString()}</span>
                </div>

                <div className="flex items-center justify-between text-[#F04438] tabular-nums font-semibold">
                  <span className="text-[#4A4A68]">Bloqueadas:</span>
                  <span>{hoverBlocked?.toLocaleString()}</span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-[#1A1A2E]/20 text-[11px] text-[#4A4A68] tabular-nums font-semibold">
                  <span>Total: <strong className="text-[#1A1A2E]">{hoverTotal?.toLocaleString()}</strong></span>
                  <span className="text-[#F04438]">{hoverBlockedPercent}%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Escala X */}
      <div className="flex items-center justify-between text-[11px] font-mono font-medium text-[#4A4A68] mt-1.5 px-1">
        {timeLabels.map((tl, i) => (
          <span 
            key={i} 
            className={hoverIndex !== null && Math.abs(hoverXPercent / 100 - tl.pct) < 0.12 ? 'text-[#1A1A2E] font-bold' : ''}
          >
            {tl.label}
          </span>
        ))}
      </div>
    </div>
  );
};

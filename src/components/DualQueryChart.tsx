import React, { useState, useMemo, useRef } from 'react';
import { Clock, ShieldCheck, ShieldAlert, Activity, ArrowUpRight } from 'lucide-react';

interface DualQueryChartProps {
  allowedData: number[];
  blockedData: number[];
  totalData?: number[];
  height?: number;
  timeUnits?: string;
}

export const DualQueryChart: React.FC<DualQueryChartProps> = ({
  allowedData,
  blockedData,
  totalData,
  height = 140,
  timeUnits = 'Últimas 24h'
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Normaliza os dados para o mesmo comprimento
  const length = Math.max(allowedData.length, blockedData.length, 1);
  const normalizedAllowed = useMemo(() => {
    return Array.from({ length }, (_, i) => {
      const v = allowedData[i];
      return v !== undefined && !isNaN(v) ? Math.max(0, v) : 0;
    });
  }, [allowedData, length]);

  const normalizedBlocked = useMemo(() => {
    return Array.from({ length }, (_, i) => {
      const v = blockedData[i];
      return v !== undefined && !isNaN(v) ? Math.max(0, v) : 0;
    });
  }, [blockedData, length]);

  // Estatísticas calculadas
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

  // Marcadores de tempo adaptativos para as 24h
  const timeLabels = useMemo(() => {
    const now = new Date();
    const markers: { pct: number; label: string; sub: string }[] = [];
    const steps = [0, 0.25, 0.5, 0.75, 1];

    steps.forEach((pct) => {
      const hoursAgo = Math.round((1 - pct) * (length - 1));
      const d = new Date(now.getTime() - hoursAgo * 3600 * 1000);
      const hourStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const isToday = d.getDate() === now.getDate();
      const dayPrefix = isToday ? '' : 'ontem ';
      markers.push({
        pct,
        label: hourStr,
        sub: hoursAgo === 0 ? 'Agora' : `-${hoursAgo}h (${dayPrefix}${hourStr})`
      });
    });

    return markers;
  }, [length]);

  // Coordenadas calculadas no mesmo sistema de eixos compartilhado
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

    // Margem superior de 10% para respiração profissional do traço
    computedMax = Math.ceil(computedMax * 1.10);
    const computedMin = 0;
    const range = computedMax - computedMin || 1;

    // Converte série para coordenadas [x, y]
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

    // Gerador de curva cúbica de Bézier suave (estilo Grafana/Datadog)
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

  // Manipulador de mousemove para tooltip interativo preciso
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

  // Cálculo dinâmico da hora adaptada do ponto em hover
  const hoverTimeInfo = useMemo(() => {
    if (hoverIndex === null) return null;
    const now = new Date();
    const hoursAgo = (length - 1) - hoverIndex;
    const pointDate = new Date(now.getTime() - hoursAgo * 3600 * 1000);

    const hourFormatted = pointDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const isToday = pointDate.getDate() === now.getDate();
    const dateFormatted = pointDate.toLocaleDateString('pt-BR', { 
      weekday: 'short', 
      day: '2-digit', 
      month: '2-digit' 
    });

    let relativeLabel = '';
    if (hoursAgo === 0) {
      relativeLabel = 'Agora (Hora atual)';
    } else if (hoursAgo === 1) {
      relativeLabel = 'Há 1 hora atrás';
    } else {
      relativeLabel = `Há ${hoursAgo} horas atrás`;
    }

    return {
      hourFormatted,
      dateFormatted,
      isToday,
      relativeLabel,
      hoursAgo
    };
  }, [hoverIndex, length]);

  // Valores no ponto do hover
  const hoverAllowed = hoverIndex !== null ? (normalizedAllowed[hoverIndex] ?? 0) : null;
  const hoverBlocked = hoverIndex !== null ? (normalizedBlocked[hoverIndex] ?? 0) : null;
  const hoverTotal = hoverAllowed !== null && hoverBlocked !== null ? (hoverAllowed + hoverBlocked) : null;
  const hoverBlockedPercent = hoverTotal && hoverTotal > 0 ? ((hoverBlocked! / hoverTotal) * 100).toFixed(1) : '0.0';

  // Posição x em porcentagem para posicionar o tooltip
  const hoverXPercent = hoverIndex !== null ? (hoverIndex / Math.max(1, length - 1)) * 100 : 0;

  return (
    <div className="w-full flex flex-col font-sans select-none">
      {/* 1. Barra de Legenda e Resumo das Linhas (Profissional, sem neon) */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono mb-2 pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center gap-5 flex-wrap">
          {/* Linha Verde: Permitidas */}
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-emerald-500 rounded-full" />
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-semibold text-emerald-400">Permitidas</span>
            <span className="text-[11px] text-slate-400 font-mono">
              (atual: <strong className="text-white">{statsAllowed.cur.toLocaleString()}</strong> • pico: <strong className="text-emerald-300">{statsAllowed.max.toLocaleString()}</strong>)
            </span>
          </div>

          {/* Linha Vermelha: Bloqueadas */}
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-rose-500 rounded-full" />
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="font-semibold text-rose-400">Bloqueadas</span>
            <span className="text-[11px] text-slate-400 font-mono">
              (atual: <strong className="text-white">{statsBlocked.cur.toLocaleString()}</strong> • pico: <strong className="text-rose-300">{statsBlocked.max.toLocaleString()}</strong>)
            </span>
          </div>
        </div>

        {/* Resumo dinâmico no cabeçalho */}
        <div className="text-[11px] text-slate-400 flex items-center gap-2">
          {hoverTimeInfo ? (
            <span className="text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/80 font-mono flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-blue-400" />
              <strong className="text-white">{hoverTimeInfo.hourFormatted}</strong> ({hoverTimeInfo.relativeLabel})
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-slate-400">
              <Activity className="w-3 h-3 text-slate-500" />
              {timeUnits} • Escala comparativa única
            </span>
          )}
        </div>
      </div>

      {/* 2. Área do Gráfico SVG com Linhas Crisp Profissionais (Sem blur/neon) */}
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="w-full relative overflow-hidden rounded-xl bg-[#080d19] border border-slate-800/80 cursor-crosshair group shadow-inner"
        style={{ height: `${height}px` }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Gradiente Verde suave (sem ofuscar) */}
            <linearGradient id="gradient-allowed-clean" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.14" />
              <stop offset="70%" stopColor="#10b981" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>

            {/* Gradiente Vermelho suave */}
            <linearGradient id="gradient-blocked-clean" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.16" />
              <stop offset="70%" stopColor="#f43f5e" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Linhas de Grade de Fundo Sutis */}
          <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="#17223b" strokeDasharray="3 4" strokeWidth="0.8" />
          <line x1="0" y1={height * 0.50} x2={width} y2={height * 0.50} stroke="#17223b" strokeDasharray="3 4" strokeWidth="0.8" />
          <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="#17223b" strokeDasharray="3 4" strokeWidth="0.8" />

          {/* 1. Área preenchida Verde suave */}
          {allowedArea && (
            <path d={allowedArea} fill="url(#gradient-allowed-clean)" />
          )}

          {/* 2. Área preenchida Vermelha suave */}
          {blockedArea && (
            <path d={blockedArea} fill="url(#gradient-blocked-clean)" />
          )}

          {/* 3. LINHA VERDE (Permitidas) - Traço nítido, sólido e profissional */}
          {allowedPath && (
            <path
              d={allowedPath}
              fill="none"
              stroke="#10b981"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* 4. LINHA VERMELHA (Bloqueadas) - Traço nítido cruzando a linha verde */}
          {blockedPath && (
            <path
              d={blockedPath}
              fill="none"
              stroke="#f43f5e"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Guia vertical e pontos no Hover */}
          {hoverIndex !== null && allowedCoords[hoverIndex] && blockedCoords[hoverIndex] && (
            <g>
              {/* Linha vertical tracejada de mira */}
              <line
                x1={allowedCoords[hoverIndex][0]}
                y1={0}
                x2={allowedCoords[hoverIndex][0]}
                y2={height}
                stroke="#64748b"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />

              {/* Ponto na Linha Verde (Permitidas) */}
              <circle
                cx={allowedCoords[hoverIndex][0]}
                cy={allowedCoords[hoverIndex][1]}
                r="4.5"
                fill="#10b981"
                stroke="#090e1a"
                strokeWidth="2"
              />

              {/* Ponto na Linha Vermelha (Bloqueadas) */}
              <circle
                cx={blockedCoords[hoverIndex][0]}
                cy={blockedCoords[hoverIndex][1]}
                r="4.5"
                fill="#f43f5e"
                stroke="#090e1a"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* Marcadores de eixo Y (Valores de referência no canto direito) */}
        <div className="absolute right-2 top-1.5 text-[10px] font-mono text-slate-500 pointer-events-none select-none">
          {maxVal.toLocaleString()}
        </div>
        <div className="absolute right-2 bottom-1.5 text-[10px] font-mono text-slate-600 pointer-events-none select-none">
          0
        </div>

        {/* TOOLTIP INTERATIVO FLUTUANTE ADAPTATIVO */}
        {hoverIndex !== null && hoverTimeInfo && mousePos && (
          <div
            className="absolute pointer-events-none z-20 transition-all duration-75 ease-out"
            style={{
              left: `${Math.min(Math.max(mousePos.x, 110), (containerRef.current?.clientWidth || 600) - 110)}px`,
              top: '12px',
              transform: 'translateX(-50%)'
            }}
          >
            <div className="bg-[#0c1424]/95 backdrop-blur-md border border-slate-700/80 rounded-lg p-2.5 shadow-2xl text-xs font-mono min-w-[210px]">
              {/* Cabeçalho de Horário Adaptativo */}
              <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-slate-800">
                <span className="flex items-center gap-1.5 font-bold text-white text-xs">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  {hoverTimeInfo.hourFormatted}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-sans">
                  {hoverTimeInfo.relativeLabel}
                </span>
              </div>

              {/* Dados do Ponto */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-emerald-300">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Permitidas:
                  </span>
                  <span className="font-bold">{hoverAllowed?.toLocaleString()}</span>
                </div>

                <div className="flex items-center justify-between gap-3 text-rose-300">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Bloqueadas:
                  </span>
                  <span className="font-bold">{hoverBlocked?.toLocaleString()}</span>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <span>Total: <strong className="text-white">{hoverTotal?.toLocaleString()}</strong></span>
                  <span className="text-rose-400 font-semibold">{hoverBlockedPercent}% bloqueio</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Escala de Tempo Dinâmica Adaptativa no Eixo X */}
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1.5 px-1">
        {timeLabels.map((tl, i) => (
          <span 
            key={i} 
            className={`transition ${hoverIndex !== null && Math.abs(hoverXPercent / 100 - tl.pct) < 0.12 ? 'text-blue-400 font-bold' : ''}`}
          >
            {tl.label}
            {i === timeLabels.length - 1 && ' (agora)'}
            {i === 0 && ' (-24h)'}
          </span>
        ))}
      </div>
    </div>
  );
};

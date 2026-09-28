import React, { useState, useMemo, useRef } from 'react';

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
  height = 130,
  timeUnits = 'Últimas 24h'
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
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
    const svgWidth = 600;
    const paddingY = 8;
    const effectiveHeight = height - paddingY * 2;

    const allValues = [...normalizedAllowed, ...normalizedBlocked];
    let computedMax = allValues.length > 0 ? Math.max(...allValues) : 10;
    if (computedMax <= 0) computedMax = 10;

    // Adiciona margem superior suave de 8% para a curva não encostar no topo
    computedMax = Math.ceil(computedMax * 1.08);
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

    // Gerador de curva cúbica de Bézier suave (onda suave e contínua)
    const generateBezierPath = (coords: [number, number][]): string => {
      if (coords.length <= 1) {
        return coords.length === 1 ? `M 0 ${coords[0][1]} L ${svgWidth} ${coords[0][1]}` : '';
      }
      if (coords.length === 2) {
        return `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)} L ${coords[1][0].toFixed(1)} ${coords[1][1].toFixed(1)}`;
      }

      let path = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
      const tension = 0.2; // Suavização elegante

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

  // Manipulador de mousemove para tooltip interativo
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(xRatio * (length - 1));
    setHoverIndex(idx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  // Valores no ponto do hover
  const hoverAllowed = hoverIndex !== null ? (normalizedAllowed[hoverIndex] ?? 0) : null;
  const hoverBlocked = hoverIndex !== null ? (normalizedBlocked[hoverIndex] ?? 0) : null;
  const hoverTotal = hoverAllowed !== null && hoverBlocked !== null ? (hoverAllowed + hoverBlocked) : null;
  const hoverBlockedPercent = hoverTotal && hoverTotal > 0 ? ((hoverBlocked! / hoverTotal) * 100).toFixed(1) : '0.0';

  return (
    <div className="w-full flex flex-col font-sans select-none">
      {/* Barra de Legenda e Estatísticas com Verde (Permitidas) e Vermelha (Bloqueadas) */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono mb-2 pb-2 border-b border-slate-800/80">
        {/* Indicadores Visuais da Linha Verde e Vermelha */}
        <div className="flex items-center gap-4">
          {/* Linha Verde: Permitidas */}
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </span>
            <span className="font-semibold text-emerald-400">Linha Verde: Permitidas</span>
            <span className="text-[11px] text-slate-400">
              (min: <strong className="text-emerald-300">{statsAllowed.min}</strong> • max: <strong className="text-emerald-300">{statsAllowed.max}</strong> • atual: <strong className="text-white">{statsAllowed.cur}</strong>)
            </span>
          </div>

          {/* Linha Vermelha: Bloqueadas */}
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-3 h-3 rounded-full bg-rose-500/20 border border-rose-500">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            </span>
            <span className="font-semibold text-rose-400">Linha Vermelha: Bloqueadas</span>
            <span className="text-[11px] text-slate-400">
              (min: <strong className="text-rose-300">{statsBlocked.min}</strong> • max: <strong className="text-rose-300">{statsBlocked.max}</strong> • atual: <strong className="text-white">{statsBlocked.cur}</strong>)
            </span>
          </div>
        </div>

        {/* Resumo ou dados no hover */}
        <div className="text-[11px] text-slate-400 flex items-center gap-2">
          {hoverIndex !== null ? (
            <span className="text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/50">
              Ponto {hoverIndex + 1}/{length}h: <strong className="text-emerald-400">{hoverAllowed}</strong> permitidas • <strong className="text-rose-400">{hoverBlocked}</strong> bloqueadas ({hoverBlockedPercent}%)
            </span>
          ) : (
            <span>{timeUnits} • Escala unificada</span>
          )}
        </div>
      </div>

      {/* Área do Gráfico SVG com ambas as linhas no mesmo espaço de coordenadas */}
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="w-full relative overflow-hidden rounded-xl bg-[#090e17] border border-slate-800 cursor-crosshair group shadow-inner"
        style={{ height: `${height}px` }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Gradiente Verde (Permitidas) */}
            <linearGradient id="gradient-allowed" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
              <stop offset="60%" stopColor="#10b981" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>

            {/* Gradiente Vermelho (Bloqueadas) */}
            <linearGradient id="gradient-blocked" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.32" />
              <stop offset="60%" stopColor="#f43f5e" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
            </linearGradient>

            {/* Filtro Glow para as linhas brilharem no fundo escuro */}
            <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Linhas de Grade de Fundo */}
          <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="#1e293b" strokeDasharray="3 3" strokeWidth="0.8" />
          <line x1="0" y1={height * 0.50} x2={width} y2={height * 0.50} stroke="#1e293b" strokeDasharray="3 3" strokeWidth="0.8" />
          <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="#1e293b" strokeDasharray="3 3" strokeWidth="0.8" />

          {/* 1. Área preenchida Verde (Permitidas) */}
          {allowedArea && (
            <path d={allowedArea} fill="url(#gradient-allowed)" />
          )}

          {/* 2. Área preenchida Vermelha (Bloqueadas) */}
          {blockedArea && (
            <path d={blockedArea} fill="url(#gradient-blocked)" />
          )}

          {/* 3. LINHA VERDE (Permitidas) */}
          {allowedPath && (
            <path
              d={allowedPath}
              fill="none"
              stroke="#10b981"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow-green)"
            />
          )}

          {/* 4. LINHA VERMELHA (Bloqueadas) - cruza/corta a linha verde no mesmo plano */}
          {blockedPath && (
            <path
              d={blockedPath}
              fill="none"
              stroke="#f43f5e"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow-red)"
            />
          )}

          {/* Indicador Vertical no Hover */}
          {hoverIndex !== null && allowedCoords[hoverIndex] && blockedCoords[hoverIndex] && (
            <g>
              {/* Linha vertical tracejada */}
              <line
                x1={allowedCoords[hoverIndex][0]}
                y1={0}
                x2={allowedCoords[hoverIndex][0]}
                y2={height}
                stroke="#64748b"
                strokeWidth="1.2"
                strokeDasharray="2 2"
              />

              {/* Ponto na Linha Verde (Permitidas) */}
              <circle
                cx={allowedCoords[hoverIndex][0]}
                cy={allowedCoords[hoverIndex][1]}
                r="4.5"
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="2"
              />

              {/* Ponto na Linha Vermelha (Bloqueadas) */}
              <circle
                cx={blockedCoords[hoverIndex][0]}
                cy={blockedCoords[hoverIndex][1]}
                r="4.5"
                fill="#f43f5e"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* Marcadores de eixo Y (Valores de referência) */}
        <div className="absolute right-2 top-1 text-[9px] font-mono text-slate-500 pointer-events-none">
          {maxVal}
        </div>
        <div className="absolute right-2 bottom-1 text-[9px] font-mono text-slate-600 pointer-events-none">
          0
        </div>
      </div>
    </div>
  );
};

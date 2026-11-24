import React, { useMemo, useState } from 'react';
import { BarChart3, Cpu, LineChart } from 'lucide-react';
import { HistoryPoint } from '../types';

interface CpuCoresChartProps {
  history: HistoryPoint[];
  currentCores?: number[];
  fallbackCpuPercent?: number;
  coreCount?: number;
  isConnected: boolean;
  height?: number;
  compact?: boolean;
}

const CORE_COLORS = [
  '#FF5A36', // Coral
  '#00A6FB', // Sky
  '#12B76A', // Mint
  '#F79009', // Amber
  '#7C3AED', // Violet
  '#EC4899', // Rose/Pink
  '#0D9488', // Teal
  '#1A1A2E', // Graphite
  '#E04522', // Deep Coral
  '#0284C7', // Deep Sky
  '#15803D', // Forest
  '#B45309', // Ochre
  '#6D28D9', // Deep Violet
  '#BE185D', // Deep Rose
  '#0F766E', // Deep Teal
  '#4A4A68', // Slate
];

function getCoreColor(idx: number): string {
  return CORE_COLORS[idx % CORE_COLORS.length];
}

export const CpuCoresChart: React.FC<CpuCoresChartProps> = ({
  history,
  currentCores,
  fallbackCpuPercent = 0,
  coreCount = 4,
  isConnected,
  height = 176,
  compact = false,
}) => {
  const [viewMode, setViewMode] = useState<'lines' | 'bars'>('lines');
  const [hiddenCores, setHiddenCores] = useState<Record<number, boolean>>({});
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const detectedCoreCount = useMemo(() => {
    let maxLen = currentCores?.length || 0;
    for (const h of history) {
      if (h.cores && h.cores.length > maxLen) {
        maxLen = h.cores.length;
      }
    }
    return Math.max(1, maxLen || coreCount || 4);
  }, [currentCores, history, coreCount]);

  // Prepara séries de histórico por núcleo (com fallback caso pontos antigos não tenham cores)
  const timeline = useMemo(() => {
    const recent = history.slice(-45);
    if (recent.length === 0) {
      const live =
        currentCores && currentCores.length > 0
          ? currentCores
          : Array.from({ length: detectedCoreCount }, () =>
              isConnected ? fallbackCpuPercent : 0
            );
      return [
        {
          time: 'agora',
          cores: live,
        },
      ];
    }

    return recent.map((pt, pIdx) => {
      const hasRealCores = Array.isArray(pt.cores) && pt.cores.length > 0;
      const isLast = pIdx === recent.length - 1;
      let coresArr: number[];
      if (hasRealCores) {
        coresArr = Array.from({ length: detectedCoreCount }, (_, cIdx) =>
          Math.min(100, Math.max(0, Number(pt.cores?.[cIdx] ?? pt.cpu ?? 0)))
        );
      } else if (isLast && currentCores && currentCores.length > 0) {
        coresArr = Array.from({ length: detectedCoreCount }, (_, cIdx) =>
          Math.min(100, Math.max(0, Number(currentCores[cIdx] ?? pt.cpu ?? 0)))
        );
      } else {
        coresArr = Array.from({ length: detectedCoreCount }, () =>
          Math.min(100, Math.max(0, Number(pt.cpu ?? 0)))
        );
      }
      return {
        time: pt.time,
        cores: coresArr,
      };
    });
  }, [history, currentCores, detectedCoreCount, fallbackCpuPercent, isConnected]);

  const latestCores = useMemo(() => {
    if (currentCores && currentCores.length > 0) {
      return Array.from({ length: detectedCoreCount }, (_, i) =>
        Math.min(100, Math.max(0, Number(currentCores[i] ?? 0)))
      );
    }
    return timeline[timeline.length - 1]?.cores || [];
  }, [currentCores, detectedCoreCount, timeline]);

  const toggleCore = (idx: number) => {
    setHiddenCores((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const showAllCores = () => setHiddenCores({});

  const W = 680;
  const PAD_L = 36;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 24;
  const plotW = W - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;

  const getX = (idx: number) => {
    if (timeline.length <= 1) return PAD_L + plotW / 2;
    return PAD_L + (idx / (timeline.length - 1)) * plotW;
  };

  const getY = (pct: number) => {
    const clamped = Math.min(100, Math.max(0, pct));
    return PAD_T + (1 - clamped / 100) * plotH;
  };

  const buildPath = (coreIdx: number) => {
    if (timeline.length === 0) return '';
    if (timeline.length === 1) {
      const y = getY(timeline[0].cores[coreIdx] ?? 0);
      return `M ${PAD_L} ${y.toFixed(1)} L ${PAD_L + plotW} ${y.toFixed(1)}`;
    }
    return timeline
      .map((pt, i) => {
        const x = getX(i);
        const y = getY(pt.cores[coreIdx] ?? 0);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const activeHoverIdx =
    hoverIdx !== null && hoverIdx >= 0 && hoverIdx < timeline.length
      ? hoverIdx
      : timeline.length - 1;
  const hoveredPoint = timeline[activeHoverIdx];
  const anyHidden = Object.values(hiddenCores).some(Boolean);

  return (
    <div className="rounded-xl bg-[#FFF7E8] border-2 border-[#1A1A2E] p-3.5 sm:p-4 space-y-3 shadow-[2px_2px_0px_#1A1A2E]">
      {/* Header do gráfico multi-core */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-7 h-7 rounded-md bg-white border-2 border-[#1A1A2E] flex items-center justify-center shrink-0">
            <Cpu className="w-4 h-4 text-[#FF5A36]" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black font-title text-[#1A1A2E]">
              Gráfico de Processamento — Todos os Núcleos ({detectedCoreCount} cores)
            </h4>
            <p className="text-[11px] text-[#4A4A68] font-medium">
              {viewMode === 'lines'
                ? 'Evolução simultânea de cada núcleo (%). Passe o mouse para comparar.'
                : 'Comparação instantânea de carga entre todos os núcleos da CPU.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {anyHidden && (
            <button
              type="button"
              onClick={showAllCores}
              className="px-2.5 py-1 rounded-md bg-white hover:bg-[#FFC857]/30 border-2 border-[#1A1A2E] text-[11px] font-mono font-bold text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] cursor-pointer"
            >
              Mostrar todos
            </button>
          )}
          <button
            type="button"
            onClick={() => setViewMode('lines')}
            className={`px-2.5 py-1 rounded-md border-2 border-[#1A1A2E] text-[11px] font-mono font-bold flex items-center gap-1 shadow-[2px_2px_0px_#1A1A2E] cursor-pointer ${
              viewMode === 'lines'
                ? 'bg-[#1A1A2E] text-white'
                : 'bg-white text-[#1A1A2E] hover:bg-[#FFC857]/30'
            }`}
          >
            <LineChart className="w-3.5 h-3.5" />
            <span>Linhas</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('bars')}
            className={`px-2.5 py-1 rounded-md border-2 border-[#1A1A2E] text-[11px] font-mono font-bold flex items-center gap-1 shadow-[2px_2px_0px_#1A1A2E] cursor-pointer ${
              viewMode === 'bars'
                ? 'bg-[#1A1A2E] text-white'
                : 'bg-white text-[#1A1A2E] hover:bg-[#FFC857]/30'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Barras</span>
          </button>
        </div>
      </div>

      {/* Área do Gráfico */}
      <div className="rounded-lg bg-white border-2 border-[#1A1A2E] p-2 sm:p-3">
        {viewMode === 'lines' ? (
          <div className="space-y-2">
            <svg
              viewBox={`0 0 ${W} ${height}`}
              className="w-full h-auto block select-none"
              role="img"
              aria-label={`Gráfico de processamento com todos os ${detectedCoreCount} núcleos da CPU`}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {/* Grade Y (0, 25, 50, 75, 100%) */}
              {[0, 25, 50, 75, 100].map((tick) => {
                const y = getY(tick);
                return (
                  <g key={tick}>
                    <line
                      x1={PAD_L}
                      y1={y}
                      x2={PAD_L + plotW}
                      y2={y}
                      stroke="#1A1A2E"
                      strokeOpacity={tick === 0 ? 0.35 : 0.12}
                      strokeDasharray={tick === 0 ? undefined : '4 3'}
                      strokeWidth="1"
                    />
                    <text
                      x={PAD_L - 6}
                      y={y + 3}
                      textAnchor="end"
                      fill="#4A4A68"
                      fontSize="9.5"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {tick}%
                    </text>
                  </g>
                );
              })}

              {/* Eixo X labels (início, meio, fim) */}
              {timeline.length > 1 && (
                <>
                  <text
                    x={PAD_L}
                    y={height - 6}
                    textAnchor="start"
                    fill="#4A4A68"
                    fontSize="9"
                    fontWeight="600"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {timeline[0].time}
                  </text>
                  {timeline.length > 4 && (
                    <text
                      x={PAD_L + plotW / 2}
                      y={height - 6}
                      textAnchor="middle"
                      fill="#4A4A68"
                      fontSize="9"
                      fontWeight="600"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {timeline[Math.floor(timeline.length / 2)].time}
                    </text>
                  )}
                  <text
                    x={PAD_L + plotW}
                    y={height - 6}
                    textAnchor="end"
                    fill="#1A1A2E"
                    fontSize="9"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {timeline[timeline.length - 1].time}
                  </text>
                </>
              )}

              {/* Linhas de todos os núcleos */}
              {Array.from({ length: detectedCoreCount }).map((_, cIdx) => {
                if (hiddenCores[cIdx]) return null;
                const color = getCoreColor(cIdx);
                const d = buildPath(cIdx);
                return (
                  <path
                    key={cIdx}
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}

              {/* Guia vertical de inspeção + pontos */}
              {hoveredPoint && (
                <g>
                  <line
                    x1={getX(activeHoverIdx)}
                    y1={PAD_T}
                    x2={getX(activeHoverIdx)}
                    y2={PAD_T + plotH}
                    stroke="#1A1A2E"
                    strokeOpacity="0.35"
                    strokeDasharray="3 3"
                    strokeWidth="1.2"
                  />
                  {Array.from({ length: detectedCoreCount }).map((_, cIdx) => {
                    if (hiddenCores[cIdx]) return null;
                    const val = hoveredPoint.cores[cIdx] ?? 0;
                    return (
                      <circle
                        key={cIdx}
                        cx={getX(activeHoverIdx)}
                        cy={getY(val)}
                        r="3.5"
                        fill={getCoreColor(cIdx)}
                        stroke="#1A1A2E"
                        strokeWidth="1.3"
                      />
                    );
                  })}
                </g>
              )}

              {/* Zonas invisíveis para hover suave por coluna */}
              {timeline.map((_, idx) => {
                const stepW = timeline.length <= 1 ? plotW : plotW / timeline.length;
                const x =
                  timeline.length <= 1
                    ? PAD_L
                    : getX(idx) - stepW / 2;
                return (
                  <rect
                    key={idx}
                    x={Math.max(PAD_L, x)}
                    y={PAD_T}
                    width={Math.max(8, stepW)}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(idx)}
                  />
                );
              })}
            </svg>

            {/* Faixa de leitura do ponto em foco */}
            {hoveredPoint && !compact && (
              <div className="flex items-center justify-between flex-wrap gap-2 px-2.5 py-1.5 rounded-md bg-[#FFF7E8] border border-[#1A1A2E]/30 text-[11px] font-mono">
                <span className="font-bold text-[#1A1A2E]">
                  Instante: <span className="text-[#FF5A36]">{hoveredPoint.time}</span>
                </span>
                <span className="text-[#4A4A68] font-semibold">
                  Média dos núcleos:{' '}
                  <strong className="text-[#1A1A2E]">
                    {(
                      hoveredPoint.cores.reduce((a, b) => a + b, 0) /
                      Math.max(1, hoveredPoint.cores.length)
                    ).toFixed(1)}
                    %
                  </strong>
                </span>
              </div>
            )}
          </div>
        ) : (
          /* Gráfico de Barras Comparativo de Todos os Núcleos */
          <svg
            viewBox={`0 0 ${W} ${height}`}
            className="w-full h-auto block select-none"
            role="img"
            aria-label={`Gráfico de barras comparando os ${detectedCoreCount} núcleos da CPU`}
          >
            {[0, 25, 50, 75, 100].map((tick) => {
              const y = getY(tick);
              return (
                <g key={tick}>
                  <line
                    x1={PAD_L}
                    y1={y}
                    x2={PAD_L + plotW}
                    y2={y}
                    stroke="#1A1A2E"
                    strokeOpacity={tick === 0 ? 0.35 : 0.12}
                    strokeDasharray={tick === 0 ? undefined : '4 3'}
                    strokeWidth="1"
                  />
                  <text
                    x={PAD_L - 6}
                    y={y + 3}
                    textAnchor="end"
                    fill="#4A4A68"
                    fontSize="9.5"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {tick}%
                  </text>
                </g>
              );
            })}

            {latestCores.map((pct, cIdx) => {
              const slotW = plotW / detectedCoreCount;
              const barW = Math.min(54, Math.max(14, slotW * 0.62));
              const cx = PAD_L + slotW * cIdx + slotW / 2;
              const x = cx - barW / 2;
              const barH = Math.max(2, (Math.min(100, Math.max(0, pct)) / 100) * plotH);
              const y = PAD_T + plotH - barH;
              const color = getCoreColor(cIdx);
              const dimmed = hiddenCores[cIdx];

              return (
                <g
                  key={cIdx}
                  opacity={dimmed ? 0.25 : 1}
                  className="cursor-pointer"
                  onClick={() => toggleCore(cIdx)}
                >
                  <rect
                    x={x + 2}
                    y={y + 2}
                    width={barW}
                    height={barH}
                    rx="4"
                    fill="#1A1A2E"
                  />
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={barH}
                    rx="4"
                    fill={color}
                    stroke="#1A1A2E"
                    strokeWidth="1.8"
                  />
                  <text
                    x={cx}
                    y={Math.max(PAD_T + 8, y - 5)}
                    textAnchor="middle"
                    fill="#1A1A2E"
                    fontSize="9.5"
                    fontWeight="800"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {pct.toFixed(1)}%
                  </text>
                  <text
                    x={cx}
                    y={height - 6}
                    textAnchor="middle"
                    fill="#1A1A2E"
                    fontSize="9.5"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    C{cIdx}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Legenda interativa de todos os núcleos */}
      <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
        {Array.from({ length: detectedCoreCount }).map((_, cIdx) => {
          const val = hoveredPoint
            ? hoveredPoint.cores[cIdx] ?? latestCores[cIdx] ?? 0
            : latestCores[cIdx] ?? 0;
          const color = getCoreColor(cIdx);
          const isHidden = !!hiddenCores[cIdx];

          return (
            <button
              key={cIdx}
              type="button"
              onClick={() => toggleCore(cIdx)}
              title={isHidden ? `Exibir Core ${cIdx}` : `Ocultar Core ${cIdx} no gráfico`}
              className={`px-2.5 py-1 rounded-md border-2 border-[#1A1A2E] flex items-center gap-1.5 cursor-pointer transition-opacity ${
                isHidden
                  ? 'bg-white/60 opacity-45'
                  : 'bg-white shadow-[1.5px_1.5px_0px_#1A1A2E] hover:bg-[#FFC857]/20'
              }`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect
                  x="1"
                  y="1"
                  width="8"
                  height="8"
                  rx="2"
                  fill={color}
                  stroke="#1A1A2E"
                  strokeWidth="1.2"
                />
              </svg>
              <span className="font-bold text-[#1A1A2E]">Core {cIdx}:</span>
              <span className="font-extrabold text-[#1A1A2E] tabular-nums">
                {isConnected ? `${val.toFixed(1)}%` : 'N/D'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

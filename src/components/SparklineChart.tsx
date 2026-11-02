import React, { useMemo } from 'react';

interface SparklineChartProps {
  data: number[];
  color?: string;
  fillGradient?: boolean;
  height?: number;
  unit?: string;
  min?: number;
  max?: number;
  showLabels?: boolean;
  label?: string;
}

export const SparklineChart: React.FC<SparklineChartProps> = ({
  data,
  color = '#FF5A36', // Coral brand default
  fillGradient = false,
  height = 52,
  unit = '',
  min: customMin,
  max: customMax,
  showLabels = true,
  label = '60s'
}) => {
  const gradientId = useMemo(() => `spark-${Math.random().toString(36).substring(2, 9)}`, []);

  const { points, areaPoints, currentVal, minVal, maxVal } = useMemo(() => {
    if (!data || data.length === 0) {
      return { points: '', areaPoints: '', currentVal: 0, minVal: 0, maxVal: 0 };
    }

    const validData = data.map(v => (v !== null && !isNaN(v) ? v : 0));
    const current = validData[validData.length - 1] ?? 0;
    const computedMin = customMin !== undefined ? customMin : Math.min(...validData);
    let computedMax = customMax !== undefined ? customMax : Math.max(...validData);

    if (computedMax === computedMin) {
      computedMax = computedMin + (computedMin === 0 ? 10 : computedMin * 0.2);
    }

    const range = computedMax - computedMin || 1;
    const width = 300;
    const padding = 3;
    const effectiveHeight = height - padding * 2;

    const coords: [number, number][] = validData.map((val, idx) => {
      const x = (idx / (Math.max(1, validData.length - 1))) * width;
      const normalized = Math.max(0, Math.min(1, (val - computedMin) / range));
      const y = height - padding - normalized * effectiveHeight;
      return [x, y];
    });

    let pathString = '';
    if (coords.length <= 1) {
      pathString = coords.length === 1 ? `M 0 ${coords[0][1]} L ${width} ${coords[0][1]}` : '';
    } else if (coords.length === 2) {
      pathString = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)} L ${coords[1][0].toFixed(1)} ${coords[1][1].toFixed(1)}`;
    } else {
      pathString = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
      for (let i = 0; i < coords.length - 1; i++) {
        const p0 = coords[Math.max(0, i - 1)];
        const p1 = coords[i];
        const p2 = coords[i + 1];
        const p3 = coords[Math.min(coords.length - 1, i + 2)];

        const tension = 0.2;
        const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
        const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
        const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
        const cp2y = p2[1] - (p3[1] - p1[1]) * tension;

        pathString += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
      }
    }

    const areaString = pathString ? `${pathString} L ${width} ${height} L 0 ${height} Z` : '';

    return {
      points: pathString,
      areaPoints: areaString,
      currentVal: current,
      minVal: computedMin,
      maxVal: computedMax
    };
  }, [data, height, customMin, customMax]);

  return (
    <div className="w-full flex flex-col font-sans">
      {showLabels && (
        <div className="flex items-center justify-between text-xs font-mono text-[#4A4A68] mb-1.5">
          <span className="flex items-center gap-1.5 text-[#1A1A2E] font-semibold">
            <span className="w-2 h-2 rounded-full border border-[#1A1A2E]" style={{ backgroundColor: color }} />
            {label}
          </span>
          <div className="flex items-center gap-2.5 text-[#4A4A68] tabular-nums">
            <span>min: {minVal.toFixed(1)}{unit}</span>
            <span>max: {maxVal.toFixed(1)}{unit}</span>
            <span className="text-[#1A1A2E] font-bold">atual: {currentVal.toFixed(1)}{unit}</span>
          </div>
        </div>
      )}

      <div className="w-full relative overflow-hidden rounded-md bg-[#FFF7E8]/70 border-2 border-[#1A1A2E]">
        <svg
          viewBox={`0 0 300 ${height}`}
          className="w-full overflow-hidden"
          style={{ height: `${height}px` }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Sóbrias linhas de grade */}
          <line x1="0" y1={height * 0.33} x2="300" y2={height * 0.33} stroke="#1A1A2E" strokeOpacity="0.1" strokeDasharray="3 3" strokeWidth="1" />
          <line x1="0" y1={height * 0.66} x2="300" y2={height * 0.66} stroke="#1A1A2E" strokeOpacity="0.1" strokeDasharray="3 3" strokeWidth="1" />

          {/* Preenchimento opcional */}
          {fillGradient && areaPoints && (
            <path d={areaPoints} fill={`url(#${gradientId})`} />
          )}

          {/* Traço limpo */}
          {points && (
            <path
              d={points}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Ponto indicador no final */}
          {data && data.length > 0 && (
            <circle
              cx="298"
              cy={height - 3 - Math.max(0, Math.min(1, ((currentVal - minVal) / (maxVal - minVal || 1)))) * (height - 6)}
              r="3"
              fill={color}
              stroke="#1A1A2E"
              strokeWidth="1.5"
            />
          )}
        </svg>
      </div>
    </div>
  );
};

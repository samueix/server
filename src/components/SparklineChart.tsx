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
  color = '#2563eb', // Clean corporate blue default
  fillGradient = true,
  height = 56,
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

    const pathString = coords.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(' ');
    const areaString = `${pathString} L ${width} ${height} L 0 ${height} Z`;

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
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
          <div className="flex items-center gap-3 text-slate-400">
            <span>min: {minVal.toFixed(1)}{unit}</span>
            <span>max: {maxVal.toFixed(1)}{unit}</span>
            <span className="text-white font-medium">atual: {currentVal.toFixed(1)}{unit}</span>
          </div>
        </div>
      )}

      <div className="w-full relative overflow-hidden rounded bg-[#090e17] border border-slate-800">
        <svg
          viewBox={`0 0 300 ${height}`}
          className="w-full overflow-hidden"
          style={{ height: `${height}px` }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Precision Grid lines */}
          <line x1="0" y1={height * 0.33} x2="300" y2={height * 0.33} stroke="#1e293b" strokeDasharray="2 2" />
          <line x1="0" y1={height * 0.66} x2="300" y2={height * 0.66} stroke="#1e293b" strokeDasharray="2 2" />

          {/* Area fill */}
          {fillGradient && areaPoints && (
            <path d={areaPoints} fill={`url(#${gradientId})`} />
          )}

          {/* Clean line stroke */}
          {points && (
            <path
              d={points}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Small dot on latest point */}
          {data && data.length > 0 && (
            <circle
              cx="300"
              cy={height - 3 - Math.max(0, Math.min(1, ((currentVal - minVal) / (maxVal - minVal || 1)))) * (height - 6)}
              r="2.5"
              fill={color}
            />
          )}
        </svg>
      </div>
    </div>
  );
};

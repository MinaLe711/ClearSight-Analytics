import React, { useMemo, useState } from 'react';
import {
  CategoryBreakdownItem,
  ColumnProfile,
  TimeSeriesPoint,
} from '../types/analytics';
import { formatCompactMetric, formatMetricValue } from '../lib/dataEngine';

const CHART_PALETTE = [
  '#2563EB', // Cobalt Blue
  '#0D9488', // Deep Teal
  '#D97706', // Warm Amber
  '#E11D48', // Rose
  '#7C3AED', // Violet
  '#0284C7', // Sky
  '#059669', // Emerald
  '#64748B', // Slate
];

interface TimeSeriesLineChartProps {
  data: TimeSeriesPoint[];
  valueMode: 'sum' | 'avg' | 'count';
  metricColumn: ColumnProfile | null;
  height?: number;
}

export const TimeSeriesLineChart: React.FC<TimeSeriesLineChartProps> = ({
  data,
  valueMode,
  metricColumn,
  height = 260,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const values = useMemo(
    () =>
      data.map((d) => {
        if (valueMode === 'count' || !metricColumn) return d.count;
        if (valueMode === 'avg') return d.metricAvg ?? 0;
        return d.metricSum ?? 0;
      }),
    [data, valueMode, metricColumn]
  );

  if (data.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-slate-500">
        No dated records match the current filters.
      </div>
    );
  }

  const width = 680;
  const padLeft = 58;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const yMin = rawMin > 0 ? 0 : rawMin;
  const yMax = rawMax === yMin ? yMin + 1 : rawMax * 1.1;

  const getX = (i: number) =>
    data.length === 1 ? padLeft + plotW / 2 : padLeft + (i / (data.length - 1)) * plotW;
  const getY = (val: number) =>
    padTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

  const linePoints = values.map((v, i) => `${getX(i).toFixed(1)},${getY(v).toFixed(1)}`).join(' ');
  const areaPoints =
    data.length > 1
      ? `${getX(0).toFixed(1)},${(padTop + plotH).toFixed(1)} ${linePoints} ${getX(data.length - 1).toFixed(1)},${(padTop + plotH).toFixed(1)}`
      : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * (yMax - yMin));
  const xTickIndices =
    data.length <= 6
      ? data.map((_, i) => i)
      : [0, Math.floor((data.length - 1) * 0.25), Math.floor((data.length - 1) * 0.5), Math.floor((data.length - 1) * 0.75), data.length - 1];

  const activePoint = hoverIdx !== null ? data[hoverIdx] : null;
  const activeVal = hoverIdx !== null ? values[hoverIdx] : null;

  const formatVal = (val: number) =>
    valueMode === 'count' || !metricColumn
      ? Math.round(val).toLocaleString('en-US')
      : formatMetricValue(val, metricColumn);

  const formatTick = (val: number) =>
    valueMode === 'count' || !metricColumn
      ? formatCompactMetric(val, null)
      : formatCompactMetric(val, metricColumn);

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible select-none"
        role="img"
        aria-label="Time series trend chart"
      >
        <defs>
          <linearGradient id="clearsight-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines */}
        {yTicks.map((tick, idx) => {
          const y = getY(tick);
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="#E2E8F0"
                strokeWidth="1"
                strokeDasharray={idx === 0 ? undefined : '3 3'}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 text-[11px] font-mono tabular-nums"
              >
                {formatTick(tick)}
              </text>
            </g>
          );
        })}

        {/* Area & Line */}
        {areaPoints && <polygon points={areaPoints} fill="url(#clearsight-area-fill)" />}
        {data.length > 1 && (
          <polyline
            fill="none"
            stroke="#2563EB"
            strokeWidth="2.25"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={linePoints}
          />
        )}

        {/* X axis ticks */}
        {Array.from(new Set(xTickIndices)).map((idx) => (
          <text
            key={idx}
            x={getX(idx)}
            y={height - 8}
            textAnchor={idx === 0 ? 'start' : idx === data.length - 1 ? 'end' : 'middle'}
            className="fill-slate-500 text-[11px]"
          >
            {data[idx].label}
          </text>
        ))}

        {/* Hover guide line */}
        {hoverIdx !== null && (
          <line
            x1={getX(hoverIdx)}
            x2={getX(hoverIdx)}
            y1={padTop}
            y2={padTop + plotH}
            stroke="#94A3B8"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* Data points & interactive hover columns */}
        {data.map((d, i) => {
          const cx = getX(i);
          const cy = getY(values[i]);
          const isActive = hoverIdx === i;
          const colW = data.length === 1 ? plotW : plotW / data.length;
          return (
            <g key={d.periodKey}>
              {(data.length <= 28 || isActive) && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? 5 : 2.75}
                  fill={isActive ? '#2563EB' : '#FFFFFF'}
                  stroke="#2563EB"
                  strokeWidth={isActive ? 2.5 : 1.75}
                />
              )}
              <rect
                x={Math.max(padLeft, cx - colW / 2)}
                y={padTop}
                width={Math.max(8, colW)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              />
            </g>
          );
        })}
      </svg>

      {activePoint && activeVal !== null && hoverIdx !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm text-xs"
          style={{
            left: `${Math.min(72, Math.max(8, (hoverIdx / Math.max(1, data.length - 1)) * 78 + 8))}%`,
          }}
        >
          <div className="font-medium text-slate-900">{activePoint.label}</div>
          <div className="mt-0.5 flex items-center gap-3 text-slate-600 tabular-nums font-mono">
            <span>{formatVal(activeVal)}</span>
            <span className="text-slate-400">·</span>
            <span>{activePoint.count} {activePoint.count === 1 ? 'row' : 'rows'}</span>
          </div>
        </div>
      )}
    </div>
  );
};

interface HorizontalBarChartProps {
  items: CategoryBreakdownItem[];
  valueMode: 'sum' | 'avg' | 'count';
  metricColumn: ColumnProfile | null;
  selectedCategories?: string[];
  onToggleCategory?: (category: string) => void;
  maxItems?: number;
}

export const HorizontalBarChart: React.FC<HorizontalBarChartProps> = ({
  items,
  valueMode,
  metricColumn,
  selectedCategories = [],
  onToggleCategory,
  maxItems = 10,
}) => {
  const visible = items.slice(0, maxItems);

  const getVal = (item: CategoryBreakdownItem) => {
    if (valueMode === 'count' || !metricColumn) return item.count;
    if (valueMode === 'avg') return item.metricAvg ?? 0;
    return item.metricSum ?? 0;
  };

  const maxVal = Math.max(1, ...visible.map(getVal));

  if (visible.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">
        No category data available for the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {visible.map((item, idx) => {
        const val = getVal(item);
        const pctWidth = Math.max(2, (val / maxVal) * 100);
        const share =
          valueMode === 'sum' && item.metricSharePct !== null
            ? item.metricSharePct
            : item.sharePct;
        const isSelected = selectedCategories.includes(item.category);
        const isDimmed = selectedCategories.length > 0 && !isSelected;

        const formattedValue =
          valueMode === 'count' || !metricColumn
            ? val.toLocaleString('en-US')
            : formatMetricValue(val, metricColumn);

        return (
          <button
            key={item.category}
            type="button"
            onClick={() => onToggleCategory?.(item.category)}
            disabled={!onToggleCategory}
            title={
              onToggleCategory
                ? `Click to filter by ${item.category} (${item.count} rows)`
                : item.category
            }
            className={`group w-full text-left rounded-md px-2 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
              onToggleCategory ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'
            } ${isSelected ? 'bg-blue-50/80 ring-1 ring-blue-200' : ''} ${
              isDimmed ? 'opacity-45' : 'opacity-100'
            }`}
          >
            <div className="flex items-baseline justify-between gap-3 text-xs mb-1">
              <span className="truncate font-medium text-slate-800 group-hover:text-slate-950">
                {item.category}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-slate-700">
                {formattedValue}
                {valueMode !== 'avg' && (
                  <span className="ml-1.5 text-slate-400">
                    ({share.toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 w-full rounded-sm bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-200"
                style={{
                  width: `${pctWidth}%`,
                  backgroundColor: isSelected ? '#1D4ED8' : CHART_PALETTE[idx % CHART_PALETTE.length],
                }}
              />
            </div>
          </button>
        );
      })}
      {items.length > maxItems && (
        <p className="pt-1 text-xs text-slate-500">
          Showing top {maxItems} of {items.length} categories
        </p>
      )}
    </div>
  );
};

interface DonutChartProps {
  items: CategoryBreakdownItem[];
  valueMode: 'sum' | 'avg' | 'count';
  metricColumn: ColumnProfile | null;
  selectedCategories?: string[];
  onToggleCategory?: (category: string) => void;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  items,
  valueMode,
  metricColumn,
  selectedCategories = [],
  onToggleCategory,
}) => {
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);

  const slices = useMemo(() => {
    const top = items.slice(0, 6);
    const rest = items.slice(6);
    const getVal = (i: CategoryBreakdownItem) =>
      valueMode === 'count' || !metricColumn ? i.count : i.metricSum ?? 0;

    const mapped = top.map((i, idx) => ({
      category: i.category,
      value: Math.max(0, getVal(i)),
      count: i.count,
      color: CHART_PALETTE[idx % CHART_PALETTE.length],
    }));

    if (rest.length > 0) {
      mapped.push({
        category: `Other (${rest.length})`,
        value: rest.reduce((acc, r) => acc + Math.max(0, getVal(r)), 0),
        count: rest.reduce((acc, r) => acc + r.count, 0),
        color: '#94A3B8',
      });
    }

    const total = mapped.reduce((acc, s) => acc + s.value, 0);
    return { mapped, total };
  }, [items, valueMode, metricColumn]);

  if (slices.mapped.length === 0 || slices.total <= 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">
        No breakdown available for the current filters.
      </div>
    );
  }

  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 68;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;
  const activeSlice = slices.mapped.find((s) => s.category === hoveredCat);

  const formatVal = (v: number) =>
    valueMode === 'count' || !metricColumn
      ? v.toLocaleString('en-US')
      : formatMetricValue(v, metricColumn);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution donut chart">
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
          />
          {slices.mapped.map((slice) => {
            const fraction = slice.value / slices.total;
            const dashLen = Math.max(0, fraction * circumference - 2);
            const dashOffset = -cumulativeOffset;
            cumulativeOffset += fraction * circumference;

            const isSelected = selectedCategories.includes(slice.category);
            const isDimmed =
              (selectedCategories.length > 0 && !isSelected) ||
              (hoveredCat !== null && hoveredCat !== slice.category);

            return (
              <circle
                key={slice.category}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={hoveredCat === slice.category || isSelected ? strokeWidth + 3 : strokeWidth}
                strokeDasharray={`${dashLen} ${circumference}`}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${cx} ${cy})`}
                className={`transition-all duration-150 ${
                  onToggleCategory && !slice.category.startsWith('Other (') ? 'cursor-pointer' : ''
                }`}
                opacity={isDimmed ? 0.38 : 1}
                onMouseEnter={() => setHoveredCat(slice.category)}
                onMouseLeave={() => setHoveredCat(null)}
                onClick={() => {
                  if (onToggleCategory && !slice.category.startsWith('Other (')) {
                    onToggleCategory(slice.category);
                  }
                }}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-5">
          <span className="text-[11px] font-medium text-slate-500 truncate max-w-[96px]">
            {activeSlice ? activeSlice.category : 'Total'}
          </span>
          <span className="text-sm font-semibold text-slate-900 font-mono tabular-nums">
            {activeSlice
              ? `${((activeSlice.value / slices.total) * 100).toFixed(1)}%`
              : formatCompactMetric(slices.total, valueMode === 'count' ? null : metricColumn)}
          </span>
        </div>
      </div>

      <div className="w-full min-w-0 flex-1 space-y-1.5">
        {slices.mapped.map((slice) => {
          const pct = (slice.value / slices.total) * 100;
          const isSelected = selectedCategories.includes(slice.category);
          const clickable = Boolean(onToggleCategory && !slice.category.startsWith('Other ('));
          return (
            <button
              key={slice.category}
              type="button"
              disabled={!clickable}
              onMouseEnter={() => setHoveredCat(slice.category)}
              onMouseLeave={() => setHoveredCat(null)}
              onClick={() => clickable && onToggleCategory?.(slice.category)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors ${
                clickable ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'
              } ${isSelected ? 'bg-blue-50/80 ring-1 ring-blue-200' : ''}`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-xs"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="truncate font-medium text-slate-700">{slice.category}</span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-slate-900">
                {formatVal(slice.value)}{' '}
                <span className="text-slate-400">({pct.toFixed(1)}%)</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface HistogramChartProps {
  bins: Array<{ label: string; count: number; min: number; max: number }>;
  columnName: string;
}

export const HistogramChart: React.FC<HistogramChartProps> = ({ bins, columnName }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (bins.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">
        No numeric values available for distribution.
      </div>
    );
  }

  const maxCount = Math.max(1, ...bins.map((b) => b.count));

  return (
    <div>
      <div className="flex items-end gap-2 h-[180px] pt-6 border-b border-slate-200 px-1">
        {bins.map((bin, i) => {
          const pctH = Math.max(4, (bin.count / maxCount) * 100);
          const isHovered = hoverIdx === i;
          return (
            <div
              key={bin.label}
              className="relative flex-1 flex flex-col items-center justify-end h-full"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {isHovered && (
                <div className="absolute -top-6 whitespace-nowrap rounded bg-slate-900 px-2 py-0.5 text-[11px] font-mono tabular-nums text-white">
                  {bin.count} rows
                </div>
              )}
              <div
                className="w-full rounded-t-sm transition-colors duration-150"
                style={{
                  height: `${pctH}%`,
                  backgroundColor: isHovered ? '#1D4ED8' : '#2563EB',
                  opacity: isHovered ? 1 : 0.85,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2 px-1">
        {bins.map((bin) => (
          <div
            key={bin.label}
            className="flex-1 truncate text-center text-[10px] font-mono tabular-nums text-slate-500"
            title={`${columnName}: ${bin.label}`}
          >
            {bin.label}
          </div>
        ))}
      </div>
    </div>
  );
};

interface ScatterPlotProps {
  points: Array<{ x: number; y: number; label: string }>;
  xCol: ColumnProfile;
  yCol: ColumnProfile;
}

export const ScatterPlotChart: React.FC<ScatterPlotProps> = ({ points, xCol, yCol }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">
        No paired numeric observations match current filters.
      </div>
    );
  }

  const sampled = points.slice(0, 300);
  const xs = sampled.map((p) => p.x);
  const ys = sampled.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs) === minX ? minX + 1 : Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys) === minY ? minY + 1 : Math.max(...ys);

  const width = 560;
  const height = 240;
  const padL = 52;
  const padR = 16;
  const padT = 16;
  const padB = 34;

  const getX = (v: number) => padL + ((v - minX) / (maxX - minX)) * (width - padL - padR);
  const getY = (v: number) => height - padB - ((v - minY) / (maxY - minY)) * (height - padT - padB);

  const active = hoverIdx !== null ? sampled[hoverIdx] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label={`Scatter plot of ${xCol.name} vs ${yCol.name}`}>
        <line x1={padL} x2={width - padR} y1={height - padB} y2={height - padB} stroke="#CBD5E1" />
        <line x1={padL} x2={padL} y1={padT} y2={height - padB} stroke="#CBD5E1" />
        <text x={padL - 8} y={padT + 8} textAnchor="end" className="fill-slate-500 text-[10px] font-mono tabular-nums">
          {formatCompactMetric(maxY, yCol)}
        </text>
        <text x={padL - 8} y={height - padB} textAnchor="end" className="fill-slate-500 text-[10px] font-mono tabular-nums">
          {formatCompactMetric(minY, yCol)}
        </text>
        <text x={padL} y={height - 10} textAnchor="start" className="fill-slate-500 text-[10px] font-mono tabular-nums">
          {formatCompactMetric(minX, xCol)}
        </text>
        <text x={width - padR} y={height - 10} textAnchor="end" className="fill-slate-500 text-[10px] font-mono tabular-nums">
          {formatCompactMetric(maxX, xCol)}
        </text>

        {sampled.map((pt, i) => (
          <circle
            key={i}
            cx={getX(pt.x)}
            cy={getY(pt.y)}
            r={hoverIdx === i ? 5.5 : 3.5}
            fill={hoverIdx === i ? '#1D4ED8' : '#2563EB'}
            fillOpacity={hoverIdx === i ? 1 : 0.65}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          />
        ))}
      </svg>
      {active && (
        <div className="mt-2 text-xs text-slate-600 font-mono tabular-nums">
          {active.label}: {xCol.name} = {formatMetricValue(active.x, xCol)} · {yCol.name} ={' '}
          {formatMetricValue(active.y, yCol)}
        </div>
      )}
    </div>
  );
};

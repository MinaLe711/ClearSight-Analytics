import React, { useMemo, useState } from 'react';
import {
  ColumnProfile,
  FilterState,
  ParsedDataset,
  ParsedRow,
} from '../types/analytics';
import {
  buildCategoryAggregation,
  buildNumericHistogram,
  buildTimeSeries,
} from '../lib/dataEngine';
import {
  DonutChart,
  HistogramChart,
  HorizontalBarChart,
  ScatterPlotChart,
  TimeSeriesLineChart,
} from './Charts';

interface VisualizationSectionProps {
  dataset: ParsedDataset;
  filteredRows: ParsedRow[];
  filters: FilterState;
  selectedMetricColumn: string | null;
  onChangeMetricColumn: (col: string | null) => void;
  onToggleCategoryFilter: (colName: string, value: string) => void;
}

export const VisualizationSection: React.FC<VisualizationSectionProps> = ({
  dataset,
  filteredRows,
  filters,
  selectedMetricColumn,
  onChangeMetricColumn,
  onToggleCategoryFilter,
}) => {
  const numericCols = useMemo(
    () => dataset.columns.filter((c) => c.type === 'numeric'),
    [dataset]
  );
  const categoricalCols = useMemo(
    () => dataset.columns.filter((c) => c.type === 'categorical' && c.uniqueCount >= 2),
    [dataset]
  );
  const dateCol = useMemo(
    () =>
      dataset.primaryDateColumn
        ? dataset.columns.find((c) => c.name === dataset.primaryDateColumn) ?? null
        : null,
    [dataset]
  );

  const metricCol: ColumnProfile | null = selectedMetricColumn
    ? numericCols.find((c) => c.name === selectedMetricColumn) ?? null
    : null;

  // Controls state
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [valueMode, setValueMode] = useState<'sum' | 'avg' | 'count'>(
    metricCol?.isAdditiveMetric ? 'sum' : metricCol ? 'avg' : 'count'
  );

  const [primaryCatColName, setPrimaryCatColName] = useState<string>(
    dataset.primaryCategoryColumn ?? categoricalCols[0]?.name ?? ''
  );
  const [primaryCatChartType, setPrimaryCatChartType] = useState<'bar' | 'donut'>('bar');

  const [secondaryCatColName, setSecondaryCatColName] = useState<string>(
    dataset.secondaryCategoryColumn ?? categoricalCols[1]?.name ?? categoricalCols[0]?.name ?? ''
  );
  const [secondaryChartType, setSecondaryChartType] = useState<'donut' | 'bar'>('donut');

  const [scatterXName, setScatterXName] = useState<string>(numericCols[0]?.name ?? '');
  const [scatterYName, setScatterYName] = useState<string>(numericCols[1]?.name ?? '');

  // Keep local dimension selections valid when dataset changes
  const activePrimaryCat =
    categoricalCols.find((c) => c.name === primaryCatColName)?.name ??
    categoricalCols[0]?.name ??
    '';

  const activeSecondaryCat =
    categoricalCols.find((c) => c.name === secondaryCatColName)?.name ??
    categoricalCols[1]?.name ??
    categoricalCols[0]?.name ??
    '';

  const effectiveMode: 'sum' | 'avg' | 'count' = metricCol ? valueMode : 'count';

  // Data computations
  const timeSeriesData = useMemo(() => {
    if (!dateCol) return [];
    return buildTimeSeries(filteredRows, dateCol.name, metricCol?.name ?? null, granularity);
  }, [filteredRows, dateCol, metricCol, granularity]);

  const primaryCatData = useMemo(() => {
    if (!activePrimaryCat) return [];
    return buildCategoryAggregation(filteredRows, activePrimaryCat, metricCol?.name ?? null);
  }, [filteredRows, activePrimaryCat, metricCol]);

  const secondaryCatData = useMemo(() => {
    if (!activeSecondaryCat) return [];
    return buildCategoryAggregation(filteredRows, activeSecondaryCat, metricCol?.name ?? null);
  }, [filteredRows, activeSecondaryCat, metricCol]);

  const histogramData = useMemo(() => {
    if (!metricCol) return [];
    return buildNumericHistogram(filteredRows, metricCol.name, 8);
  }, [filteredRows, metricCol]);

  const scatterXCol = numericCols.find((c) => c.name === scatterXName) ?? numericCols[0] ?? null;
  const scatterYCol = numericCols.find((c) => c.name === scatterYName) ?? numericCols[1] ?? null;

  const scatterPoints = useMemo(() => {
    if (!scatterXCol || !scatterYCol) return [];
    const labelCol = activePrimaryCat || dataset.groupingIdColumn || '';
    const pts: Array<{ x: number; y: number; label: string }> = [];
    for (const r of filteredRows) {
      const xv = r.parsed[scatterXCol.name];
      const yv = r.parsed[scatterYCol.name];
      if (typeof xv === 'number' && typeof yv === 'number') {
        pts.push({
          x: xv,
          y: yv,
          label: labelCol ? String(r.raw[labelCol] || `Row ${r.__rowIndex}`) : `Row ${r.__rowIndex}`,
        });
      }
    }
    return pts;
  }, [filteredRows, scatterXCol, scatterYCol, activePrimaryCat, dataset.groupingIdColumn]);

  const metricLabel =
    effectiveMode === 'count' || !metricCol
      ? 'Record Count'
      : effectiveMode === 'avg'
      ? `Average ${metricCol.name}`
      : `Total ${metricCol.name}`;

  return (
    <section id="charts" className="space-y-5">
      {/* Shared Visualization Explorer Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-4">
          {numericCols.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <span>Metric</span>
              <select
                value={selectedMetricColumn ?? '__count__'}
                onChange={(e) => {
                  const val = e.target.value;
                  onChangeMetricColumn(val === '__count__' ? null : val);
                }}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                {numericCols.map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.name}
                  </option>
                ))}
                <option value="__count__">Row Count Only</option>
              </select>
            </label>
          )}

          {metricCol && (
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Aggregation mode">
              {(['sum', 'avg', 'count'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setValueMode(mode)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    effectiveMode === mode
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode === 'sum' ? 'Total' : mode === 'avg' ? 'Average' : 'Count'}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500">
          Click any bar or slice below to filter the dashboard
        </p>
      </div>

      {/* Primary Time-Series OR Numeric Distribution */}
      {dateCol ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {metricLabel} over Time
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Grouped by {dateCol.name} ({granularity})
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Time granularity">
              {(['day', 'week', 'month'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGranularity(g)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                    granularity === g
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {g === 'day' ? 'Daily' : g === 'week' ? 'Weekly' : 'Monthly'}
                </button>
              ))}
            </div>
          </div>

          <TimeSeriesLineChart
            data={timeSeriesData}
            valueMode={effectiveMode}
            metricColumn={metricCol}
          />
        </div>
      ) : metricCol ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">
              {metricCol.name} Distribution
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Frequency histogram across {filteredRows.length.toLocaleString('en-US')} active records
            </p>
          </div>
          <HistogramChart bins={histogramData} columnName={metricCol.name} />
        </div>
      ) : null}

      {/* Two-Column Breakdown Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Breakdown Card 1 */}
        {categoricalCols.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {metricLabel} by {activePrimaryCat}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sorted by {effectiveMode === 'count' ? 'record count' : effectiveMode === 'avg' ? 'average' : 'total'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {categoricalCols.length > 1 && (
                  <select
                    aria-label="Primary breakdown column"
                    value={activePrimaryCat}
                    onChange={(e) => setPrimaryCatColName(e.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
                  >
                    {categoricalCols.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPrimaryCatChartType('bar')}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      primaryCatChartType === 'bar'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Bar
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrimaryCatChartType('donut')}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      primaryCatChartType === 'donut'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Donut
                  </button>
                </div>
              </div>
            </div>

            {primaryCatChartType === 'bar' ? (
              <HorizontalBarChart
                items={primaryCatData}
                valueMode={effectiveMode}
                metricColumn={metricCol}
                selectedCategories={filters.categorySelections[activePrimaryCat] ?? []}
                onToggleCategory={(cat) => onToggleCategoryFilter(activePrimaryCat, cat)}
              />
            ) : (
              <DonutChart
                items={primaryCatData}
                valueMode={effectiveMode === 'avg' ? 'sum' : effectiveMode}
                metricColumn={metricCol}
                selectedCategories={filters.categorySelections[activePrimaryCat] ?? []}
                onToggleCategory={(cat) => onToggleCategoryFilter(activePrimaryCat, cat)}
              />
            )}
          </div>
        )}

        {/* Breakdown Card 2: Secondary Category Donut/Bar OR Scatter OR Histogram */}
        {categoricalCols.length > 1 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {effectiveMode === 'avg' ? 'Total' : metricLabel} Share by {activeSecondaryCat}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Composition across {secondaryCatData.length} groups
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Secondary breakdown column"
                  value={activeSecondaryCat}
                  onChange={(e) => setSecondaryCatColName(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  {categoricalCols.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setSecondaryChartType('donut')}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      secondaryChartType === 'donut'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Donut
                  </button>
                  <button
                    type="button"
                    onClick={() => setSecondaryChartType('bar')}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      secondaryChartType === 'bar'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Bar
                  </button>
                </div>
              </div>
            </div>

            {secondaryChartType === 'donut' ? (
              <DonutChart
                items={secondaryCatData}
                valueMode={effectiveMode === 'avg' ? 'sum' : effectiveMode}
                metricColumn={metricCol}
                selectedCategories={filters.categorySelections[activeSecondaryCat] ?? []}
                onToggleCategory={(cat) => onToggleCategoryFilter(activeSecondaryCat, cat)}
              />
            ) : (
              <HorizontalBarChart
                items={secondaryCatData}
                valueMode={effectiveMode}
                metricColumn={metricCol}
                selectedCategories={filters.categorySelections[activeSecondaryCat] ?? []}
                onToggleCategory={(cat) => onToggleCategoryFilter(activeSecondaryCat, cat)}
              />
            )}
          </div>
        ) : numericCols.length >= 2 && scatterXCol && scatterYCol ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {scatterXCol.name} vs. {scatterYCol.name}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Numeric relationship scatter plot</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="X axis metric"
                  value={scatterXCol.name}
                  onChange={(e) => setScatterXName(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                >
                  {numericCols.map((c) => (
                    <option key={c.name} value={c.name}>
                      X: {c.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Y axis metric"
                  value={scatterYCol.name}
                  onChange={(e) => setScatterYName(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                >
                  {numericCols.map((c) => (
                    <option key={c.name} value={c.name}>
                      Y: {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <ScatterPlotChart points={scatterPoints} xCol={scatterXCol} yCol={scatterYCol} />
          </div>
        ) : dateCol && metricCol ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-900">
                {metricCol.name} Distribution
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Value spread across {filteredRows.length.toLocaleString('en-US')} active records
              </p>
            </div>
            <HistogramChart bins={histogramData} columnName={metricCol.name} />
          </div>
        ) : null}
      </div>
    </section>
  );
};

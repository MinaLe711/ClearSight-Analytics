import React from 'react';
import {
  ColumnProfile,
  ParsedDataset,
  StatisticalProfile,
} from '../types/analytics';
import { formatMetricValue, formatShortDate } from '../lib/dataEngine';

interface KPIRowProps {
  dataset: ParsedDataset;
  profile: StatisticalProfile;
  selectedMetricColumn: string | null;
}

interface KpiCardData {
  label: string;
  value: string;
  subline: string;
}

export const KPIRow: React.FC<KPIRowProps> = ({
  dataset,
  profile,
  selectedMetricColumn,
}) => {
  const metricCol: ColumnProfile | null = selectedMetricColumn
    ? dataset.columns.find((c) => c.name === selectedMetricColumn) ?? null
    : null;

  const metricStat = metricCol
    ? profile.numericStats.find((s) => s.column === metricCol.name) ?? null
    : null;

  const cards: KpiCardData[] = [];

  // Card 1: Active Records & Grouping Context
  const { filteredRows, totalRows, overallCompletenessPct } = profile.datasetSummary;
  const grp = profile.identifierGroupStats;
  cards.push({
    label: 'Active Records',
    value: filteredRows.toLocaleString('en-US'),
    subline: grp
      ? `${grp.uniqueGroups.toLocaleString('en-US')} unique ${grp.column} · ${grp.avgRowsPerGroup.toFixed(2)} rows/group`
      : filteredRows === totalRows
      ? `${overallCompletenessPct.toFixed(1)}% cell completeness`
      : `of ${totalRows.toLocaleString('en-US')} total rows (${profile.datasetSummary.filteredSharePct.toFixed(1)}%)`,
  });

  // Card 2 & 3: Numeric Metric KPIs (only when numeric column exists and has valid values)
  if (metricCol && metricStat && metricStat.validCount > 0) {
    if (metricCol.isAdditiveMetric) {
      cards.push({
        label: `Total ${metricCol.name}`,
        value: formatMetricValue(metricStat.sum, metricCol),
        subline: grp && grp.avgGroupMetricTotal !== null
          ? `Avg ${formatMetricValue(grp.avgGroupMetricTotal, metricCol)} per ${grp.column}`
          : `Across ${metricStat.validCount.toLocaleString('en-US')} valid values`,
      });
    } else {
      cards.push({
        label: `Median ${metricCol.name}`,
        value: formatMetricValue(metricStat.median, metricCol),
        subline: `IQR ${formatMetricValue(metricStat.q1, metricCol)} – ${formatMetricValue(metricStat.q3, metricCol)}`,
      });
    }

    cards.push({
      label: `Average ${metricCol.name}`,
      value: formatMetricValue(metricStat.mean, metricCol),
      subline: `Median ${formatMetricValue(metricStat.median, metricCol)} · Range ${formatMetricValue(metricStat.min, metricCol)}–${formatMetricValue(metricStat.max, metricCol)}`,
    });
  } else if (profile.categoricalBreakdowns.length > 0) {
    const primaryCat = profile.categoricalBreakdowns[0];
    const top = primaryCat.items[0];
    cards.push({
      label: `Top ${primaryCat.column}`,
      value: top ? top.category : '—',
      subline: top
        ? `${top.count.toLocaleString('en-US')} rows (${top.sharePct.toFixed(1)}% share)`
        : 'No matching values',
    });
    cards.push({
      label: `${primaryCat.column} Variety`,
      value: primaryCat.uniqueCount.toLocaleString('en-US'),
      subline:
        primaryCat.missingCount > 0
          ? `${primaryCat.missingCount} missing value(s)`
          : '0 missing values',
    });
  } else {
    cards.push({
      label: 'Columns Profiled',
      value: String(dataset.columns.length),
      subline: `${overallCompletenessPct.toFixed(1)}% non-missing data`,
    });
  }

  // Card 4: Time Span / Daily Pace OR Top Category
  if (profile.dateAnalysis) {
    const da = profile.dateAnalysis;
    const paceText =
      da.avgMetricPerActiveDay !== null && metricCol
        ? `${formatMetricValue(da.avgMetricPerActiveDay, metricCol)}/active day`
        : `${da.avgRowsPerActiveDay.toFixed(1)} rows/active day`;
    cards.push({
      label: 'Time Span',
      value: `${da.spanDays} ${da.spanDays === 1 ? 'day' : 'days'}`,
      subline: `${formatShortDate(da.minDate)} – ${formatShortDate(da.maxDate)} · ${paceText}`,
    });
  } else if (profile.categoricalBreakdowns.length > 0 && metricCol) {
    const topCat = profile.categoricalBreakdowns[0];
    const leader = topCat.items[0];
    cards.push({
      label: `Top ${topCat.column}`,
      value: leader ? leader.category : '—',
      subline: leader
        ? `${
            leader.metricSum !== null
              ? formatMetricValue(leader.metricSum, metricCol)
              : `${leader.count} rows`
          } (${(leader.metricSharePct ?? leader.sharePct).toFixed(1)}%)`
        : 'No matching categories',
    });
  } else {
    cards.push({
      label: 'Data Completeness',
      value: `${overallCompletenessPct.toFixed(1)}%`,
      subline: `${dataset.columns.filter((c) => c.missingCount > 0).length} column(s) with missing values`,
    });
  }

  return (
    <section
      id="overview"
      aria-label="Key performance indicators"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex flex-col justify-between"
        >
          <div className="text-xs font-medium text-slate-500 truncate">{card.label}</div>
          <div
            className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 font-mono tabular-nums truncate"
            title={card.value}
          >
            {card.value}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums truncate" title={card.subline}>
            {card.subline}
          </div>
        </div>
      ))}
    </section>
  );
};

import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ParsedDataset } from '../types/analytics';
import { formatMetricValue } from '../lib/dataEngine';

interface SchemaInspectorProps {
  dataset: ParsedDataset;
}

const TYPE_LABEL: Record<string, string> = {
  numeric: 'Numeric',
  date: 'Date / Time',
  categorical: 'Category',
  identifier: 'Identifier',
  text: 'Text',
};

export const SchemaInspector: React.FC<SchemaInspectorProps> = ({ dataset }) => {
  return (
    <section id="schema" className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Schema & Data Quality</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Automatic column type detection, missing-value audit, and observed value ranges
          </p>
        </div>
        <div className="text-xs text-slate-500 font-mono tabular-nums">
          {dataset.columns.length} columns · {dataset.rows.length.toLocaleString('en-US')} total rows
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70">
              <th className="px-5 py-2.5 font-semibold text-slate-700">Column</th>
              <th className="px-4 py-2.5 font-semibold text-slate-700">Detected Type</th>
              <th className="px-4 py-2.5 font-semibold text-slate-700 text-right">Unique</th>
              <th className="px-4 py-2.5 font-semibold text-slate-700 text-right">Missing</th>
              <th className="px-4 py-2.5 font-semibold text-slate-700">Range / Sample Values</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dataset.columns.map((col) => {
              const hasMissing = col.missingCount > 0;
              let summary = col.sampleValues.slice(0, 3).join(', ');
              if (col.type === 'numeric' && col.min !== undefined && col.max !== undefined) {
                summary = `${formatMetricValue(col.min, col)} to ${formatMetricValue(col.max, col)}`;
              } else if (col.type === 'date' && col.minDate && col.maxDate) {
                summary = `${col.minDate} to ${col.maxDate}`;
              }

              return (
                <tr key={col.name} className="hover:bg-slate-50/70">
                  <td className="px-5 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                    {col.name}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                    {TYPE_LABEL[col.type] ?? col.type}
                    {col.numericFormat === 'currency' ? ' · Currency' : ''}
                    {col.numericFormat === 'percentage' ? ' · Percent' : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                    {col.uniqueCount.toLocaleString('en-US')}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {hasMissing ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {col.missingCount} ({col.missingPct.toFixed(1)}%)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        0 (0%)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 font-mono tabular-nums max-w-[320px] truncate" title={summary}>
                    {summary || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, RefreshCw, Send } from 'lucide-react';
import {
  AIAskResponse,
  AIInsightsResponse,
  ParsedDataset,
  StatisticalProfile,
} from '../types/analytics';
import { formatMetricValue } from '../lib/dataEngine';

interface AIInsightsPanelProps {
  dataset: ParsedDataset;
  profile: StatisticalProfile;
  activeFiltersSummary: string;
}

export const AIInsightsPanel: React.FC<AIInsightsPanelProps> = ({
  dataset,
  profile,
  activeFiltersSummary,
}) => {
  const [insights, setInsights] = useState<AIInsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [qaResult, setQaResult] = useState<{ question: string; response: AIAskResponse } | null>(null);

  const lastAutoKeyRef = useRef<string>('');

  const primaryNumCol = useMemo(
    () =>
      dataset.primaryNumericColumn
        ? dataset.columns.find((c) => c.name === dataset.primaryNumericColumn) ?? null
        : null,
    [dataset]
  );

  const fetchInsights = async () => {
    if (profile.datasetSummary.filteredRows === 0) {
      setError('Cannot generate insights because no rows match the current filters.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetName: dataset.fileName,
          statisticalProfile: profile,
          activeFiltersSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Request failed with status ${res.status}`);
      }
      setInsights(data as AIInsightsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate AI insights.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate insights once per uploaded dataset on load
  useEffect(() => {
    const key = `${dataset.fileName}:${dataset.loadedAt}`;
    if (lastAutoKeyRef.current !== key && profile.datasetSummary.filteredRows > 0) {
      lastAutoKeyRef.current = key;
      setQaResult(null);
      setQuestion('');
      fetchInsights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset.fileName, dataset.loadedAt]);

  const handleAsk = async (qText?: string) => {
    const query = (qText ?? question).trim();
    if (!query) return;
    setAsking(true);
    setAskError(null);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: query,
          datasetName: dataset.fileName,
          statisticalProfile: profile,
          activeFiltersSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Request failed with status ${res.status}`);
      }
      setQaResult({ question: query, response: data as AIAskResponse });
      if (!qText) setQuestion('');
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Failed to answer question.');
    } finally {
      setAsking(false);
    }
  };

  // Build deterministic calculated highlights directly from profile (always accurate & verifiable)
  const deterministicHighlights = useMemo(() => {
    const items: Array<{ label: string; detail: string }> = [];
    const primaryStat = profile.numericStats.find((s) => s.column === dataset.primaryNumericColumn);

    if (primaryStat && primaryNumCol) {
      items.push({
        label: `${primaryStat.column} Spread`,
        detail: `Mean ${formatMetricValue(primaryStat.mean, primaryNumCol)} vs. Median ${formatMetricValue(primaryStat.median, primaryNumCol)} (Range ${formatMetricValue(primaryStat.min, primaryNumCol)}–${formatMetricValue(primaryStat.max, primaryNumCol)}, SD ${formatMetricValue(primaryStat.stdDev, primaryNumCol)}).`,
      });
      if (primaryStat.outlierCount > 0) {
        const example = primaryStat.outlierExamples[0];
        items.push({
          label: `Outliers Detected (${primaryStat.outlierCount})`,
          detail: `${primaryStat.outlierCount} value(s) fall outside the IQR fence, led by ${formatMetricValue(example.value, primaryNumCol)} (${example.label}).`,
        });
      }
    }

    if (profile.dateAnalysis?.firstHalfVsSecondHalf) {
      const half = profile.dateAnalysis.firstHalfVsSecondHalf;
      if (half.metricChangePct !== null && primaryNumCol) {
        const dir = half.metricChangePct >= 0 ? 'higher' : 'lower';
        items.push({
          label: 'Period Comparison',
          detail: `Second half (${half.secondHalfLabel}) was ${Math.abs(half.metricChangePct).toFixed(1)}% ${dir} than the first half (${formatMetricValue(half.secondHalfMetricSum, primaryNumCol)} vs. ${formatMetricValue(half.firstHalfMetricSum, primaryNumCol)}).`,
        });
      } else if (half.rowChangePct !== null) {
        items.push({
          label: 'Period Volume Shift',
          detail: `Record volume shifted ${half.rowChangePct >= 0 ? '+' : ''}${half.rowChangePct.toFixed(1)}% between first half (${half.firstHalfRows} rows) and second half (${half.secondHalfRows} rows).`,
        });
      }
    }

    if (profile.identifierGroupStats) {
      const grp = profile.identifierGroupStats;
      items.push({
        label: `Grouping (${grp.column})`,
        detail: `${grp.uniqueGroups.toLocaleString('en-US')} unique groups across ${profile.datasetSummary.filteredRows.toLocaleString('en-US')} rows (${grp.multiRowGroups} multi-item groups, avg ${grp.avgRowsPerGroup.toFixed(2)} items/group${
          grp.avgGroupMetricTotal !== null && primaryNumCol
            ? `, avg total ${formatMetricValue(grp.avgGroupMetricTotal, primaryNumCol)}`
            : ''
        }).`,
      });
    }

    for (const corr of profile.numericCorrelations.slice(0, 2)) {
      items.push({
        label: `Association: ${corr.columnA} & ${corr.columnB}`,
        detail: `Pearson r = ${corr.pearsonR.toFixed(2)} (${corr.strength} linear association across n = ${corr.sampleSize}; correlation does not imply causation).`,
      });
    }

    return items;
  }, [profile, dataset.primaryNumericColumn, primaryNumCol]);

  const fallbackQuestions = useMemo(() => {
    const qs: string[] = [];
    if (dataset.primaryCategoryColumn && dataset.primaryNumericColumn) {
      qs.push(`Which ${dataset.primaryCategoryColumn} contributes the largest share of ${dataset.primaryNumericColumn}?`);
    }
    if (dataset.primaryDateColumn) {
      qs.push(`How do weekdays compare to weekends in this dataset?`);
    }
    if (dataset.secondaryCategoryColumn && dataset.primaryNumericColumn) {
      qs.push(`Does average ${dataset.primaryNumericColumn} differ across ${dataset.secondaryCategoryColumn}?`);
    }
    if (qs.length === 0) {
      qs.push('What are the most notable patterns and data quality caveats in this dataset?');
    }
    return qs;
  }, [dataset]);

  const starterQuestions = insights?.suggestedQuestions?.length
    ? insights.suggestedQuestions
    : fallbackQuestions;

  return (
    <section id="ai-insights" className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">AI Insights & Evidence</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Plain-language findings grounded strictly in calculated statistics for the current view
          </p>
        </div>

        <button
          type="button"
          onClick={fetchInsights}
          disabled={loading || profile.datasetSummary.filteredRows === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Analyzing...' : 'Refresh Insights'}
        </button>
      </div>

      <div className="p-5 space-y-6">
        {/* Deterministic Calculated Evidence Strip */}
        {deterministicHighlights.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <h3 className="text-xs font-semibold text-slate-800 mb-3">
              Verified Statistical Calculations (Active Subset)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {deterministicHighlights.map((item) => (
                <div key={item.label} className="text-xs">
                  <div className="font-semibold text-slate-800">{item.label}</div>
                  <p className="mt-0.5 text-slate-600 leading-relaxed tabular-nums">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Executive Summary & Cards */}
        {loading && !insights ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-16 rounded-lg bg-slate-100 animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-28 rounded-lg bg-slate-100 animate-pulse" />
              <div className="h-28 rounded-lg bg-slate-100 animate-pulse" />
            </div>
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/70 p-4 text-xs text-red-900">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">AI Narrative Unavailable</p>
              <p className="mt-1 text-red-800">{error}</p>
            </div>
          </div>
        ) : insights ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
              <div className="text-xs font-semibold text-blue-900">Executive Summary</div>
              <p className="mt-1 text-sm text-slate-800 leading-relaxed">
                {insights.executiveSummary}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insights.insights.map((item, idx) => (
                <article
                  key={`${item.title}-${idx}`}
                  className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="text-xs text-slate-500 mb-1">
                      {item.category}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                      {item.explanation}
                    </p>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                    <div>
                      <span className="font-semibold text-slate-700">Evidence: </span>
                      <span className="text-slate-700 tabular-nums">{item.evidence}</span>
                    </div>
                    <div className="text-slate-500">
                      <span className="font-medium text-slate-600">Note: </span>
                      {item.caveat}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {/* Interactive Natural-Language Q&A */}
        <div className="border-t border-slate-200 pt-5">
          <h3 className="text-xs font-semibold text-slate-800 mb-2">
            Ask a question about the active data
          </h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., Which category has the highest average value?"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              type="submit"
              disabled={asking || !question.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              {asking ? 'Answering...' : 'Ask AI'}
            </button>
          </form>

          <div className="mt-2.5 flex flex-wrap gap-2">
            {starterQuestions.map((sq) => (
              <button
                key={sq}
                type="button"
                disabled={asking}
                onClick={() => handleAsk(sq)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-100 transition-colors"
              >
                {sq}
              </button>
            ))}
          </div>

          {askError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50/70 p-3 text-xs text-red-800">
              {askError}
            </div>
          )}

          {qaResult && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-2.5">
              <div className="text-xs font-semibold text-slate-900">
                Q: {qaResult.question}
              </div>
              <p className="text-xs text-slate-800 leading-relaxed">{qaResult.response.answer}</p>
              {qaResult.response.evidencePoints.length > 0 && (
                <ul className="list-disc pl-4 space-y-1 text-xs text-slate-700 tabular-nums">
                  {qaResult.response.evidencePoints.map((pt, i) => (
                    <li key={i}>{pt}</li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-slate-500">
                Scope & limitations: {qaResult.response.limitationNote}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

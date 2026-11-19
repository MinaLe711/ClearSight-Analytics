export type ColumnType = 'numeric' | 'date' | 'categorical' | 'identifier' | 'text';

export type NumericFormat = 'number' | 'currency' | 'percentage';

export interface ColumnProfile {
  name: string;
  type: ColumnType;
  numericFormat?: NumericFormat;
  currencySymbol?: string;
  decimals: number;
  totalCount: number;
  validCount: number;
  missingCount: number;
  missingPct: number;
  uniqueCount: number;
  sampleValues: string[];
  // Numeric summary (full dataset)
  min?: number;
  max?: number;
  mean?: number;
  // Date summary (full dataset)
  minDate?: string;
  maxDate?: string;
  // Categorical summary
  topValues?: Array<{ value: string; count: number }>;
  // Heuristic flags
  isAdditiveMetric?: boolean;
  hasRepeatedGroups?: boolean;
}

export interface ParsedRow {
  __rowIndex: number;
  raw: Record<string, string>;
  parsed: Record<string, string | number | null>;
  dateKeys: Record<string, string | null>; // YYYY-MM-DD normalized
}

export interface ParsedDataset {
  fileName: string;
  fileSizeBytes: number;
  loadedAt: string;
  columns: ColumnProfile[];
  rows: ParsedRow[];
  primaryNumericColumn: string | null;
  primaryDateColumn: string | null;
  primaryCategoryColumn: string | null;
  secondaryCategoryColumn: string | null;
  groupingIdColumn: string | null;
  warnings: string[];
}

export interface FilterState {
  searchQuery: string;
  dateStart: string;
  dateEnd: string;
  categorySelections: Record<string, string[]>;
  numericRange: {
    column: string;
    min: number | null;
    max: number | null;
  } | null;
}

export interface NumericStats {
  column: string;
  format: NumericFormat;
  currencySymbol?: string;
  validCount: number;
  missingCount: number;
  missingPct: number;
  sum: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  iqr: number;
  outlierCount: number;
  outlierExamples: Array<{ rowNumber: number; value: number; label: string }>;
}

export interface CategoryBreakdownItem {
  category: string;
  count: number;
  sharePct: number;
  metricSum: number | null;
  metricAvg: number | null;
  metricMin: number | null;
  metricMax: number | null;
  metricSharePct: number | null;
}

export interface TimeSeriesPoint {
  periodKey: string;
  label: string;
  count: number;
  metricSum: number | null;
  metricAvg: number | null;
}

export interface IdentifierGroupStats {
  column: string;
  uniqueGroups: number;
  multiRowGroups: number;
  avgRowsPerGroup: number;
  maxRowsInGroup: number;
  avgGroupMetricTotal: number | null;
  maxGroupMetricTotal: number | null;
  maxGroupId: string | null;
}

export interface StatisticalProfile {
  datasetSummary: {
    totalRows: number;
    filteredRows: number;
    filteredSharePct: number;
    columnCount: number;
    overallCompletenessPct: number;
    primaryMetricColumn: string | null;
    primaryDateColumn: string | null;
  };
  numericStats: NumericStats[];
  dateAnalysis: {
    column: string;
    minDate: string;
    maxDate: string;
    spanDays: number;
    activeDays: number;
    avgRowsPerActiveDay: number;
    avgMetricPerActiveDay: number | null;
    peakDay: { date: string; count: number; metricSum: number | null } | null;
    lowestDay: { date: string; count: number; metricSum: number | null } | null;
    firstHalfVsSecondHalf: {
      firstHalfLabel: string;
      secondHalfLabel: string;
      firstHalfRows: number;
      secondHalfRows: number;
      firstHalfMetricSum: number | null;
      secondHalfMetricSum: number | null;
      metricChangePct: number | null;
      rowChangePct: number | null;
    } | null;
    weekdayVsWeekend: {
      weekdayRows: number;
      weekendRows: number;
      weekdayAvgMetricPerRow: number | null;
      weekendAvgMetricPerRow: number | null;
      weekdayAvgMetricPerDay: number | null;
      weekendAvgMetricPerDay: number | null;
    };
    monthlyTrend: Array<{
      month: string;
      count: number;
      metricSum: number | null;
      metricAvg: number | null;
    }>;
  } | null;
  categoricalBreakdowns: Array<{
    column: string;
    uniqueCount: number;
    missingCount: number;
    topSharePct: number;
    topThreeSharePct: number;
    items: CategoryBreakdownItem[];
  }>;
  identifierGroupStats: IdentifierGroupStats | null;
  numericCorrelations: Array<{
    columnA: string;
    columnB: string;
    pearsonR: number;
    sampleSize: number;
    strength: 'negligible' | 'weak' | 'moderate' | 'strong';
  }>;
  crossDimensions: Array<{
    primaryDim: string;
    secondaryDim: string;
    topCombinations: Array<{
      primaryValue: string;
      secondaryValue: string;
      count: number;
      metricSum: number | null;
      metricAvg: number | null;
    }>;
  }>;
}

export interface AIInsightItem {
  title: string;
  category: string;
  explanation: string;
  evidence: string;
  caveat: string;
}

export interface AIInsightsResponse {
  executiveSummary: string;
  insights: AIInsightItem[];
  suggestedQuestions: string[];
}

export interface AIAskResponse {
  answer: string;
  evidencePoints: string[];
  limitationNote: string;
}

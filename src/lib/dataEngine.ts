import Papa from 'papaparse';
import {
  CategoryBreakdownItem,
  ColumnProfile,
  ColumnType,
  FilterState,
  IdentifierGroupStats,
  NumericFormat,
  NumericStats,
  ParsedDataset,
  ParsedRow,
  StatisticalProfile,
  TimeSeriesPoint,
} from '../types/analytics';

const MISSING_TOKENS = new Set(['', 'na', 'n/a', 'null', 'none', 'nan', 'undefined', '-', '--']);

export function isMissingValue(raw: string | undefined | null): boolean {
  if (raw === undefined || raw === null) return true;
  return MISSING_TOKENS.has(raw.trim().toLowerCase());
}

interface ParsedNumericResult {
  value: number;
  format: NumericFormat;
  currencySymbol?: string;
  decimals: number;
}

export function tryParseNumeric(raw: string): ParsedNumericResult | null {
  const trimmed = raw.trim();
  if (!trimmed || isMissingValue(trimmed)) return null;

  // Reject strings that contain letters (except scientific notation e/E)
  // and reject date-like strings such as 2025-08-15 or 08/15/2025
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(trimmed) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(trimmed)) {
    return null;
  }

  let s = trimmed;
  let negative = false;

  // Accounting parentheses: ($120.50) -> -120.50
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  let format: NumericFormat = 'number';
  let currencySymbol: string | undefined;

  // Currency prefix or suffix
  const currencyMatch = s.match(/^([$€£¥₹])\s*(.+)$/);
  if (currencyMatch) {
    format = 'currency';
    currencySymbol = currencyMatch[1];
    s = currencyMatch[2].trim();
  } else {
    const currencySuffix = s.match(/^(.+?)\s*([$€£¥₹])$/);
    if (currencySuffix) {
      format = 'currency';
      currencySymbol = currencySuffix[2];
      s = currencySuffix[1].trim();
    }
  }

  if (s.endsWith('%')) {
    format = 'percentage';
    s = s.slice(0, -1).trim();
  }

  // Handle leading sign after currency e.g. $-42.50 or -$42.50
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }

  // Remove currency again in case -$88.00 was written
  const innerCurrency = s.match(/^([$€£¥₹])\s*(.+)$/);
  if (innerCurrency) {
    format = 'currency';
    currencySymbol = innerCurrency[1];
    s = innerCurrency[2].trim();
  }

  // Remove thousands separators (e.g. 1,234.56)
  const normalized = s.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;

  const dotIdx = normalized.indexOf('.');
  const decimals = dotIdx >= 0 ? Math.min(4, normalized.length - dotIdx - 1) : 0;

  return {
    value: negative ? -num : num,
    format,
    currencySymbol,
    decimals,
  };
}

export function tryParseDateKey(raw: string): string | null {
  const s = raw.trim();
  if (!s || isMissingValue(s)) return null;

  // Must match an explicit date pattern so IDs like "TT-1001" or plain numbers never parse as dates
  // 1. YYYY-MM-DD or YYYY/MM/DD (with optional time)
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    return validateYMD(y, m, d);
  }

  // 2. MM/DD/YYYY or MM-DD-YYYY (or DD/MM/YYYY if first > 12)
  const slashMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s.*)?$/);
  if (slashMatch) {
    const a = Number(slashMatch[1]);
    const b = Number(slashMatch[2]);
    const y = Number(slashMatch[3]);
    if (a > 12 && b <= 12) {
      return validateYMD(y, b, a);
    }
    return validateYMD(y, a, b);
  }

  // 3. Named month e.g. "Aug 15, 2025" or "15 Aug 2025"
  if (/[a-zA-Z]{3,}/.test(s) && /\d{4}/.test(s)) {
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getUTCFullYear();
      const m = parsed.getUTCMonth() + 1;
      const d = parsed.getUTCDate();
      return validateYMD(y, m, d);
    }
  }

  return null;
}

function validateYMD(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() + 1 !== m ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function looksLikeIdentifierName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return (
    lower === 'id' ||
    /(^|[\s_-])(id|uuid|guid|sku|code|invoice|receipt|transaction|order[\s_-]?number|order[\s_-]?no|account[\s_-]?no|zip|postal)($|[\s_-])/i.test(
      lower
    )
  );
}

function isLikelyNonAdditiveNumeric(name: string, values: number[]): boolean {
  const lower = name.trim().toLowerCase();
  if (/(^|[\s_-])(id|zip|postal|year|code|phone|age|rating|score|index|rank|pct|percent|rate)($|[\s_-])/i.test(lower)) {
    return true;
  }
  // Monotonic sequential integers (1, 2, 3, 4...) are row IDs, not additive metrics
  if (values.length >= 10) {
    const allIntegers = values.every((v) => Number.isInteger(v));
    if (allIntegers) {
      let sequential = true;
      for (let i = 1; i < Math.min(values.length, 25); i++) {
        if (values[i] !== values[i - 1] + 1) {
          sequential = false;
          break;
        }
      }
      if (sequential) return true;
    }
  }
  return false;
}

export function parseCSVContent(
  csvText: string,
  fileName: string,
  fileSizeBytes: number
): ParsedDataset {
  const cleanedText = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleanedText) {
    throw new Error('The uploaded file is empty. Please upload a CSV file containing a header row and at least one data row.');
  }

  // Reject obvious binary content
  if (cleanedText.slice(0, 1000).includes('\u0000')) {
    throw new Error('This file appears to be binary rather than plain-text CSV. Please upload a valid UTF-8 CSV file.');
  }

  const result = Papa.parse<Record<string, string>>(cleanedText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header, index) => {
      const trimmed = header.trim();
      return trimmed || `Column_${index + 1}`;
    },
  });

  if (result.errors && result.errors.length > 0) {
    const fatal = result.errors.find((e) => e.type === 'Quotes' || e.type === 'Delimiter');
    if (fatal && (!result.data || result.data.length === 0)) {
      throw new Error(`Could not parse CSV structure: ${fatal.message} (row ${fatal.row ?? 'unknown'}).`);
    }
  }

  const fields = (result.meta.fields ?? []).filter((f) => f.trim().length > 0);
  if (fields.length === 0) {
    throw new Error('No column headers were detected in the CSV file.');
  }

  // Deduplicate identical header names if present
  const seenHeaders = new Map<string, number>();
  const uniqueFields = fields.map((f) => {
    const count = seenHeaders.get(f) ?? 0;
    seenHeaders.set(f, count + 1);
    return count === 0 ? f : `${f}_${count + 1}`;
  });

  const rawRecords = result.data.filter((row) =>
    uniqueFields.some((col) => {
      const val = row[col];
      return val !== undefined && val !== null && String(val).trim() !== '';
    })
  );

  if (rawRecords.length === 0) {
    throw new Error('The CSV file contains headers but no data rows. Please upload a file with at least one data record.');
  }

  const warnings: string[] = [];
  if (result.errors.length > 0) {
    warnings.push(`${result.errors.length} formatting notice(s) encountered while reading CSV rows.`);
  }

  // Infer column types
  const columns: ColumnProfile[] = [];
  const parsedRows: ParsedRow[] = rawRecords.map((r, idx) => ({
    __rowIndex: idx + 1,
    raw: {},
    parsed: {},
    dateKeys: {},
  }));

  for (const colName of uniqueFields) {
    const rawValues = rawRecords.map((r) => (r[colName] !== undefined && r[colName] !== null ? String(r[colName]).trim() : ''));
    let validCount = 0;
    let missingCount = 0;
    let numericHits = 0;
    let dateHits = 0;

    const numericParsed: Array<ParsedNumericResult | null> = [];
    const dateParsed: Array<string | null> = [];
    const valueFreq = new Map<string, number>();
    const formatCounts: Record<NumericFormat, number> = { number: 0, currency: 0, percentage: 0 };
    const symbolCounts = new Map<string, number>();
    let maxDecimals = 0;

    for (let i = 0; i < rawValues.length; i++) {
      const raw = rawValues[i];
      parsedRows[i].raw[colName] = raw;

      if (isMissingValue(raw)) {
        missingCount++;
        numericParsed.push(null);
        dateParsed.push(null);
        continue;
      }

      validCount++;
      valueFreq.set(raw, (valueFreq.get(raw) ?? 0) + 1);

      const numRes = tryParseNumeric(raw);
      numericParsed.push(numRes);
      if (numRes) {
        numericHits++;
        formatCounts[numRes.format]++;
        if (numRes.currencySymbol) {
          symbolCounts.set(numRes.currencySymbol, (symbolCounts.get(numRes.currencySymbol) ?? 0) + 1);
        }
        if (numRes.decimals > maxDecimals) maxDecimals = numRes.decimals;
      }

      const dateRes = tryParseDateKey(raw);
      dateParsed.push(dateRes);
      if (dateRes) {
        dateHits++;
      }
    }

    const totalCount = rawValues.length;
    const missingPct = totalCount > 0 ? (missingCount / totalCount) * 100 : 0;
    const uniqueCount = valueFreq.size;
    const sampleValues = Array.from(valueFreq.keys()).slice(0, 5);

    const numericRatio = validCount > 0 ? numericHits / validCount : 0;
    const dateRatio = validCount > 0 ? dateHits / validCount : 0;

    let type: ColumnType = 'text';
    let numericFormat: NumericFormat | undefined;
    let currencySymbol: string | undefined;
    let min: number | undefined;
    let max: number | undefined;
    let mean: number | undefined;
    let minDate: string | undefined;
    let maxDate: string | undefined;
    let isAdditiveMetric = false;
    let hasRepeatedGroups = false;

    if (validCount > 0 && dateRatio >= 0.85) {
      type = 'date';
      const validDates = dateParsed.filter((d): d is string => d !== null).sort();
      minDate = validDates[0];
      maxDate = validDates[validDates.length - 1];
      for (let i = 0; i < parsedRows.length; i++) {
        parsedRows[i].dateKeys[colName] = dateParsed[i];
        parsedRows[i].parsed[colName] = dateParsed[i];
      }
    } else if (validCount > 0 && numericRatio >= 0.85 && !looksLikeIdentifierName(colName)) {
      type = 'numeric';
      if (formatCounts.currency >= numericHits * 0.5) {
        numericFormat = 'currency';
        let topSym = '$';
        let topSymCount = 0;
        for (const [sym, cnt] of symbolCounts.entries()) {
          if (cnt > topSymCount) {
            topSym = sym;
            topSymCount = cnt;
          }
        }
        currencySymbol = topSym;
      } else if (formatCounts.percentage >= numericHits * 0.5) {
        numericFormat = 'percentage';
      } else {
        numericFormat = 'number';
      }

      const nums: number[] = [];
      for (let i = 0; i < parsedRows.length; i++) {
        const res = numericParsed[i];
        parsedRows[i].parsed[colName] = res ? res.value : null;
        if (res) nums.push(res.value);
      }

      if (nums.length > 0) {
        min = Math.min(...nums);
        max = Math.max(...nums);
        mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        isAdditiveMetric = !isLikelyNonAdditiveNumeric(colName, nums) && numericFormat !== 'percentage';
      }
    } else {
      // String / categorical / identifier / text
      for (let i = 0; i < parsedRows.length; i++) {
        const raw = rawValues[i];
        parsedRows[i].parsed[colName] = isMissingValue(raw) ? null : raw;
      }

      const uniqueRatio = validCount > 0 ? uniqueCount / validCount : 0;
      const avgLength =
        validCount > 0
          ? Array.from(valueFreq.keys()).reduce((acc, v) => acc + v.length, 0) / Math.max(1, uniqueCount)
          : 0;

      if (looksLikeIdentifierName(colName) || (uniqueCount > 25 && uniqueRatio > 0.72 && avgLength < 36)) {
        type = 'identifier';
        hasRepeatedGroups = uniqueCount >= 2 && uniqueCount < validCount * 0.98;
      } else if (uniqueCount <= 50 || (uniqueRatio <= 0.45 && uniqueCount <= 80)) {
        type = 'categorical';
      } else if (avgLength > 45) {
        type = 'text';
      } else {
        type = 'identifier';
        hasRepeatedGroups = uniqueCount >= 2 && uniqueCount < validCount * 0.98;
      }
    }

    const topValues = Array.from(valueFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, count]) => ({ value, count }));

    columns.push({
      name: colName,
      type,
      numericFormat,
      currencySymbol,
      decimals: maxDecimals,
      totalCount,
      validCount,
      missingCount,
      missingPct,
      uniqueCount,
      sampleValues,
      min,
      max,
      mean,
      minDate,
      maxDate,
      topValues,
      isAdditiveMetric,
      hasRepeatedGroups,
    });
  }

  // Choose default primary columns dynamically without hardcoding column names
  const numericCols = columns.filter((c) => c.type === 'numeric');
  const primaryNumericColumn =
    numericCols.find((c) => c.numericFormat === 'currency' && c.isAdditiveMetric)?.name ??
    numericCols.find((c) => c.isAdditiveMetric)?.name ??
    numericCols[0]?.name ??
    null;

  const dateCols = columns.filter((c) => c.type === 'date');
  const primaryDateColumn = dateCols[0]?.name ?? null;

  const categoricalCols = columns
    .filter((c) => c.type === 'categorical' && c.uniqueCount >= 2)
    .sort((a, b) => {
      // Prefer informative medium cardinality (3-15) over binary or huge cardinality
      const score = (c: ColumnProfile) => {
        if (c.uniqueCount >= 3 && c.uniqueCount <= 15) return 3;
        if (c.uniqueCount > 15 && c.uniqueCount <= 30) return 2;
        return 1;
      };
      return score(b) - score(a);
    });

  const primaryCategoryColumn = categoricalCols[0]?.name ?? null;
  const secondaryCategoryColumn = categoricalCols[1]?.name ?? null;

  const groupingIdColumn =
    columns.find((c) => c.type === 'identifier' && c.hasRepeatedGroups)?.name ?? null;

  return {
    fileName,
    fileSizeBytes,
    loadedAt: new Date().toISOString(),
    columns,
    rows: parsedRows,
    primaryNumericColumn,
    primaryDateColumn,
    primaryCategoryColumn,
    secondaryCategoryColumn,
    groupingIdColumn,
    warnings,
  };
}

export function createInitialFilters(dataset: ParsedDataset): FilterState {
  const dateCol = dataset.primaryDateColumn
    ? dataset.columns.find((c) => c.name === dataset.primaryDateColumn)
    : undefined;
  return {
    searchQuery: '',
    dateStart: dateCol?.minDate ?? '',
    dateEnd: dateCol?.maxDate ?? '',
    categorySelections: {},
    numericRange: null,
  };
}

export function applyFilters(dataset: ParsedDataset, filters: FilterState): ParsedRow[] {
  const query = filters.searchQuery.trim().toLowerCase();
  const dateCol = dataset.primaryDateColumn;
  const hasDateRange = Boolean(dateCol && (filters.dateStart || filters.dateEnd));

  const activeCategoryEntries = Object.entries(filters.categorySelections).filter(
    ([, selected]) => selected.length > 0
  );

  const numRange = filters.numericRange;
  const hasNumRange =
    numRange && (numRange.min !== null || numRange.max !== null);

  return dataset.rows.filter((row) => {
    if (query) {
      const matched = dataset.columns.some((col) => {
        const val = row.raw[col.name];
        return val && val.toLowerCase().includes(query);
      });
      if (!matched) return false;
    }

    if (hasDateRange && dateCol) {
      const dKey = row.dateKeys[dateCol];
      if (!dKey) return false;
      if (filters.dateStart && dKey < filters.dateStart) return false;
      if (filters.dateEnd && dKey > filters.dateEnd) return false;
    }

    for (const [colName, selected] of activeCategoryEntries) {
      const val = row.parsed[colName];
      const strVal = val === null || val === undefined ? '(Missing)' : String(val);
      if (!selected.includes(strVal)) return false;
    }

    if (hasNumRange && numRange) {
      const val = row.parsed[numRange.column];
      if (typeof val !== 'number') return false;
      if (numRange.min !== null && val < numRange.min) return false;
      if (numRange.max !== null && val > numRange.max) return false;
    }

    return true;
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function computeStatisticalProfile(
  dataset: ParsedDataset,
  filteredRows: ParsedRow[]
): StatisticalProfile {
  const totalCells = dataset.rows.length * dataset.columns.length;
  const missingCells = dataset.columns.reduce((acc, c) => acc + c.missingCount, 0);
  const overallCompletenessPct =
    totalCells > 0 ? ((totalCells - missingCells) / totalCells) * 100 : 100;

  const primaryMetric = dataset.primaryNumericColumn;
  const primaryDate = dataset.primaryDateColumn;
  const labelColumn =
    dataset.primaryCategoryColumn ??
    dataset.groupingIdColumn ??
    dataset.columns.find((c) => c.type === 'text')?.name ??
    null;

  // 1. Numeric stats
  const numericCols = dataset.columns.filter((c) => c.type === 'numeric');
  const numericStats: NumericStats[] = numericCols.map((col) => {
    const entries: Array<{ rowNumber: number; value: number; label: string }> = [];
    let missingCount = 0;

    for (const row of filteredRows) {
      const val = row.parsed[col.name];
      if (typeof val === 'number' && Number.isFinite(val)) {
        const label = labelColumn ? String(row.raw[labelColumn] || `Row ${row.__rowIndex}`) : `Row ${row.__rowIndex}`;
        entries.push({ rowNumber: row.__rowIndex, value: val, label });
      } else {
        missingCount++;
      }
    }

    const sorted = entries.map((e) => e.value).sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = n > 0 ? sum / n : 0;
    const median = n > 0 ? percentile(sorted, 0.5) : 0;
    const q1 = n > 0 ? percentile(sorted, 0.25) : 0;
    const q3 = n > 0 ? percentile(sorted, 0.75) : 0;
    const iqr = q3 - q1;
    const variance =
      n > 1 ? sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1) : 0;
    const stdDev = Math.sqrt(variance);
    const min = n > 0 ? sorted[0] : 0;
    const max = n > 0 ? sorted[n - 1] : 0;

    // IQR outlier bounds (only meaningful when iqr > 0, else fallback to > 2 SD)
    const lowerFence = iqr > 0 ? q1 - 1.5 * iqr : mean - 2.2 * stdDev;
    const upperFence = iqr > 0 ? q3 + 1.5 * iqr : mean + 2.2 * stdDev;

    const outliers =
      n >= 6 && stdDev > 0
        ? entries
            .filter((e) => e.value < lowerFence || e.value > upperFence)
            .sort((a, b) => Math.abs(b.value - mean) - Math.abs(a.value - mean))
        : [];

    const totalFiltered = filteredRows.length;
    return {
      column: col.name,
      format: col.numericFormat ?? 'number',
      currencySymbol: col.currencySymbol,
      validCount: n,
      missingCount,
      missingPct: totalFiltered > 0 ? (missingCount / totalFiltered) * 100 : 0,
      sum,
      mean,
      median,
      stdDev,
      min,
      max,
      q1,
      q3,
      iqr,
      outlierCount: outliers.length,
      outlierExamples: outliers.slice(0, 5),
    };
  });

  // 2. Date analysis
  let dateAnalysis: StatisticalProfile['dateAnalysis'] = null;
  if (primaryDate) {
    const datedRows = filteredRows
      .map((row) => ({
        date: row.dateKeys[primaryDate],
        metric: primaryMetric && typeof row.parsed[primaryMetric] === 'number' ? (row.parsed[primaryMetric] as number) : null,
      }))
      .filter((item): item is { date: string; metric: number | null } => Boolean(item.date));

    if (datedRows.length > 0) {
      const sortedDates = datedRows.map((d) => d.date).sort();
      const minDate = sortedDates[0];
      const maxDate = sortedDates[sortedDates.length - 1];
      const minMs = Date.parse(`${minDate}T00:00:00Z`);
      const maxMs = Date.parse(`${maxDate}T00:00:00Z`);
      const spanDays = Math.max(1, Math.round((maxMs - minMs) / 86400000) + 1);

      const byDay = new Map<string, { count: number; metricSum: number; metricCount: number }>();
      const byMonth = new Map<string, { count: number; metricSum: number; metricCount: number }>();

      let weekdayRows = 0;
      let weekendRows = 0;
      let weekdayMetricSum = 0;
      let weekdayMetricCount = 0;
      let weekendMetricSum = 0;
      let weekendMetricCount = 0;
      const weekdayDates = new Set<string>();
      const weekendDates = new Set<string>();

      for (const item of datedRows) {
        const dayAcc = byDay.get(item.date) ?? { count: 0, metricSum: 0, metricCount: 0 };
        dayAcc.count++;
        if (item.metric !== null) {
          dayAcc.metricSum += item.metric;
          dayAcc.metricCount++;
        }
        byDay.set(item.date, dayAcc);

        const monthKey = item.date.slice(0, 7);
        const mAcc = byMonth.get(monthKey) ?? { count: 0, metricSum: 0, metricCount: 0 };
        mAcc.count++;
        if (item.metric !== null) {
          mAcc.metricSum += item.metric;
          mAcc.metricCount++;
        }
        byMonth.set(monthKey, mAcc);

        const dow = new Date(`${item.date}T00:00:00Z`).getUTCDay();
        const isWeekend = dow === 0 || dow === 6;
        if (isWeekend) {
          weekendRows++;
          weekendDates.add(item.date);
          if (item.metric !== null) {
            weekendMetricSum += item.metric;
            weekendMetricCount++;
          }
        } else {
          weekdayRows++;
          weekdayDates.add(item.date);
          if (item.metric !== null) {
            weekdayMetricSum += item.metric;
            weekdayMetricCount++;
          }
        }
      }

      const dayEntries = Array.from(byDay.entries()).map(([date, info]) => ({
        date,
        count: info.count,
        metricSum: info.metricCount > 0 ? info.metricSum : null,
      }));

      dayEntries.sort((a, b) => {
        if (a.metricSum !== null && b.metricSum !== null) {
          return b.metricSum - a.metricSum;
        }
        return b.count - a.count;
      });

      const peakDay = dayEntries[0] ?? null;
      const lowestDay = dayEntries[dayEntries.length - 1] ?? null;

      const totalMetricOnDated = datedRows.reduce((acc, r) => acc + (r.metric ?? 0), 0);
      const hasDatedMetric = datedRows.some((r) => r.metric !== null);

      // First half vs second half
      let firstHalfVsSecondHalf: NonNullable<StatisticalProfile['dateAnalysis']>['firstHalfVsSecondHalf'] = null;
      if (spanDays >= 4) {
        const midMs = minMs + Math.floor((maxMs - minMs) / 2);
        const midDate = new Date(midMs).toISOString().slice(0, 10);
        let firstRows = 0;
        let secondRows = 0;
        let firstMetric = 0;
        let secondMetric = 0;
        let firstMetricCnt = 0;
        let secondMetricCnt = 0;

        for (const r of datedRows) {
          if (r.date <= midDate) {
            firstRows++;
            if (r.metric !== null) {
              firstMetric += r.metric;
              firstMetricCnt++;
            }
          } else {
            secondRows++;
            if (r.metric !== null) {
              secondMetric += r.metric;
              secondMetricCnt++;
            }
          }
        }

        const rowChangePct = firstRows > 0 ? ((secondRows - firstRows) / firstRows) * 100 : null;
        const metricChangePct =
          firstMetricCnt > 0 && secondMetricCnt > 0 && firstMetric > 0
            ? ((secondMetric - firstMetric) / firstMetric) * 100
            : null;

        firstHalfVsSecondHalf = {
          firstHalfLabel: `${minDate} to ${midDate}`,
          secondHalfLabel: `after ${midDate} to ${maxDate}`,
          firstHalfRows: firstRows,
          secondHalfRows: secondRows,
          firstHalfMetricSum: firstMetricCnt > 0 ? firstMetric : null,
          secondHalfMetricSum: secondMetricCnt > 0 ? secondMetric : null,
          metricChangePct,
          rowChangePct,
        };
      }

      const monthlyTrend = Array.from(byMonth.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, info]) => ({
          month,
          count: info.count,
          metricSum: info.metricCount > 0 ? info.metricSum : null,
          metricAvg: info.metricCount > 0 ? info.metricSum / info.metricCount : null,
        }));

      dateAnalysis = {
        column: primaryDate,
        minDate,
        maxDate,
        spanDays,
        activeDays: byDay.size,
        avgRowsPerActiveDay: datedRows.length / byDay.size,
        avgMetricPerActiveDay: hasDatedMetric ? totalMetricOnDated / byDay.size : null,
        peakDay,
        lowestDay,
        firstHalfVsSecondHalf,
        weekdayVsWeekend: {
          weekdayRows,
          weekendRows,
          weekdayAvgMetricPerRow: weekdayMetricCount > 0 ? weekdayMetricSum / weekdayMetricCount : null,
          weekendAvgMetricPerRow: weekendMetricCount > 0 ? weekendMetricSum / weekendMetricCount : null,
          weekdayAvgMetricPerDay:
            weekdayMetricCount > 0 && weekdayDates.size > 0
              ? weekdayMetricSum / weekdayDates.size
              : null,
          weekendAvgMetricPerDay:
            weekendMetricCount > 0 && weekendDates.size > 0
              ? weekendMetricSum / weekendDates.size
              : null,
        },
        monthlyTrend,
      };
    }
  }

  // 3. Categorical breakdowns
  const catCols = dataset.columns.filter((c) => c.type === 'categorical').slice(0, 4);
  const categoricalBreakdowns = catCols.map((col) => {
    const items = buildCategoryAggregation(filteredRows, col.name, primaryMetric);
    const totalShare = items.reduce((acc, i) => acc + (i.metricSharePct ?? i.sharePct), 0);
    const topSharePct = items[0] ? (items[0].metricSharePct ?? items[0].sharePct) : 0;
    const topThreeSharePct =
      totalShare > 0
        ? items.slice(0, 3).reduce((acc, i) => acc + (i.metricSharePct ?? i.sharePct), 0)
        : 0;
    const missingCount = filteredRows.filter(
      (r) => r.parsed[col.name] === null || r.parsed[col.name] === undefined
    ).length;

    return {
      column: col.name,
      uniqueCount: items.filter((i) => i.category !== '(Missing)').length,
      missingCount,
      topSharePct,
      topThreeSharePct,
      items: items.slice(0, 12),
    };
  });

  // 4. Identifier grouping stats (e.g., multi-item orders)
  let identifierGroupStats: IdentifierGroupStats | null = null;
  if (dataset.groupingIdColumn && filteredRows.length > 0) {
    const groupMap = new Map<string, { count: number; metricSum: number; hasMetric: boolean }>();
    for (const row of filteredRows) {
      const idVal = row.parsed[dataset.groupingIdColumn];
      if (idVal === null || idVal === undefined) continue;
      const key = String(idVal);
      const entry = groupMap.get(key) ?? { count: 0, metricSum: 0, hasMetric: false };
      entry.count++;
      if (primaryMetric && typeof row.parsed[primaryMetric] === 'number') {
        entry.metricSum += row.parsed[primaryMetric] as number;
        entry.hasMetric = true;
      }
      groupMap.set(key, entry);
    }

    if (groupMap.size > 0) {
      let multiRowGroups = 0;
      let totalRowsInGroups = 0;
      let maxRowsInGroup = 0;
      let metricGroupCount = 0;
      let totalMetricAcrossGroups = 0;
      let maxGroupMetricTotal: number | null = null;
      let maxGroupId: string | null = null;

      for (const [id, info] of groupMap.entries()) {
        if (info.count > 1) multiRowGroups++;
        totalRowsInGroups += info.count;
        if (info.count > maxRowsInGroup) maxRowsInGroup = info.count;
        if (info.hasMetric) {
          metricGroupCount++;
          totalMetricAcrossGroups += info.metricSum;
          if (maxGroupMetricTotal === null || info.metricSum > maxGroupMetricTotal) {
            maxGroupMetricTotal = info.metricSum;
            maxGroupId = id;
          }
        }
      }

      identifierGroupStats = {
        column: dataset.groupingIdColumn,
        uniqueGroups: groupMap.size,
        multiRowGroups,
        avgRowsPerGroup: totalRowsInGroups / groupMap.size,
        maxRowsInGroup,
        avgGroupMetricTotal: metricGroupCount > 0 ? totalMetricAcrossGroups / metricGroupCount : null,
        maxGroupMetricTotal,
        maxGroupId,
      };
    }
  }

  // 5. Numeric correlations (if >= 2 numeric columns)
  const numericCorrelations: StatisticalProfile['numericCorrelations'] = [];
  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i + 1; j < numericCols.length; j++) {
      const colA = numericCols[i].name;
      const colB = numericCols[j].name;
      const pairs: Array<[number, number]> = [];
      for (const row of filteredRows) {
        const a = row.parsed[colA];
        const b = row.parsed[colB];
        if (typeof a === 'number' && typeof b === 'number') {
          pairs.push([a, b]);
        }
      }
      if (pairs.length >= 5) {
        const r = computePearsonR(pairs);
        if (r !== null) {
          const absR = Math.abs(r);
          const strength =
            absR >= 0.7 ? 'strong' : absR >= 0.4 ? 'moderate' : absR >= 0.2 ? 'weak' : 'negligible';
          numericCorrelations.push({
            columnA: colA,
            columnB: colB,
            pearsonR: r,
            sampleSize: pairs.length,
            strength,
          });
        }
      }
    }
  }

  // 6. Cross-dimension summary (top pairs between primary & secondary categories)
  const crossDimensions: StatisticalProfile['crossDimensions'] = [];
  if (dataset.primaryCategoryColumn && dataset.secondaryCategoryColumn) {
    const map = new Map<string, { primary: string; secondary: string; count: number; sum: number; metricCount: number }>();
    for (const row of filteredRows) {
      const pVal = row.parsed[dataset.primaryCategoryColumn];
      const sVal = row.parsed[dataset.secondaryCategoryColumn];
      const pStr = pVal === null || pVal === undefined ? '(Missing)' : String(pVal);
      const sStr = sVal === null || sVal === undefined ? '(Missing)' : String(sVal);
      const key = `${pStr}|||${sStr}`;
      const acc = map.get(key) ?? { primary: pStr, secondary: sStr, count: 0, sum: 0, metricCount: 0 };
      acc.count++;
      if (primaryMetric && typeof row.parsed[primaryMetric] === 'number') {
        acc.sum += row.parsed[primaryMetric] as number;
        acc.metricCount++;
      }
      map.set(key, acc);
    }

    const topCombinations = Array.from(map.values())
      .sort((a, b) => (b.metricCount > 0 ? b.sum - a.sum : b.count - a.count))
      .slice(0, 8)
      .map((item) => ({
        primaryValue: item.primary,
        secondaryValue: item.secondary,
        count: item.count,
        metricSum: item.metricCount > 0 ? item.sum : null,
        metricAvg: item.metricCount > 0 ? item.sum / item.metricCount : null,
      }));

    crossDimensions.push({
      primaryDim: dataset.primaryCategoryColumn,
      secondaryDim: dataset.secondaryCategoryColumn,
      topCombinations,
    });
  }

  return {
    datasetSummary: {
      totalRows: dataset.rows.length,
      filteredRows: filteredRows.length,
      filteredSharePct: dataset.rows.length > 0 ? (filteredRows.length / dataset.rows.length) * 100 : 100,
      columnCount: dataset.columns.length,
      overallCompletenessPct,
      primaryMetricColumn: primaryMetric,
      primaryDateColumn: primaryDate,
    },
    numericStats,
    dateAnalysis,
    categoricalBreakdowns,
    identifierGroupStats,
    numericCorrelations,
    crossDimensions,
  };
}

function computePearsonR(pairs: Array<[number, number]>): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of pairs) {
    sumX += x;
    sumY += y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanX;
    const dy = y - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return null;
  return num / den;
}

export function buildCategoryAggregation(
  rows: ParsedRow[],
  categoryColumn: string,
  metricColumn: string | null
): CategoryBreakdownItem[] {
  const map = new Map<string, { count: number; sum: number; metricCount: number; min: number; max: number }>();

  for (const row of rows) {
    const rawCat = row.parsed[categoryColumn];
    const cat = rawCat === null || rawCat === undefined ? '(Missing)' : String(rawCat);
    const acc = map.get(cat) ?? {
      count: 0,
      sum: 0,
      metricCount: 0,
      min: Infinity,
      max: -Infinity,
    };
    acc.count++;

    if (metricColumn) {
      const mVal = row.parsed[metricColumn];
      if (typeof mVal === 'number' && Number.isFinite(mVal)) {
        acc.sum += mVal;
        acc.metricCount++;
        if (mVal < acc.min) acc.min = mVal;
        if (mVal > acc.max) acc.max = mVal;
      }
    }
    map.set(cat, acc);
  }

  const totalRows = rows.length;
  let totalMetric = 0;
  for (const acc of map.values()) {
    totalMetric += acc.sum;
  }

  return Array.from(map.entries())
    .map(([category, acc]) => ({
      category,
      count: acc.count,
      sharePct: totalRows > 0 ? (acc.count / totalRows) * 100 : 0,
      metricSum: acc.metricCount > 0 ? acc.sum : null,
      metricAvg: acc.metricCount > 0 ? acc.sum / acc.metricCount : null,
      metricMin: acc.metricCount > 0 ? acc.min : null,
      metricMax: acc.metricCount > 0 ? acc.max : null,
      metricSharePct: acc.metricCount > 0 && totalMetric !== 0 ? (acc.sum / totalMetric) * 100 : null,
    }))
    .sort((a, b) => {
      if (b.metricSum !== null && a.metricSum !== null) {
        return b.metricSum - a.metricSum;
      }
      return b.count - a.count;
    });
}

export function buildTimeSeries(
  rows: ParsedRow[],
  dateColumn: string,
  metricColumn: string | null,
  granularity: 'day' | 'week' | 'month'
): TimeSeriesPoint[] {
  const map = new Map<string, { label: string; count: number; sum: number; metricCount: number }>();

  for (const row of rows) {
    const dateKey = row.dateKeys[dateColumn];
    if (!dateKey) continue;

    let periodKey = dateKey;
    let label = formatShortDate(dateKey);

    if (granularity === 'month') {
      periodKey = dateKey.slice(0, 7);
      label = formatMonthLabel(periodKey);
    } else if (granularity === 'week') {
      const weekStart = getWeekStartKey(dateKey);
      periodKey = weekStart;
      label = `Wk ${formatShortDate(weekStart)}`;
    }

    const acc = map.get(periodKey) ?? { label, count: 0, sum: 0, metricCount: 0 };
    acc.count++;

    if (metricColumn) {
      const mVal = row.parsed[metricColumn];
      if (typeof mVal === 'number' && Number.isFinite(mVal)) {
        acc.sum += mVal;
        acc.metricCount++;
      }
    }
    map.set(periodKey, acc);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([periodKey, acc]) => ({
      periodKey,
      label: acc.label,
      count: acc.count,
      metricSum: acc.metricCount > 0 ? acc.sum : null,
      metricAvg: acc.metricCount > 0 ? acc.sum / acc.metricCount : null,
    }));
}

export function buildNumericHistogram(
  rows: ParsedRow[],
  numericColumn: string,
  binsCount = 8
): Array<{ label: string; count: number; min: number; max: number }> {
  const values: number[] = [];
  for (const r of rows) {
    const v = r.parsed[numericColumn];
    if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
  }
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ label: String(min), count: values.length, min, max }];
  }

  const actualBins = Math.min(binsCount, Math.max(4, Math.ceil(Math.sqrt(values.length))));
  const step = (max - min) / actualBins;
  const bins = Array.from({ length: actualBins }, (_, i) => {
    const bMin = min + i * step;
    const bMax = i === actualBins - 1 ? max : min + (i + 1) * step;
    return {
      label: `${Math.round(bMin * 10) / 10}–${Math.round(bMax * 10) / 10}`,
      count: 0,
      min: bMin,
      max: bMax,
    };
  });

  for (const v of values) {
    let idx = Math.floor((v - min) / step);
    if (idx >= actualBins) idx = actualBins - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }
  return bins;
}

function getWeekStartKey(dateKey: string): string {
  const dt = new Date(`${dateKey}T00:00:00Z`);
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

export function formatShortDate(dateKey: string): string {
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  return `${months[m] ?? parts[1]} ${d}`;
}

export function formatMonthLabel(monthKey: string): string {
  const parts = monthKey.split('-');
  if (parts.length !== 2) return monthKey;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = Number(parts[1]) - 1;
  return `${months[m] ?? parts[1]} ${parts[0]}`;
}

export function formatMetricValue(
  value: number | null | undefined,
  col?: Pick<ColumnProfile, 'numericFormat' | 'currencySymbol' | 'decimals'> | null,
  overrideDecimals?: number
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const format = col?.numericFormat ?? 'number';
  const decimals = overrideDecimals ?? Math.min(2, col?.decimals ?? (Number.isInteger(value) ? 0 : 2));

  const formattedNum = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (format === 'currency') {
    const sym = col?.currencySymbol ?? '$';
    return value < 0 ? `-${sym}${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}` : `${sym}${formattedNum}`;
  }
  if (format === 'percentage') {
    return `${formattedNum}%`;
  }
  return formattedNum;
}

export function formatCompactMetric(
  value: number,
  col?: Pick<ColumnProfile, 'numericFormat' | 'currencySymbol'> | null
): string {
  const sym = col?.numericFormat === 'currency' ? (col.currencySymbol ?? '$') : '';
  const suffix = col?.numericFormat === 'percentage' ? '%' : '';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M${suffix}`;
  if (abs >= 10_000) return `${sign}${sym}${(abs / 1_000).toFixed(1)}k${suffix}`;
  if (abs >= 1_000) return `${sign}${sym}${Math.round(abs).toLocaleString('en-US')}${suffix}`;
  return `${sign}${sym}${Number.isInteger(abs) ? abs : abs.toFixed(1)}${suffix}`;
}

export function exportFilteredCSV(dataset: ParsedDataset, rows: ParsedRow[]): void {
  const headers = dataset.columns.map((c) => c.name);
  const data = rows.map((r) => headers.map((h) => r.raw[h] ?? ''));
  const csv = Papa.unparse({ fields: headers, data });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const baseName = dataset.fileName.replace(/\.csv$/i, '');
  link.href = url;
  link.download = `${baseName}_filtered.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

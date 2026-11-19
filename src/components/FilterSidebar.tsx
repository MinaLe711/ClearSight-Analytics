import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, Search, X } from 'lucide-react';
import { ColumnProfile, FilterState, ParsedDataset } from '../types/analytics';

interface FilterSidebarProps {
  dataset: ParsedDataset;
  filters: FilterState;
  filteredCount: number;
  onChangeFilters: (next: FilterState) => void;
  onResetFilters: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  dataset,
  filters,
  filteredCount,
  onChangeFilters,
  onResetFilters,
  mobileOpen,
  onCloseMobile,
}) => {
  const dateCol = useMemo(
    () =>
      dataset.primaryDateColumn
        ? dataset.columns.find((c) => c.name === dataset.primaryDateColumn)
        : undefined,
    [dataset]
  );

  const categoricalColumns = useMemo(
    () =>
      dataset.columns
        .filter((c) => c.type === 'categorical' && c.uniqueCount >= 2)
        .slice(0, 4),
    [dataset]
  );

  const primaryNumericCol = useMemo(
    () =>
      dataset.primaryNumericColumn
        ? dataset.columns.find((c) => c.name === dataset.primaryNumericColumn)
        : undefined,
    [dataset]
  );

  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({});

  const toggleExpand = (colName: string) => {
    setExpandedCols((prev) => ({ ...prev, [colName]: prev[colName] === false ? true : !(prev[colName] ?? true) }));
  };

  // Precompute all unique values with counts per categorical column from full dataset
  const categoryOptionsMap = useMemo(() => {
    const map: Record<string, Array<{ value: string; count: number }>> = {};
    for (const col of categoricalColumns) {
      const counts = new Map<string, number>();
      for (const row of dataset.rows) {
        const val = row.parsed[col.name];
        const key = val === null || val === undefined ? '(Missing)' : String(val);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      map[col.name] = Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
    }
    return map;
  }, [dataset, categoricalColumns]);

  const hasActiveFilters = useMemo(() => {
    if (filters.searchQuery.trim() !== '') return true;
    if (dateCol && (filters.dateStart !== (dateCol.minDate ?? '') || filters.dateEnd !== (dateCol.maxDate ?? ''))) {
      return true;
    }
    if (Object.values(filters.categorySelections).some((arr) => arr.length > 0)) return true;
    if (filters.numericRange && (filters.numericRange.min !== null || filters.numericRange.max !== null)) {
      return true;
    }
    return false;
  }, [filters, dateCol]);

  const toggleCategoryValue = (colName: string, value: string) => {
    const current = filters.categorySelections[colName] ?? [];
    const nextList = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChangeFilters({
      ...filters,
      categorySelections: {
        ...filters.categorySelections,
        [colName]: nextList,
      },
    });
  };

  const applyDatePreset = (preset: 'all' | 'first-half' | 'second-half' | 'last-14') => {
    if (!dateCol?.minDate || !dateCol?.maxDate) return;
    const minMs = Date.parse(`${dateCol.minDate}T00:00:00Z`);
    const maxMs = Date.parse(`${dateCol.maxDate}T00:00:00Z`);
    const midMs = minMs + Math.floor((maxMs - minMs) / 2);
    const midStr = new Date(midMs).toISOString().slice(0, 10);

    if (preset === 'all') {
      onChangeFilters({ ...filters, dateStart: dateCol.minDate, dateEnd: dateCol.maxDate });
    } else if (preset === 'first-half') {
      onChangeFilters({ ...filters, dateStart: dateCol.minDate, dateEnd: midStr });
    } else if (preset === 'second-half') {
      const nextDay = new Date(midMs + 86400000).toISOString().slice(0, 10);
      onChangeFilters({
        ...filters,
        dateStart: nextDay <= dateCol.maxDate ? nextDay : midStr,
        dateEnd: dateCol.maxDate,
      });
    } else if (preset === 'last-14') {
      const last14Ms = Math.max(minMs, maxMs - 13 * 86400000);
      onChangeFilters({
        ...filters,
        dateStart: new Date(last14Ms).toISOString().slice(0, 10),
        dateEnd: dateCol.maxDate,
      });
    }
  };

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
          <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
            {filteredCount.toLocaleString('en-US')} / {dataset.rows.length.toLocaleString('en-US')} rows
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close filters"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Global search */}
        <div>
          <label htmlFor="global-filter-search" className="block text-xs font-medium text-slate-700 mb-1.5">
            Search records
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              id="global-filter-search"
              type="text"
              value={filters.searchQuery}
              onChange={(e) => onChangeFilters({ ...filters, searchQuery: e.target.value })}
              placeholder="Search any column..."
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {filters.searchQuery && (
              <button
                type="button"
                onClick={() => onChangeFilters({ ...filters, searchQuery: '' })}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Date range filter */}
        {dateCol && (
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-700 truncate">{dateCol.name}</span>
              <span className="text-[11px] text-slate-400">Date range</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="date-start" className="block text-[11px] text-slate-500 mb-1">
                  From
                </label>
                <input
                  id="date-start"
                  type="date"
                  value={filters.dateStart}
                  min={dateCol.minDate}
                  max={filters.dateEnd || dateCol.maxDate}
                  onChange={(e) => onChangeFilters({ ...filters, dateStart: e.target.value })}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="date-end" className="block text-[11px] text-slate-500 mb-1">
                  To
                </label>
                <input
                  id="date-end"
                  type="date"
                  value={filters.dateEnd}
                  min={filters.dateStart || dateCol.minDate}
                  max={dateCol.maxDate}
                  onChange={(e) => onChangeFilters({ ...filters, dateEnd: e.target.value })}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => applyDatePreset('all')}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                All dates
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('last-14')}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Last 14 days
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('first-half')}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                First half
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('second-half')}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Second half
              </button>
            </div>
          </div>
        )}

        {/* Primary numeric range */}
        {primaryNumericCol && primaryNumericCol.min !== undefined && primaryNumericCol.max !== undefined && (
          <NumericRangeFilter
            col={primaryNumericCol}
            filters={filters}
            onChangeFilters={onChangeFilters}
          />
        )}

        {/* Categorical column checklists */}
        {categoricalColumns.map((col) => {
          const options = categoryOptionsMap[col.name] ?? [];
          const selected = filters.categorySelections[col.name] ?? [];
          const isExpanded = expandedCols[col.name] ?? true;

          return (
            <div key={col.name} className="border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => toggleExpand(col.name)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700 truncate">
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate">{col.name}</span>
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                  {selected.length > 0 ? `${selected.length} active` : `${options.length}`}
                </span>
              </button>

              {isExpanded && (
                <div className="mt-2 max-h-48 overflow-y-auto space-y-1 pr-1">
                  {options.map((opt) => {
                    const checked = selected.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs cursor-pointer transition-colors ${
                          checked ? 'bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCategoryValue(col.name, opt.value)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="truncate">{opt.value}</span>
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-[11px] text-slate-400">
                          {opt.count}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden lg:block w-[272px] shrink-0 border-r border-slate-200 bg-white">
        <div className="sticky top-14 h-[calc(100vh-3.5rem)]">{content}</div>
      </aside>

      {/* Mobile slide-over */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-80 max-w-[85vw] bg-white shadow-xl h-full">
            {content}
          </aside>
        </div>
      )}
    </>
  );
};

const NumericRangeFilter: React.FC<{
  col: ColumnProfile;
  filters: FilterState;
  onChangeFilters: (next: FilterState) => void;
}> = ({ col, filters, onChangeFilters }) => {
  const currentMin =
    filters.numericRange?.column === col.name && filters.numericRange.min !== null
      ? String(filters.numericRange.min)
      : '';
  const currentMax =
    filters.numericRange?.column === col.name && filters.numericRange.max !== null
      ? String(filters.numericRange.max)
      : '';

  const updateRange = (minStr: string, maxStr: string) => {
    const parsedMin = minStr.trim() === '' ? null : Number(minStr);
    const parsedMax = maxStr.trim() === '' ? null : Number(maxStr);
    onChangeFilters({
      ...filters,
      numericRange: {
        column: col.name,
        min: parsedMin !== null && Number.isFinite(parsedMin) ? parsedMin : null,
        max: parsedMax !== null && Number.isFinite(parsedMax) ? parsedMax : null,
      },
    });
  };

  return (
    <div className="border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-700 truncate">{col.name}</span>
        <span className="text-[11px] font-mono tabular-nums text-slate-400">
          {col.min} – {col.max}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="num-min" className="block text-[11px] text-slate-500 mb-1">
            Min
          </label>
          <input
            id="num-min"
            type="number"
            step="any"
            value={currentMin}
            placeholder={String(col.min)}
            onChange={(e) => updateRange(e.target.value, currentMax)}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-800 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="num-max" className="block text-[11px] text-slate-500 mb-1">
            Max
          </label>
          <input
            id="num-max"
            type="number"
            step="any"
            value={currentMax}
            placeholder={String(col.max)}
            onChange={(e) => updateRange(currentMin, e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-800 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};

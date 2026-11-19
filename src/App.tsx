import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  FileSpreadsheet,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { FilterState, ParsedDataset } from './types/analytics';
import {
  applyFilters,
  computeStatisticalProfile,
  createInitialFilters,
  parseCSVContent,
} from './lib/dataEngine';
import { FilterSidebar } from './components/FilterSidebar';
import { KPIRow } from './components/KPIRow';
import { VisualizationSection } from './components/VisualizationSection';
import { AIInsightsPanel } from './components/AIInsightsPanel';
import { DataTable } from './components/DataTable';
import { SchemaInspector } from './components/SchemaInspector';

const ATTACHED_DATASET_URL = '/assets/aistudio/Sales_data_5e94d700';
const ATTACHED_DATASET_NAME = 'Sales_data_5e94d700.csv';
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export default function App() {
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    dateStart: '',
    dateEnd: '',
    categorySelections: {},
    numericRange: null,
  });
  const [selectedMetricColumn, setSelectedMetricColumn] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadFromText = useCallback((csvText: string, fileName: string, fileSizeBytes: number) => {
    const parsed = parseCSVContent(csvText, fileName, fileSizeBytes);
    setDataset(parsed);
    setFilters(createInitialFilters(parsed));
    setSelectedMetricColumn(parsed.primaryNumericColumn);
    setError(null);
    setUploadModalOpen(false);
  }, []);

  const loadAttachedDataset = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(ATTACHED_DATASET_URL);
      if (!res.ok) {
        throw new Error(`Could not load attached dataset (HTTP ${res.status}).`);
      }
      const text = await res.text();
      loadFromText(text, ATTACHED_DATASET_NAME, new Blob([text]).size);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load the attached CSV dataset. Please upload a CSV file manually.'
      );
    } finally {
      setLoading(false);
    }
  }, [loadFromText]);

  useEffect(() => {
    loadAttachedDataset();
  }, [loadAttachedDataset]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      const lowerName = file.name.toLowerCase();
      const isCsvMime =
        file.type === 'text/csv' ||
        file.type === 'application/vnd.ms-excel' ||
        file.type === 'text/plain' ||
        file.type === '';

      if (!lowerName.endsWith('.csv') && !isCsvMime) {
        setError(
          `Unsupported file "${file.name}". Please upload a valid comma-separated (.csv) file.`
        );
        return;
      }

      if (file.size === 0) {
        setError(`"${file.name}" is empty (0 bytes). Please select a CSV file containing data.`);
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(
          `"${file.name}" exceeds the 20 MB browser analysis limit (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please upload a smaller extract.`
        );
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const text = await file.text();
        loadFromText(text, file.name, file.size);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to parse "${file.name}".`);
      } finally {
        setLoading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [loadFromText]
  );

  // Filtered rows & deterministic statistical profile
  const filteredRows = useMemo(() => {
    if (!dataset) return [];
    return applyFilters(dataset, filters);
  }, [dataset, filters]);

  const statisticalProfile = useMemo(() => {
    if (!dataset) return null;
    return computeStatisticalProfile(dataset, filteredRows);
  }, [dataset, filteredRows]);

  const activeFiltersSummary = useMemo(() => {
    if (!dataset) return '';
    const parts: string[] = [];
    if (filters.searchQuery.trim()) {
      parts.push(`Search: "${filters.searchQuery.trim()}"`);
    }
    const dateCol = dataset.primaryDateColumn
      ? dataset.columns.find((c) => c.name === dataset.primaryDateColumn)
      : undefined;
    if (
      dateCol &&
      ((filters.dateStart && filters.dateStart !== dateCol.minDate) ||
        (filters.dateEnd && filters.dateEnd !== dateCol.maxDate))
    ) {
      parts.push(`${dateCol.name}: ${filters.dateStart || '...'} to ${filters.dateEnd || '...'}`);
    }
    for (const [col, selected] of Object.entries(filters.categorySelections)) {
      if (selected.length > 0) {
        parts.push(`${col}: ${selected.join(', ')}`);
      }
    }
    if (
      filters.numericRange &&
      (filters.numericRange.min !== null || filters.numericRange.max !== null)
    ) {
      const minTxt = filters.numericRange.min !== null ? String(filters.numericRange.min) : 'min';
      const maxTxt = filters.numericRange.max !== null ? String(filters.numericRange.max) : 'max';
      parts.push(`${filters.numericRange.column}: ${minTxt} to ${maxTxt}`);
    }
    return parts.join(' · ');
  }, [dataset, filters]);

  const handleToggleCategoryFilter = useCallback((colName: string, value: string) => {
    setFilters((prev) => {
      const current = prev.categorySelections[colName] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return {
        ...prev,
        categorySelections: {
          ...prev.categorySelections,
          [colName]: next,
        },
      };
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    if (!dataset) return;
    setFilters(createInitialFilters(dataset));
  }, [dataset]);

  const onDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col bg-slate-50 text-slate-900"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDraggingOver(false);
      }}
      onDrop={onDropFile}
    >
      {/* Hidden shared file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
        }}
      />

      {/* Top Bar: Strict 3-Zone Contract */}
      <header className="sticky top-0 z-30 h-14 border-b border-slate-200 bg-white px-4 sm:px-6 flex items-center justify-between gap-8">
        <a
          href="#overview"
          className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
        >
          ClearSight Analytics
        </a>

        <nav
          aria-label="Dashboard sections"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <a href="#overview" className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0">
            Overview
          </a>
          <a href="#charts" className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0">
            Charts
          </a>
          <a href="#ai-insights" className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0">
            Insights
          </a>
          <a href="#data-table" className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0">
            Data Table
          </a>
          <a href="#schema" className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0">
            Schema
          </a>
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setUploadModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload CSV
          </button>
        </div>
      </header>

      {/* Global Drag & Drop Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6">
          <div className="w-full max-w-md rounded-xl border-2 border-dashed border-blue-500 bg-white p-8 text-center shadow-lg">
            <Upload className="mx-auto h-8 w-8 text-blue-600" />
            <p className="mt-3 text-base font-semibold text-slate-900">Drop CSV file to analyze</p>
            <p className="mt-1 text-xs text-slate-500">
              Columns, data types, charts, and statistics adapt automatically
            </p>
          </div>
        </div>
      )}

      {/* Error Alert Banner */}
      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 sm:px-6 py-3">
          <div className="mx-auto max-w-[1440px] flex items-start justify-between gap-4 text-xs text-red-900">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">File upload error: </span>
                <span>{error}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded p-1 text-red-700 hover:bg-red-100"
              aria-label="Dismiss error"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {loading && !dataset ? (
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-6 space-y-6" aria-busy="true">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-24 rounded-xl border border-slate-200 bg-white animate-pulse" />
            ))}
          </div>
          <div className="h-72 rounded-xl border border-slate-200 bg-white animate-pulse" />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="h-64 rounded-xl border border-slate-200 bg-white animate-pulse" />
            <div className="h-64 rounded-xl border border-slate-200 bg-white animate-pulse" />
          </div>
        </main>
      ) : !dataset || !statisticalProfile ? (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="w-full rounded-xl border border-dashed border-slate-300 bg-white p-10">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-400" />
            <h1 className="mt-4 text-xl font-semibold text-slate-900">
              Upload a CSV dataset to explore
            </h1>
            <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              Drop any CSV file here or select one from your computer. ClearSight inspects your
              columns, detects metrics and dates, and builds interactive charts automatically.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                Choose CSV File
              </button>
              <button
                type="button"
                onClick={loadAttachedDataset}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Load Sample Sales CSV
              </button>
            </div>
          </div>
        </main>
      ) : (
        <div className="mx-auto flex w-full max-w-[1600px] flex-1">
          <FilterSidebar
            dataset={dataset}
            filters={filters}
            filteredCount={filteredRows.length}
            onChangeFilters={setFilters}
            onResetFilters={handleResetFilters}
            mobileOpen={mobileFiltersOpen}
            onCloseMobile={() => setMobileFiltersOpen(false)}
          />

          <main className="flex-1 min-w-0 p-4 sm:p-6 space-y-6">
            {/* Workspace Dataset Context Bar (unboxed metadata with · separators) */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900 truncate">
                  {dataset.fileName}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                  <span>{dataset.rows.length.toLocaleString('en-US')} rows</span>
                  <span aria-hidden="true">·</span>
                  <span>{dataset.columns.length} columns</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {statisticalProfile.datasetSummary.overallCompletenessPct.toFixed(1)}% complete
                  </span>
                  {activeFiltersSummary && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-blue-700">
                        Filtered ({filteredRows.length.toLocaleString('en-US')} shown): {activeFiltersSummary}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(true)}
                  className="lg:hidden inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filters
                </button>
                {activeFiltersSummary && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {dataset.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-900">
                {dataset.warnings.join(' ')}
              </div>
            )}

            <KPIRow
              dataset={dataset}
              profile={statisticalProfile}
              selectedMetricColumn={selectedMetricColumn}
            />

            <VisualizationSection
              dataset={dataset}
              filteredRows={filteredRows}
              filters={filters}
              selectedMetricColumn={selectedMetricColumn}
              onChangeMetricColumn={setSelectedMetricColumn}
              onToggleCategoryFilter={handleToggleCategoryFilter}
            />

            <AIInsightsPanel
              dataset={dataset}
              profile={statisticalProfile}
              activeFiltersSummary={activeFiltersSummary}
            />

            <DataTable dataset={dataset} rows={filteredRows} />

            <SchemaInspector dataset={dataset} />
          </main>
        </div>
      )}

      {/* Upload CSV Modal (triggered strictly by user click) */}
      {uploadModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-modal-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 id="upload-modal-title" className="text-base font-semibold text-slate-900">
                Upload CSV Dataset
              </h2>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close upload dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
              >
                <Upload className="mx-auto h-7 w-7 text-blue-600" />
                <p className="mt-3 text-sm font-medium text-slate-900">
                  Click to choose a CSV file or drag and drop
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Supports standard comma-separated .csv files up to 20 MB with headers
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={loadAttachedDataset}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  Reload attached Sales_data_5e94d700.csv
                </button>
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

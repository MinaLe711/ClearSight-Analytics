import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from 'lucide-react';
import { ParsedDataset, ParsedRow } from '../types/analytics';
import { exportFilteredCSV, formatMetricValue } from '../lib/dataEngine';

interface DataTableProps {
  dataset: ParsedDataset;
  rows: ParsedRow[];
}

export const DataTable: React.FC<DataTableProps> = ({ dataset, rows }) => {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    const colProfile = dataset.columns.find((c) => c.name === sortCol);
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = a.parsed[sortCol];
      const vb = b.parsed[sortCol];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;

      let cmp = 0;
      if (colProfile?.type === 'numeric' && typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortCol, sortDir, dataset.columns]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSort = (colName: string) => {
    setPage(1);
    if (sortCol !== colName) {
      setSortCol(colName);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortCol(null);
    }
  };

  return (
    <section id="data-table" className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Detailed Data Table</h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            Showing {sortedRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–
            {Math.min(safePage * pageSize, sortedRows.length)} of{' '}
            {sortedRows.length.toLocaleString('en-US')} matching records
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span>Rows</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono tabular-nums text-slate-800 focus:border-blue-500 focus:outline-none"
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>

          <button
            type="button"
            disabled={sortedRows.length === 0}
            onClick={() => exportFilteredCSV(dataset, sortedRows)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {sortedRows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-800">No rows match the active filters</p>
          <p className="mt-1 text-xs text-slate-500">
            Try clearing your search query or adjusting the category and date filters.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <th className="w-12 px-4 py-2.5 font-medium text-slate-500 font-mono tabular-nums">
                  #
                </th>
                {dataset.columns.map((col) => {
                  const isNumeric = col.type === 'numeric';
                  const isSorted = sortCol === col.name;
                  return (
                    <th
                      key={col.name}
                      className={`px-4 py-2.5 font-semibold text-slate-700 whitespace-nowrap ${
                        isNumeric ? 'text-right' : 'text-left'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(col.name)}
                        className={`inline-flex items-center gap-1 hover:text-slate-950 ${
                          isNumeric ? 'flex-row-reverse' : ''
                        }`}
                      >
                        <span>{col.name}</span>
                        {isSorted ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((row) => (
                <tr key={row.__rowIndex} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-2.5 font-mono tabular-nums text-slate-400">
                    {row.__rowIndex}
                  </td>
                  {dataset.columns.map((col) => {
                    const parsedVal = row.parsed[col.name];
                    const rawVal = row.raw[col.name];
                    const isMissing = parsedVal === null || parsedVal === undefined;
                    const isNumeric = col.type === 'numeric';

                    if (isMissing) {
                      return (
                        <td
                          key={col.name}
                          className={`px-4 py-2.5 text-slate-400 italic ${
                            isNumeric ? 'text-right font-mono tabular-nums' : ''
                          }`}
                        >
                          Missing
                        </td>
                      );
                    }

                    if (isNumeric && typeof parsedVal === 'number') {
                      return (
                        <td
                          key={col.name}
                          className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap"
                        >
                          {formatMetricValue(parsedVal, col)}
                        </td>
                      );
                    }

                    return (
                      <td
                        key={col.name}
                        className={`px-4 py-2.5 text-slate-700 max-w-[260px] truncate ${
                          col.type === 'date' || col.type === 'identifier'
                            ? 'font-mono tabular-nums'
                            : ''
                        }`}
                        title={rawVal}
                      >
                        {rawVal}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-600">
          <span className="font-mono tabular-nums">
            Page {safePage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

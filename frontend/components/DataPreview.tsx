"use client";

import type { GenerateResponse } from "@/lib/api";

// Display-only tidy-up of machine column names (the CSV keeps the real names).
const ACRONYMS: Record<string, string> = {
  usd: "USD", apr: "APR", id: "ID", bmi: "BMI", roe: "ROE", gdp: "GDP", pct: "%",
};
function prettyCol(name: string): string {
  return name
    .split("_")
    .map((w) => ACRONYMS[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function DataPreview({ result }: { result: GenerateResponse }) {
  const cols = result.columns;
  const rows = result.preview;

  function download() {
    const blob = new Blob([result.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nova_${result.num_rows}rows.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-mono text-faint tracking-widest">
          PREVIEW · FIRST {rows.length} OF {result.num_rows.toLocaleString()} ROWS
        </h3>
        <button
          onClick={download}
          className="rounded-xl bg-accent text-bg px-5 py-2.5 font-medium no-underline hover:opacity-90"
        >
          ↓ Download full CSV
        </button>
      </div>
      <div className="overflow-x-auto border border-line">
        <table className="w-full text-xs tabular border-collapse">
          <thead>
            <tr className="border-b border-line-strong">
              {cols.map((c) => (
                <th
                  key={c}
                  className="text-left text-faint font-normal px-3 py-2 whitespace-nowrap"
                >
                  {prettyCol(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0 hover:bg-surface">
                {cols.map((c) => (
                  <td key={c} className="px-3 py-2 whitespace-nowrap text-muted">
                    {formatCell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCell(v: string | number | undefined) {
  if (typeof v === "number") {
    return Number.isInteger(v) ? v.toString() : v.toFixed(2);
  }
  return v ?? "";
}

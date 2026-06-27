"use client";

import type { ColumnSpec } from "@/lib/api";

// Edits the visible columns of a spec (helper columns starting with "_" are
// preserved untouched). Each column maps to a simple distribution the Criteria
// Engine understands.

const TYPES: { value: string; label: string }[] = [
  { value: "continuous", label: "Number (decimal)" },
  { value: "integer", label: "Whole number" },
  { value: "categorical", label: "Category" },
  { value: "binary", label: "Yes / No" },
];

function defaultDist(type: string, min = 0, max = 100): ColumnSpec["dist"] {
  if (type === "categorical") return { dist: "categorical", values: ["A", "B", "C"] };
  if (type === "binary") return { dist: "bernoulli", p: 0.5 };
  return { dist: "uniform", low: min, high: max };
}

export function ColumnEditor({
  columns,
  onChange,
}: {
  columns: ColumnSpec[];
  onChange: (cols: ColumnSpec[]) => void;
}) {
  const visibleIdx = columns.map((c, i) => ({ c, i })).filter((x) => !x.c.name.startsWith("_"));

  function patch(i: number, next: Partial<ColumnSpec>) {
    onChange(columns.map((c, j) => (j === i ? { ...c, ...next } : c)));
  }
  function setType(i: number, type: string) {
    const c = columns[i];
    patch(i, { type, dist: defaultDist(type, c.min ?? 0, c.max ?? 100) });
  }
  function setRange(i: number, key: "min" | "max", v: number) {
    const c = columns[i];
    const min = key === "min" ? v : c.min ?? 0;
    const max = key === "max" ? v : c.max ?? 100;
    patch(i, { min, max, dist: { dist: "uniform", low: min, high: max } });
  }
  function setValues(i: number, raw: string) {
    const values = raw.split(",").map((s) => s.trim()).filter(Boolean);
    patch(i, { dist: { dist: "categorical", values } });
  }
  function remove(i: number) {
    onChange(columns.filter((_, j) => j !== i));
  }
  function add() {
    let n = 1;
    const names = new Set(columns.map((c) => c.name));
    while (names.has(`column_${n}`)) n++;
    onChange([
      ...columns,
      { name: `column_${n}`, type: "continuous", min: 0, max: 100, dist: { dist: "uniform", low: 0, high: 100 } },
    ]);
  }

  return (
    <div className="border border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-faint">
            <th className="text-left font-mono text-[11px] px-3 py-2">COLUMN</th>
            <th className="text-left font-mono text-[11px] px-3 py-2">TYPE</th>
            <th className="text-left font-mono text-[11px] px-3 py-2">RANGE / VALUES</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {visibleIdx.map(({ c, i }) => {
            const dist = (c.dist || {}) as { values?: unknown[] };
            return (
              <tr key={i} className="border-b border-line/50">
                <td className="px-3 py-2">
                  <input
                    value={c.name}
                    onChange={(e) => patch(i, { name: e.target.value.replace(/\s+/g, "_") })}
                    className="bg-surface border border-line px-2 py-1 w-40 text-fg outline-none focus:border-accent"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={c.type}
                    onChange={(e) => setType(i, e.target.value)}
                    className="bg-surface border border-line px-2 py-1 text-fg outline-none focus:border-accent"
                  >
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  {c.type === "categorical" ? (
                    <input
                      value={(dist.values ?? []).map(String).join(", ")}
                      placeholder="e.g. Red, Green, Blue"
                      onChange={(e) => setValues(i, e.target.value)}
                      className="bg-surface border border-line px-2 py-1 w-56 text-fg outline-none focus:border-accent"
                    />
                  ) : c.type === "binary" ? (
                    <span className="text-faint">Yes / No</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 tabular">
                      <input
                        type="number"
                        value={c.min ?? 0}
                        onChange={(e) => setRange(i, "min", Number(e.target.value))}
                        className="bg-surface border border-line px-2 py-1 w-20 text-fg outline-none focus:border-accent"
                      />
                      <span className="text-faint">to</span>
                      <input
                        type="number"
                        value={c.max ?? 100}
                        onChange={(e) => setRange(i, "max", Number(e.target.value))}
                        className="bg-surface border border-line px-2 py-1 w-20 text-fg outline-none focus:border-accent"
                      />
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => remove(i)} className="text-faint hover:text-fail" aria-label="remove column">
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-2">
        <button onClick={add} className="text-xs text-faint hover:text-accent">
          + add column
        </button>
      </div>
    </div>
  );
}

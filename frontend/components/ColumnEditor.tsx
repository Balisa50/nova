"use client";

import { useState } from "react";
import type { ColumnSpec } from "@/lib/api";
import { fromEpochDays, toEpochDays } from "@/lib/rules";

// Edits the visible columns of a spec (helper columns starting with "_" are
// preserved untouched). Each column maps to a simple distribution the Criteria
// Engine understands. The TYPE drives both the input shown here and the
// operators available in the rule builder.

const TYPES: { value: string; label: string }[] = [
  { value: "continuous", label: "Number (decimal)" },
  { value: "integer", label: "Whole number" },
  { value: "categorical", label: "Category" },
  { value: "binary", label: "Yes / No" },
  { value: "datetime", label: "Date / Time" },
  { value: "text", label: "Text" },
  { value: "id", label: "ID / UUID" },
];

const DAY_MS = 86_400_000;
const todayDays = () => Math.round(Date.now() / DAY_MS);

function defaultDist(type: string, min = 0, max = 100): ColumnSpec["dist"] {
  if (type === "categorical") return { dist: "categorical", values: ["A", "B", "C"] };
  if (type === "binary") return { dist: "bernoulli", p: 0.5 };
  if (type === "id") return { dist: "uuid" };
  if (type === "text") return { dist: "constant", value: "" };
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
    const base: Partial<ColumnSpec> = { type };
    if (type === "continuous" || type === "integer") {
      const min = c.min ?? 0;
      const max = c.max ?? 100;
      Object.assign(base, { min, max, dist: { dist: "uniform", low: min, high: max } });
    } else if (type === "datetime") {
      const min = c.type === "datetime" && c.min != null ? c.min : todayDays() - 365;
      const max = c.type === "datetime" && c.max != null ? c.max : todayDays();
      Object.assign(base, { min, max, dist: { dist: "uniform", low: min, high: max } });
    } else {
      Object.assign(base, { min: undefined, max: undefined, dist: defaultDist(type) });
    }
    patch(i, base);
  }

  function setRange(i: number, key: "min" | "max", v: number) {
    const c = columns[i];
    const min = key === "min" ? v : c.min ?? 0;
    const max = key === "max" ? v : c.max ?? 100;
    patch(i, { min, max, dist: { dist: "uniform", low: min, high: max } });
  }

  function setDate(i: number, key: "min" | "max", dateStr: string) {
    const c = columns[i];
    const days = toEpochDays(dateStr);
    const min = key === "min" ? days : c.min ?? todayDays() - 365;
    const max = key === "max" ? days : c.max ?? todayDays();
    patch(i, { min, max, dist: { dist: "uniform", low: min, high: max } });
  }

  function setValues(i: number, values: string[]) {
    patch(i, { dist: { dist: "categorical", values } });
  }

  function setText(i: number, value: string) {
    patch(i, { dist: { dist: "constant", value } });
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
            const dist = (c.dist || {}) as { values?: unknown[]; value?: unknown };
            return (
              <tr key={i} className="border-b border-line/50 align-top">
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
                    <CategoryValues
                      values={(dist.values ?? []).map(String)}
                      onChange={(v) => setValues(i, v)}
                    />
                  ) : c.type === "binary" ? (
                    <span className="text-faint">Yes / No</span>
                  ) : c.type === "id" ? (
                    <span className="text-faint">auto-generated</span>
                  ) : c.type === "text" ? (
                    <input
                      value={String(dist.value ?? "")}
                      placeholder="default text (optional)"
                      onChange={(e) => setText(i, e.target.value)}
                      className="bg-surface border border-line px-2 py-1 w-56 text-fg outline-none focus:border-accent"
                    />
                  ) : c.type === "datetime" ? (
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <input
                        type="date"
                        value={fromEpochDays(c.min ?? todayDays() - 365)}
                        onChange={(e) => setDate(i, "min", e.target.value)}
                        className="bg-surface border border-line px-2 py-1 text-fg outline-none focus:border-accent"
                      />
                      <span className="text-faint">to</span>
                      <input
                        type="date"
                        value={fromEpochDays(c.max ?? todayDays())}
                        onChange={(e) => setDate(i, "max", e.target.value)}
                        className="bg-surface border border-line px-2 py-1 text-fg outline-none focus:border-accent"
                      />
                    </span>
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

// Split a pasted blob into clean values. Handles commas, semicolons, new lines,
// and tabs (so a spreadsheet column or row pastes cleanly). We deliberately do
// NOT split on spaces — that would break multi-word values like "Greater Banjul".
function parseList(raw: string): string[] {
  return raw
    .split(/[,;\n\r\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Add category values: one at a time as chips, or paste a whole list at once.
function CategoryValues({
  values,
  onChange,
}: {
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [bulk, setBulk] = useState("");

  // Append the parsed tokens, skipping anything already present or repeated.
  function addMany(raw: string) {
    const seen = new Set(values);
    const merged = [...values];
    for (const v of parseList(raw)) {
      if (!seen.has(v)) {
        seen.add(v);
        merged.push(v);
      }
    }
    if (merged.length !== values.length) onChange(merged);
  }
  function commitDraft() {
    addMany(draft);
    setDraft("");
  }
  function addBulk() {
    addMany(bulk);
    setBulk("");
  }
  function removeAt(idx: number) {
    onChange(values.filter((_, j) => j !== idx));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((v, idx) => (
          <span
            key={`${v}-${idx}`}
            className="inline-flex items-center gap-1 border border-line bg-surface px-2 py-0.5 text-xs text-fg"
          >
            {v}
            <button
              onClick={() => removeAt(idx)}
              className="text-faint hover:text-fail leading-none"
              aria-label={`remove ${v}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          placeholder="add value…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitDraft();
            }
          }}
          onBlur={commitDraft}
          className="bg-surface border border-line px-2 py-1 w-28 text-fg outline-none focus:border-accent"
        />
      </div>

      {/* Bulk paste — for 10+ values at once */}
      <div>
        <textarea
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter adds the list without leaving the keyboard.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              addBulk();
            }
          }}
          placeholder="Paste a list — commas, new lines, or a spreadsheet column"
          rows={2}
          className="w-full min-w-[16rem] resize-y bg-surface border border-line px-2 py-1.5 text-xs text-fg outline-none focus:border-accent"
        />
        <div className="mt-1.5 flex items-center gap-3">
          <button
            onClick={addBulk}
            disabled={!bulk.trim()}
            className="border border-line px-2.5 py-1 text-xs text-muted hover:text-accent hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add all →
          </button>
          {values.length > 0 && (
            <button onClick={() => onChange([])} className="text-xs text-faint hover:text-fail">
              Clear all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

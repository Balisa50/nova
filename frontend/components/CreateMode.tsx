"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchPreset,
  fetchPresets,
  generateCriteria,
  type CriteriaResponse,
  type CriteriaSpec,
  type PresetSummary,
} from "@/lib/api";

const ROW_PRESETS = [1000, 5000, 10000];

export function CreateMode() {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [spec, setSpec] = useState<CriteriaSpec | null>(null);
  const [specText, setSpecText] = useState("");
  const [showEditor, setShowEditor] = useState(false);

  const [numRows, setNumRows] = useState(5000);
  const [seed, setSeed] = useState(42);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CriteriaResponse | null>(null);

  useEffect(() => {
    fetchPresets()
      .then((ps) => {
        setPresets(ps);
        if (ps.length) selectPreset(ps.find((p) => p.id === "loans")?.id ?? ps[0].id);
      })
      .catch(() => setLoadErr("Backend unreachable — can't load domain presets."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectPreset(id: string) {
    setSelectedId(id);
    setResult(null);
    setError(null);
    try {
      const s = await fetchPreset(id);
      setSpec(s);
      setSpecText(JSON.stringify(s, null, 2));
    } catch {
      setError("Could not load that preset.");
    }
  }

  async function onGenerate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let parsed: CriteriaSpec;
      try {
        parsed = JSON.parse(specText);
      } catch {
        throw new Error("Spec is not valid JSON — check the editor.");
      }
      const res = await generateCriteria({ spec: parsed, num_rows: numRows, seed });
      setResult(res);
      setTimeout(
        () => document.getElementById("create-results")?.scrollIntoView({ behavior: "smooth" }),
        80
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  const visibleColumns = useMemo(
    () => (spec?.columns ?? []).filter((c) => !c.name.startsWith("_")),
    [spec]
  );

  if (loadErr) return <p className="text-sm text-fail font-mono mt-8">● {loadErr}</p>;

  return (
    <div>
      {/* domain picker */}
      <h2 className="text-sm font-mono text-faint tracking-widest mb-5">1 · CHOOSE A DOMAIN</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-line">
        {presets.map((p) => {
          const on = p.id === selectedId;
          return (
            <button
              key={p.id}
              onClick={() => selectPreset(p.id)}
              className={`text-left px-4 py-4 bg-bg transition-colors ${
                on ? "text-fg" : "text-muted hover:text-fg"
              }`}
            >
              <span
                className={`block w-6 border-t-2 mb-2 ${on ? "border-accent" : "border-line"}`}
              />
              <span className="block font-medium text-sm">{p.domain}</span>
              <span className="block text-xs text-faint mt-0.5">
                {p.n_columns} cols · {p.n_rules} rules
              </span>
            </button>
          );
        })}
      </div>

      {spec && (
        <>
          <div className="mt-6 flex items-baseline gap-3">
            <span className="font-mono text-sm text-accent">{spec.name}</span>
            {spec.target && (
              <span className="font-mono text-xs text-faint">target: {spec.target}</span>
            )}
          </div>
          <p className="text-sm text-muted mt-1">{spec.description}</p>

          {/* columns */}
          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5">
            {visibleColumns.map((c) => (
              <span key={c.name} className="font-mono text-xs text-muted">
                {c.name}
                <span className="text-faint"> · {c.type}</span>
              </span>
            ))}
          </div>

          {/* rules — the domain knowledge */}
          <h2 className="text-sm font-mono text-faint tracking-widest mt-10 mb-4">
            2 · DOMAIN KNOWLEDGE ({spec.rules?.length ?? 0} RULES)
          </h2>
          <div className="space-y-2">
            {(spec.rules ?? []).map((r, i) => (
              <div key={i} className="font-mono text-xs leading-relaxed">
                {r.when ? (
                  <>
                    <span className="text-faint">if </span>
                    <span className="text-muted">{r.when}</span>
                    <span className="text-faint"> → </span>
                  </>
                ) : (
                  <span className="text-faint">always → </span>
                )}
                <span className="text-accent">{r.target}</span>
                <span className="text-faint"> = </span>
                <span className="text-muted">{r.expr}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setShowEditor((v) => !v)}
            className="mt-6 text-xs font-mono text-faint hover:text-accent underline underline-offset-4"
          >
            {showEditor ? "▾ hide raw spec" : "▸ edit raw spec (define your own domain)"}
          </button>
          {showEditor && (
            <textarea
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
              spellCheck={false}
              rows={16}
              className="mt-3 w-full bg-surface border border-line p-3 font-mono text-xs text-muted outline-none focus:border-accent"
            />
          )}

          {/* params */}
          <h2 className="text-sm font-mono text-faint tracking-widest mt-10 mb-4">3 · GENERATE</h2>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <label className="block text-sm text-muted">Rows</label>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  min={100}
                  max={20000}
                  value={numRows}
                  onChange={(e) => setNumRows(Number(e.target.value))}
                  className="bg-surface border border-line px-3 py-2 w-32 tabular outline-none focus:border-accent"
                />
                {ROW_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setNumRows(p)}
                    className={`px-3 py-2 text-sm border ${
                      numRows === p ? "border-accent text-accent" : "border-line text-muted"
                    }`}
                  >
                    {p / 1000}k
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-muted">Seed</label>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
                className="mt-2 bg-surface border border-line px-3 py-2 w-24 tabular outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={onGenerate}
              disabled={busy}
              className="bg-accent text-bg px-6 py-3 font-medium disabled:opacity-40 hover:opacity-90"
            >
              {busy ? "Generating…" : "Generate from scratch →"}
            </button>
          </div>
          {error && <p className="mt-4 text-sm text-fail">{error}</p>}
        </>
      )}

      {result && <CreateResults result={result} />}
    </div>
  );
}

function CreateResults({ result }: { result: CriteriaResponse }) {
  const r = result.report;
  function download() {
    const blob = new Blob([result.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nova_${result.domain ?? "synthetic"}.csv`.toLowerCase().replace(/\s+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div id="create-results" className="mt-16 rise">
      <div className="rule-accent mb-10" />
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 mb-10">
        <h2 className="text-2xl font-semibold tracking-tight">Created from nothing</h2>
        <span className="font-mono text-sm text-faint">
          {r.n_rows.toLocaleString()} rows · {r.n_columns} cols · {r.missing_values} missing · 0 source records
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line mb-12">
        <Stat label="Rows" value={r.n_rows.toLocaleString()} />
        <Stat label="Columns" value={String(r.n_columns)} />
        <Stat
          label="Missing values"
          value={String(r.missing_values)}
          good={r.missing_values === 0}
        />
        {r.target && r.target_rate != null ? (
          <Stat label={`${r.target} rate`} value={`${(r.target_rate * 100).toFixed(1)}%`} accent />
        ) : (
          <Stat label="Source data" value="none" accent />
        )}
      </div>

      <PreviewTable columns={result.columns} rows={result.preview} />

      <button
        onClick={download}
        className="mt-8 border border-accent text-accent px-5 py-2.5 text-sm hover:bg-accent hover:text-bg"
      >
        ↓ Download CSV ({r.n_rows.toLocaleString()} rows)
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  good,
}: {
  label: string;
  value: string;
  accent?: boolean;
  good?: boolean;
}) {
  return (
    <div className="bg-bg px-5 py-6">
      <div
        className={`text-3xl font-semibold tabular ${
          accent ? "text-accent" : good ? "text-pass" : "text-fg"
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-faint mt-1 font-mono">{label}</div>
    </div>
  );
}

function PreviewTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, string | number>[];
}) {
  return (
    <div>
      <h3 className="text-sm font-mono text-faint tracking-widest mb-4">PREVIEW · first 10 rows</h3>
      <div className="overflow-x-auto border border-line">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line">
              {columns.map((c) => (
                <th key={c} className="text-left font-mono text-faint px-3 py-2 whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-line/50">
                {columns.map((c) => (
                  <td key={c} className="px-3 py-2 tabular text-muted whitespace-nowrap">
                    {fmt(row[c])}
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

function fmt(v: string | number | undefined) {
  if (typeof v === "number") return Number.isInteger(v) ? v : v.toFixed(2);
  if (typeof v === "string" && v.length > 14) return v.slice(0, 12) + "…";
  return v ?? "";
}

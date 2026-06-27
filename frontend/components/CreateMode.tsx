"use client";

import { useEffect, useState } from "react";
import {
  fetchPreset,
  fetchPresets,
  generateCriteria,
  type CriteriaResponse,
  type CriteriaSpec,
  type PresetSummary,
} from "@/lib/api";

const ROW_PRESETS = [1000, 5000, 10000];

// Clean up machine column names for display only (the downloaded CSV keeps the
// real names so the data stays usable for training).
const ACRONYMS: Record<string, string> = {
  usd: "USD", apr: "APR", id: "ID", bmi: "BMI", roe: "ROE",
  gdp: "GDP", pct: "%", aml: "AML", fdi: "FDI",
};
function prettyCol(name: string): string {
  return name
    .split("_")
    .map((w) => ACRONYMS[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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
      .catch(() => setLoadErr("Can't reach NOVA right now — give it a few seconds and refresh."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectPreset(id: string) {
    setSelectedId(id);
    setResult(null);
    setError(null);
    setShowEditor(false);
    try {
      const s = await fetchPreset(id);
      setSpec(s);
      setSpecText(JSON.stringify(s, null, 2));
    } catch {
      setError("Could not load that domain.");
    }
  }

  async function run(useSeed: number) {
    setBusy(true);
    setError(null);
    try {
      let parsed: CriteriaSpec;
      try {
        parsed = JSON.parse(specText);
      } catch {
        throw new Error("Your custom definition isn't valid — check the editor.");
      }
      const res = await generateCriteria({ spec: parsed, num_rows: numRows, seed: useSeed });
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

  if (loadErr) return <p className="text-sm text-fail font-mono mt-8">● {loadErr}</p>;

  return (
    <div>
      {/* domain picker */}
      <h2 className="text-sm font-mono text-faint tracking-widest mb-2">1 · WHAT DATA DO YOU NEED?</h2>
      <p className="text-sm text-muted mb-5">Pick a domain. NOVA already knows how each one behaves.</p>
      <div className="border-y border-line divide-y divide-line">
        {presets.map((p) => {
          const on = p.id === selectedId;
          return (
            <button
              key={p.id}
              onClick={() => selectPreset(p.id)}
              className="group flex w-full items-start gap-4 py-4 text-left"
            >
              <span
                className={`mt-1 block h-3.5 w-3.5 shrink-0 rounded-full border ${
                  on ? "border-accent bg-accent" : "border-line"
                }`}
              />
              <span className="min-w-0">
                <span className={`block font-medium ${on ? "text-fg" : "text-muted group-hover:text-fg"}`}>
                  {p.name}
                </span>
                <span className="mt-0.5 block text-sm text-faint">{p.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      {spec && (
        <>
          {/* plain-English rules */}
          {spec.highlights && spec.highlights.length > 0 && (
            <>
              <h2 className="text-sm font-mono text-faint tracking-widest mt-12 mb-2">
                2 · HOW THIS DATA BEHAVES
              </h2>
              <p className="text-sm text-muted mb-5">
                NOVA follows these rules so the data looks real. Want to change them, or build a domain
                of your own? Open the editor below.
              </p>
              <ul className="space-y-2.5">
                {spec.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-3 text-[15px] text-muted">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <button
            onClick={() => setShowEditor((v) => !v)}
            className="mt-6 text-xs font-mono text-faint hover:text-accent underline underline-offset-4"
          >
            {showEditor ? "▾ hide advanced editor" : "▸ Define a custom domain (advanced)"}
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

          {/* generate */}
          <h2 className="text-sm font-mono text-faint tracking-widest mt-12 mb-5">3 · HOW MUCH?</h2>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <label className="block text-sm text-muted">Records to create</label>
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
            <button
              onClick={() => run(seed)}
              disabled={busy}
              className="bg-accent text-bg px-6 py-3 font-medium disabled:opacity-40 hover:opacity-90"
            >
              {busy ? "Creating…" : "Create the data →"}
            </button>
          </div>
          {error && <p className="mt-4 text-sm text-fail">{error}</p>}
        </>
      )}

      {result && (
        <CreateResults
          result={result}
          onRegenerate={() => {
            const next = Math.floor(Math.random() * 100000);
            setSeed(next);
            run(next);
          }}
          busy={busy}
        />
      )}
    </div>
  );
}

function CreateResults({
  result,
  onRegenerate,
  busy,
}: {
  result: CriteriaResponse;
  onRegenerate: () => void;
  busy: boolean;
}) {
  const r = result.report;
  function download() {
    const blob = new Blob([result.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nova_${result.domain ?? "data"}.csv`.toLowerCase().replace(/\s+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div id="create-results" className="mt-16 rise">
      <div className="rule-accent mb-8" />
      <div className="flex items-center gap-3 mb-8">
        <span className="text-pass text-xl">✓</span>
        <h2 className="text-2xl font-semibold tracking-tight">Your data is ready</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line mb-12">
        <Stat label="Records created" value={r.n_rows.toLocaleString()} />
        <Stat label="Fields per record" value={String(r.n_columns)} />
        <Stat label="Missing values" value={String(r.missing_values)} good={r.missing_values === 0} />
        {r.target && r.target_rate != null ? (
          <Stat
            label={`${prettyCol(r.target)} rate (matches the rules)`}
            value={`${(r.target_rate * 100).toFixed(1)}%`}
            accent
          />
        ) : (
          <Stat label="Real data used" value="none" accent />
        )}
      </div>

      <h3 className="text-sm font-mono text-faint tracking-widest mb-4">A LOOK AT YOUR DATA</h3>
      <div className="overflow-x-auto border border-line">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line">
              {result.columns.map((c) => (
                <th key={c} className="text-left font-medium text-faint px-3 py-2 whitespace-nowrap">
                  {prettyCol(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.preview.map((row, i) => (
              <tr key={i} className="border-b border-line/50">
                {result.columns.map((c) => (
                  <td key={c} className="px-3 py-2 tabular text-muted whitespace-nowrap">
                    {fmt(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex flex-wrap gap-4">
        <button onClick={download} className="bg-accent text-bg px-5 py-2.5 text-sm font-medium hover:opacity-90">
          ↓ Download CSV ({r.n_rows.toLocaleString()} records)
        </button>
        <button
          onClick={onRegenerate}
          disabled={busy}
          className="border border-line text-muted px-5 py-2.5 text-sm hover:text-fg hover:border-accent disabled:opacity-40"
        >
          {busy ? "Creating…" : "↻ Regenerate"}
        </button>
      </div>
      <p className="mt-4 text-xs text-faint">
        Every record is invented from the rules above. No real person&apos;s data was used.
      </p>
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
      <div className={`text-3xl font-semibold tabular ${accent ? "text-accent" : good ? "text-pass" : "text-fg"}`}>
        {value}
      </div>
      <div className="text-xs text-faint mt-1 leading-snug">{label}</div>
    </div>
  );
}

function fmt(v: string | number | undefined) {
  if (typeof v === "number") return Number.isInteger(v) ? v : v.toFixed(2);
  if (typeof v === "string" && v.length > 16) return v.slice(0, 13) + "…";
  return v ?? "";
}

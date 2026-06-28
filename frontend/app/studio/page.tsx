"use client";

import { useEffect, useState } from "react";
import { UploadCSV } from "@/components/UploadCSV";
import { MetricsDashboard } from "@/components/MetricsDashboard";
import { DataPreview } from "@/components/DataPreview";
import { CreateMode } from "@/components/CreateMode";
import { fetchStatus, generate, WARMING_MESSAGE, type GenerateResponse, type StatusResponse } from "@/lib/api";

const ROW_PRESETS = [1000, 5000, 10000];

export default function Studio() {
  const [mode, setMode] = useState<"create" | "copy">("create");

  const [status, setStatus] = useState<StatusResponse | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [numRows, setNumRows] = useState(5000);
  const [forceRate, setForceRate] = useState(false);
  const [defaultRate, setDefaultRate] = useState(0.25);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const check = () => {
      fetchStatus()
        .then((s) => {
          if (!cancelled) setStatus(s);
        })
        .catch(() => {
          // Quietly keep retrying while a cold backend boots — never alarm the user.
          if (cancelled) return;
          tries += 1;
          if (tries < 12) setTimeout(check, 5000);
        });
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onGenerate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      if (file) form.append("file", file);
      form.append("num_rows", String(numRows));
      if (forceRate) form.append("default_rate", String(defaultRate));
      const res = await generate(form);
      setResult(res);
      setTimeout(
        () => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }),
        80
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : WARMING_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Generation studio</h1>
          <p className="mt-2 text-muted">
            Two ways to make data: <span className="text-fg">Create</span> from domain rules with no
            dataset, or <span className="text-fg">Copy</span> a real dataset you already have.
          </p>
        </div>
        <ModelBadge status={status} />
      </div>

      <ModeToggle mode={mode} setMode={setMode} />
      <div className="rule mt-8 mb-10" />

      {mode === "create" && <CreateMode />}

      {mode === "copy" && (
        <>
          {/* Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-7">
              <h2 className="text-sm font-mono text-faint tracking-widest mb-5">1 · SOURCE DATA</h2>
              <UploadCSV file={file} onFile={setFile} />
            </div>

            <div className="lg:col-span-5">
              <h2 className="text-sm font-mono text-faint tracking-widest mb-5">2 · PARAMETERS</h2>

              <label className="block text-sm text-muted">Rows to generate</label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="number"
                  min={100}
                  max={status?.max_rows ?? 20000}
                  value={numRows}
                  onChange={(e) => setNumRows(Number(e.target.value))}
                  className="rounded-lg bg-surface border border-line px-3 py-2 w-40 tabular outline-none focus:border-accent"
                />
                <div className="flex gap-2">
                  {ROW_PRESETS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setNumRows(p)}
                      className={`rounded-lg px-3 py-2 text-sm border ${
                        numRows === p ? "border-accent text-accent" : "border-line text-muted"
                      }`}
                    >
                      {p >= 1000 ? `${p / 1000}k` : p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-7">
                <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceRate}
                    onChange={(e) => setForceRate(e.target.checked)}
                    className="accent-[var(--color-accent)]"
                  />
                  Force a target default rate
                </label>
                {forceRate && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Default rate</span>
                      <span className="tabular text-accent">{(defaultRate * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={0.6}
                      step={0.01}
                      value={defaultRate}
                      onChange={(e) => setDefaultRate(Number(e.target.value))}
                      className="w-full mt-3"
                    />
                  </div>
                )}
              </div>

              <button
                onClick={onGenerate}
                disabled={busy}
                className="mt-8 w-full rounded-xl bg-accent text-bg py-3.5 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              >
                {busy ? "Generating + validating…" : "Generate synthetic data →"}
              </button>
              {error && <p className="mt-4 text-sm text-muted">{error}</p>}
            </div>
          </div>

          {busy && <Progress />}

          {result && (
            <div id="results" className="mt-16 rise">
              <div className="rule-accent mb-10" />
              <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 mb-10">
                <h2 className="text-2xl font-semibold tracking-tight">Results</h2>
                <span className="font-mono text-sm text-faint">
                  {result.num_rows.toLocaleString()} rows · generated in {result.generation_seconds}s
                </span>
                {result.synthetic_default_rate != null && (
                  <span className="font-mono text-sm text-muted">
                    default rate{" "}
                    <span className="text-accent">
                      {(result.synthetic_default_rate * 100).toFixed(1)}%
                    </span>{" "}
                    vs real {((result.real_default_rate ?? 0) * 100).toFixed(1)}%
                  </span>
                )}
              </div>

              <MetricsDashboard report={result.validation} />
              <div className="rule my-12" />
              <DataPreview result={result} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ModeToggle({
  mode,
  setMode,
}: {
  mode: "create" | "copy";
  setMode: (m: "create" | "copy") => void;
}) {
  const tabs: { id: "create" | "copy"; label: string; sub: string }[] = [
    { id: "create", label: "Create", sub: "from rules · no data needed" },
    { id: "copy", label: "Copy", sub: "from a dataset you have" },
  ];
  return (
    <div className="mt-8 inline-flex w-full gap-1 rounded-2xl border border-line bg-surface/50 p-1 sm:w-auto">
      {tabs.map((t) => {
        const on = t.id === mode;
        return (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            className={`flex-1 rounded-xl px-6 py-3 text-left transition-all duration-200 sm:flex-none ${
              on ? "bg-bg shadow-[0_1px_3px_rgba(0,0,0,0.45)]" : "hover:bg-bg/40"
            }`}
          >
            <span className={`block font-medium ${on ? "text-accent" : "text-muted"}`}>{t.label}</span>
            <span className="block text-xs text-faint">{t.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

function ModelBadge({ status }: { status: StatusResponse | null }) {
  // Two calm states only — "ready" or "warming up". Never a red "offline".
  if (!status) return <span className="text-sm text-faint font-mono">● warming up…</span>;
  return <span className="text-sm font-mono text-pass">● ready</span>;
}

function Progress() {
  return (
    <div className="mt-12">
      <div className="rule mb-6" />
      <div className="flex items-center gap-3 text-muted">
        <span className="block w-2.5 h-2.5 bg-accent live-dot" />
        <span className="font-mono text-sm">
          Creating your data and checking it four ways…
        </span>
      </div>
    </div>
  );
}

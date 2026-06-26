"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { ValidationReport } from "@/lib/api";

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function Bar({ score, pass }: { score: number; pass: boolean }) {
  return (
    <div className="h-2 bg-line w-full mt-3">
      <div
        className="h-2"
        style={{
          width: `${clamp01(score) * 100}%`,
          background: pass ? "var(--color-pass)" : "var(--color-fail)",
        }}
      />
    </div>
  );
}

function Verdict({ pass }: { pass: boolean }) {
  return (
    <span
      className="font-mono text-xs px-2 py-1"
      style={{
        color: pass ? "var(--color-pass)" : "var(--color-fail)",
        background: pass ? "rgba(84,224,138,0.12)" : "rgba(255,107,107,0.12)",
      }}
    >
      {pass ? "PASS" : "FAIL"}
    </span>
  );
}

export function MetricsDashboard({ report }: { report: ValidationReport }) {
  const stat = report.statistical.summary;
  const corr = report.correlation;
  const tstr = report.tstr;
  const priv = report.privacy;
  const dist = report.distinguishability;

  const privacyScore = clamp01(priv.median_dcr_ratio);
  const corrScore = clamp01(1 - corr.l1_diff);

  const radarData = [
    { metric: "Similarity", score: clamp01(stat.mean_similarity) },
    { metric: "Correlation", score: corrScore },
    { metric: "TSTR", score: tstr ? clamp01(tstr.auc_ratio) : 0 },
    { metric: "Privacy", score: privacyScore },
  ];

  const metrics = [
    {
      title: "Statistical similarity",
      head: stat.mean_similarity.toFixed(3),
      sub: `mean column-shape fidelity · ${(stat.pass_rate * 100).toFixed(0)}% pass KS/Chi² p>0.05 at n=500`,
      threshold: "target ≥ 0.90 mean similarity",
      score: clamp01(stat.mean_similarity),
      pass: stat.overall_pass,
    },
    {
      title: "Correlation preservation",
      head: corr.l1_diff.toFixed(3),
      sub: `L1 distance over the correlation matrix · max ${corr.max_diff.toFixed(2)}`,
      threshold: "target < 0.10",
      score: corrScore,
      pass: corr.pass,
    },
    {
      title: "TSTR utility",
      head: tstr ? tstr.performance_ratio.toFixed(3) : "—",
      sub: tstr
        ? `train-on-synthetic accuracy ratio · AUC ratio ${tstr.auc_ratio.toFixed(2)} (synth AUC ${tstr.synth_auc.toFixed(2)})`
        : "no target column detected",
      threshold: "target ≥ 0.90",
      score: tstr ? clamp01(tstr.performance_ratio) : 0,
      pass: tstr ? tstr.pass : true,
    },
    {
      title: "Privacy (distance to closest record)",
      head: priv.median_dcr_ratio.toFixed(3),
      sub: `synthetic-vs-real nearest-neighbour ratio · ${(priv.duplicate_share * 100).toFixed(1)}% near-duplicates · ≥1.0 means no memorisation`,
      threshold: "target ≥ 0.90 ratio, ≤ 5% duplicates",
      score: privacyScore,
      pass: priv.pass,
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Headline + radar */}
        <div className="lg:col-span-5">
          <div className="text-sm font-mono text-faint tracking-widest">OVERALL</div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-6xl font-semibold tabular">
              {report.overall.passed}
              <span className="text-muted">/{report.overall.total}</span>
            </span>
            <span className="text-muted">metrics passed</span>
          </div>
          <div className="h-56 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="78%">
                <PolarGrid stroke="rgba(255,255,255,0.14)" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: "#9aa0a6", fontSize: 12, fontFamily: "monospace" }}
                />
                <Radar
                  dataKey="score"
                  stroke="#c6f24e"
                  fill="#c6f24e"
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Per-metric rows */}
        <div className="lg:col-span-7 divide-y divide-line">
          {metrics.map((m) => (
            <div key={m.title} className="py-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">{m.title}</div>
                  <div className="text-sm text-muted mt-0.5">{m.sub}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-3xl font-semibold tabular">{m.head}</span>
                  <Verdict pass={m.pass} />
                </div>
              </div>
              <Bar score={m.score} pass={m.pass} />
              <div className="text-xs font-mono text-faint mt-2">{m.threshold}</div>
            </div>
          ))}
          <div className="py-4 text-xs font-mono text-faint">
            diagnostic · real-vs-synthetic detection accuracy{" "}
            {dist.attack_accuracy.toFixed(3)} (fidelity gap, not a privacy leak —
            lower is better)
          </div>
        </div>
      </div>
    </div>
  );
}

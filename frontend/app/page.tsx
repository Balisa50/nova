import Link from "next/link";

const STATS = [
  { value: "80%", label: "of AI projects stall on data problems", src: "Gartner" },
  { value: "60%", label: "of AI budgets spent preparing data", src: "McKinsey" },
  { value: "70%", label: "of banks cite privacy as their #1 AI barrier", src: "Deloitte" },
  { value: "$20B", label: "projected synthetic-data market by 2030", src: "MarketsandMarkets" },
];

const STEPS = [
  {
    n: "01",
    t: "Learn the structure",
    d: "A Conditional Tabular GAN, implemented from scratch, learns the joint distribution of a real loan book — distributions, correlations, the way default risk actually behaves.",
  },
  {
    n: "02",
    t: "Generate new records",
    d: "Sample as many brand-new rows as you need. They share the statistical shape of the real data but belong to no real person.",
  },
  {
    n: "03",
    t: "Prove it four ways",
    d: "Every batch is scored on statistical similarity, correlation preservation, train-on-synthetic utility (TSTR), and a privacy attack — with explicit pass thresholds.",
  },
  {
    n: "04",
    t: "Ship it",
    d: "Download the CSV, or wire the API into a pipeline. Share real-shaped data without exposing a single real customer.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* Hero */}
      <section className="pt-20 pb-16">
        <div className="flex items-center gap-3 text-xs font-mono text-accent mb-6">
          <span className="block w-2 h-2 bg-accent live-dot" />
          GENERATIVE AI · FINANCIAL INCLUSION · WEST AFRICA
        </div>
        <h1 className="text-5xl sm:text-7xl font-semibold tracking-tight leading-[1.02]">
          Banks have the data.
          <br />
          Builders have <span className="text-accent">none</span>.
        </h1>
        <p className="mt-8 max-w-2xl text-lg text-muted leading-relaxed">
          Sensitive customer data can&apos;t leave the building — so the models that could
          widen financial inclusion in West Africa never get trained. SYNTH-FIN breaks the
          deadlock: a generative engine that produces{" "}
          <span className="text-fg">privacy-safe, statistically identical</span> microfinance
          data, on demand.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Link
            href="/studio"
            className="bg-accent text-bg px-6 py-3 font-medium no-underline hover:opacity-90"
          >
            Generate synthetic data →
          </Link>
          <a
            href="https://github.com/Balisa50/synth-fin"
            className="text-muted hover:text-fg no-underline border-b border-line-strong pb-0.5"
          >
            Read the source
          </a>
        </div>
      </section>

      <div className="rule-accent" />

      {/* Problem */}
      <section id="problem" className="py-16">
        <h2 className="text-sm font-mono text-faint tracking-widest mb-10">
          THE DATA DEADLOCK
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-12">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-5xl font-semibold tracking-tight tabular text-fg">
                {s.value}
              </div>
              <div className="mt-3 text-sm text-muted leading-snug">{s.label}</div>
              <div className="mt-2 text-xs font-mono text-faint">— {s.src}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="rule" />

      {/* How it works */}
      <section id="how" className="py-16">
        <h2 className="text-sm font-mono text-faint tracking-widest mb-10">HOW IT WORKS</h2>
        <div className="divide-y divide-line">
          {STEPS.map((s) => (
            <div key={s.n} className="grid grid-cols-1 md:grid-cols-12 gap-4 py-8">
              <div className="md:col-span-2 font-mono text-2xl text-accent">{s.n}</div>
              <h3 className="md:col-span-3 text-xl font-medium">{s.t}</h3>
              <p className="md:col-span-7 text-muted leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="rule" />

      {/* Validation strip */}
      <section className="py-16">
        <h2 className="text-sm font-mono text-faint tracking-widest mb-10">
          VALIDATED, NOT ASSERTED
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {[
            ["Statistical similarity", "KS + Chi² distribution tests"],
            ["Correlation preservation", "L1 distance over the correlation matrix"],
            ["TSTR utility", "Train on synthetic, test on real"],
            ["Privacy (DCR)", "Distance to closest record — no memorisation"],
          ].map(([t, d]) => (
            <div key={t}>
              <div className="h-1 w-10 bg-accent mb-4" />
              <h3 className="font-medium">{t}</h3>
              <p className="mt-2 text-sm text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="rule-accent" />

      {/* CTA */}
      <section className="py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Try it on your own CSV — or the bundled loan book.
        </h2>
        <Link
          href="/studio"
          className="inline-block mt-8 bg-accent text-bg px-8 py-4 font-medium no-underline hover:opacity-90"
        >
          Open the studio →
        </Link>
      </section>
    </div>
  );
}

import Link from "next/link";

const STATS = [
  { value: "80%", label: "of AI projects stall on data problems", src: "Gartner" },
  { value: "60%", label: "of AI budgets spent preparing data", src: "McKinsey" },
  { value: "70%", label: "of banks cite privacy as their #1 AI barrier", src: "Deloitte" },
  { value: "$20B", label: "projected synthetic-data market by 2030", src: "MarketsandMarkets" },
];

const DOMAINS = [
  { name: "Loans", use: "Credit scoring" },
  { name: "Transactions", use: "Fraud detection" },
  { name: "Insurance", use: "Actuarial modelling" },
  { name: "Remittances", use: "Economic analysis" },
  { name: "Macro", use: "Economic indicators" },
  { name: "Investment", use: "Portfolio risk" },
  { name: "Corporate", use: "Credit analysis" },
];

const STEPS = [
  {
    n: "01",
    t: "Describe what you need",
    d: "Pick a domain (loans, transactions, insurance, or define your own) and tell NOVA the columns you want and the rules behind them, like “rural schools have lower pass rates”.",
  },
  {
    n: "02",
    t: "Generate new data",
    d: "NOVA creates brand-new records that follow your rules. No real data required, just domain knowledge. Or upload a file you already have and get a safe synthetic twin.",
  },
  {
    n: "03",
    t: "Check it’s good",
    d: "NOVA checks four things: does it look realistic, are the relationships right, can you train a model on it, and is it truly private? All four pass.",
  },
  {
    n: "04",
    t: "Download and use",
    d: "Get a CSV you can use straight away, for training, testing, or sharing, without exposing a single real customer.",
  },
];

const CHECKS = [
  ["Does it look real?", "The shape and spread of every field matches reality."],
  ["Are the relationships right?", "Income still drives loan size; risk still drives default."],
  ["Can you actually use it?", "A model trained on it performs almost as well as on real data."],
  ["Is it truly private?", "No record is a copy of, or traceable to, a real person."],
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* Hero */}
      <section className="pt-20 pb-16">
        <div className="flex items-center gap-3 text-xs font-mono text-accent mb-6">
          <span className="block w-2 h-2 bg-accent live-dot" />
          SYNTHETIC DATA · FINANCIAL INCLUSION · WEST AFRICA
        </div>
        <h1 className="text-5xl sm:text-7xl font-semibold tracking-tight leading-[1.02]">
          Banks have the data.
          <br />
          Builders have <span className="text-accent">none</span>.
        </h1>
        <p className="mt-8 max-w-2xl text-lg text-muted leading-relaxed">
          Sensitive customer data can’t leave the building, so the models that could widen
          financial inclusion in West Africa never get trained. NOVA breaks the deadlock: generate
          privacy-safe, realistic financial data on demand, from your own rules or from a file you
          already have.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Link
            href="/studio"
            className="rounded-xl bg-accent text-bg px-6 py-3 font-medium no-underline hover:opacity-90"
          >
            Generate data →
          </Link>
          <a
            href="https://github.com/Balisa50/nova"
            className="text-muted hover:text-fg no-underline border-b border-line-strong pb-0.5"
          >
            See the code
          </a>
        </div>
      </section>

      <div className="rule-accent" />

      {/* Problem */}
      <section id="problem" className="py-16">
        <h2 className="text-sm font-mono text-faint tracking-widest mb-10">THE DATA DEADLOCK</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-12">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-5xl font-semibold tracking-tight tabular text-fg">{s.value}</div>
              <div className="mt-3 text-sm text-muted leading-snug">{s.label}</div>
              <div className="mt-2 text-xs font-mono text-faint">{s.src}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="rule" />

      {/* Two ways */}
      <section className="py-16">
        <h2 className="text-sm font-mono text-faint tracking-widest mb-10">TWO WAYS TO MAKE DATA</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-line">
          <div className="bg-bg pr-0 md:pr-10 py-2">
            <div className="h-1 w-10 bg-accent mb-4" />
            <h3 className="text-2xl font-medium">
              Create <span className="text-faint text-lg">from nothing</span>
            </h3>
            <p className="mt-3 text-muted leading-relaxed">
              Tell NOVA what you want: the columns, and the rules behind them, like “a brand-new
              account making a large international transfer is likely fraud”. It builds realistic
              records from nothing. No dataset needed. Seven ready-made domains, or define your own.
            </p>
          </div>
          <div className="bg-bg md:pl-10 py-2">
            <div className="h-1 w-10 bg-accent mb-4" />
            <h3 className="text-2xl font-medium">
              Copy <span className="text-faint text-lg">from real data</span>
            </h3>
            <p className="mt-3 text-muted leading-relaxed">
              Already have a real dataset? NOVA studies its patterns (the ranges, the
              relationships, the unusual cases) and creates a brand-new set that behaves the same
              way, but belongs to no real person.
            </p>
          </div>
        </div>
      </section>

      <div className="rule" />

      {/* What you can generate */}
      <section className="py-16">
        <h2 className="text-sm font-mono text-faint tracking-widest mb-10">WHAT YOU CAN GENERATE</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-line">
          {DOMAINS.map((d) => (
            <div key={d.name} className="bg-bg p-5">
              <div className="h-1 w-8 bg-accent mb-3" />
              <div className="font-medium">{d.name}</div>
              <div className="text-sm text-faint mt-0.5">{d.use}</div>
            </div>
          ))}
          <Link href="/studio" className="bg-bg p-5 no-underline group">
            <div className="h-1 w-8 bg-line group-hover:bg-accent mb-3 transition-colors" />
            <div className="font-medium text-muted group-hover:text-fg">Your own domain →</div>
            <div className="text-sm text-faint mt-0.5">Define columns + rules</div>
          </Link>
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

      {/* Trust strip */}
      <section className="py-16">
        <h2 className="text-sm font-mono text-faint tracking-widest mb-10">
          EVERY BATCH IS CHECKED FOUR WAYS
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {CHECKS.map(([t, d]) => (
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
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">Try it yourself.</h2>
        <p className="mt-4 text-muted">Pick a domain, or upload your own CSV. No sign-up.</p>
        <Link
          href="/studio"
          className="inline-block mt-8 rounded-xl bg-accent text-bg px-8 py-4 font-medium no-underline hover:opacity-90"
        >
          Open the studio →
        </Link>
      </section>
    </div>
  );
}

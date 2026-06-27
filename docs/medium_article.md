# The Real Reason I Built NOVA

*A synthetic data engine I made because generating data by hand was wearing me out.*

---

I read that synthetic data generation is one of the hottest skills in data science right now.

I also needed a project for my portfolio. Something AI-related, something that actually worked, not another notebook that runs once and dies.

There was just one problem: I couldn't get real data from home.

I'm from The Gambia. We don't have open datasets, not for finance, not for education, not for the kind of thing you'd need to build a serious machine learning project. I could have pulled something off Kaggle, but that felt disconnected from where I'm from and what I wanted to build. I wanted the project to mean something.

So I started generating data myself. Writing scripts. Hard-coding rules. Sampling from distributions and patching the correlations by hand until the numbers looked plausible. It worked. It was also exhausting. Every new dataset meant rewriting the whole thing, and I slowly realised I was spending all my time *making* data and almost none *using* it.

So I thought: what if I built a tool that does this for me?

That's NOVA.

## Two modes, one idea

The idea is simple. Sometimes you have a little real data and want more of it. Sometimes you have no data at all, just knowledge about how a thing behaves. NOVA handles both.

**Mode 1 — Copy.** You upload a CSV. NOVA learns the structure of it (the distributions, the correlations, the way columns move together) and generates brand-new rows that follow the same patterns without copying anyone.

**Mode 2 — Create.** You describe the data instead of uploading it. Define the columns, give each one a distribution, write a few domain rules ("rural schools score lower", "a new account making a large international transfer is probably fraud"), and NOVA generates a dataset from that description alone. No source data required.

## The research behind it

I didn't want to import a black box, so I built the hard part from scratch.

Mode 1 is a **Conditional Tabular GAN (CTGAN)**, implemented in PyTorch from the paper up. The pieces that matter:

- **Mode-specific normalization.** Tabular columns are messy. A single income column can have three humps. So each continuous column is fit with a Bayesian Gaussian mixture, and every value is encoded as *which mode it belongs to* plus *how far it sits inside that mode*. This is what lets a GAN handle multi-modal, non-Gaussian columns instead of smearing them into one blob.
- **Training-by-sampling with a conditional vector.** Rare categories get drowned out if you sample naively. So during training the generator is conditioned on a randomly chosen category, and the data is sampled to match, which forces the model to actually learn the rare classes.
- **A PacGAN critic with WGAN-GP loss.** Packing several samples into each critic decision is a cheap, effective defence against mode collapse, and the gradient penalty keeps training stable.

Mode 2 is a **criteria engine**: a small, vectorised rule interpreter. You give it columns, distributions, and ordered rules, and it samples and applies the rules like spreadsheet formulas. The rules arrive as strings over an API, so I evaluate them with a **whitelist AST evaluator** rather than `eval` — only arithmetic, comparisons, boolean logic, and a handful of safe functions are allowed, so a user can't inject code through a rule.

## Validation, honestly

Anyone can claim their synthetic data is good. I wanted to measure it, and I wanted the measurements to be the right ones.

I validated Mode 1 on a West African loan dataset, the only real data I could get. Four checks:

**1. Statistical similarity — 0.94.** Per column, I compare the real and synthetic distributions (Kolmogorov–Smirnov for continuous, Chi-squared for categorical). One honest note: I score these on the *test statistic*, the actual effect size, not the p-value. At ten thousand rows a p-value collapses to zero for any model, so a "p > 0.05" pass rule is impossible to satisfy and would be dishonest to report. The statistic measures how far apart the distributions actually are, which is what you care about.

**2. Correlation preservation — L1 difference of 0.05.** The real value of tabular data is the relationships between columns. I compare the full correlation matrices and report the average absolute difference. 0.05 means the structure survives.

**3. Train on synthetic, test on real (TSTR) — 92%.** The practical test. Train a classifier only on synthetic data, then evaluate it on real, held-out data. It reaches 92% of the accuracy a model trained on real data gets (94% by AUC). If the synthetic data were junk, this number would fall apart.

**4. Privacy — distance-to-closest-record ratio of 1.10.** For privacy I measure how close each synthetic row sits to its nearest real record, compared to how close a fresh real sample sits. A ratio near 1.0 means synthetic rows are no closer to real people than real samples are to each other, so the model isn't memorising. Only 1.1% of rows were near-duplicates. (I deliberately did *not* use a detection classifier here; "can you tell real from fake" measures fidelity, not privacy.)

All four passed.

For Mode 2, I tested it by generating 50,000 WASSCE student records for The Gambia from GBoS, UNESCO, and WAEC statistics, then checking that every constraint held in the output. It did, and it took about ten seconds.

## The app

NOVA is a real web app, not a notebook. Next.js on Vercel for the studio, FastAPI on Fly.io for the engine.

It's live: **https://nova-gamma-eight.vercel.app**

You can pick a domain (loans, transactions, insurance, remittances, macro indicators, investments, corporate statements) or define your own. You build rules with dropdowns instead of code, generate thousands of rows in seconds, and download a CSV. For custom domains you define each column with a type (number, category, yes/no, date, ID, text), and you can paste a whole list of category values at once instead of typing them in one by one.

It's rough in places. The backend sleeps after five minutes on the free tier, so the first request is slow while it wakes up. The UI could be cleaner. But it works.

It's open source: **https://github.com/Balisa50/nova**

## What I learned

That synthetic data generation is genuinely useful, not just a résumé keyword.

That building from scratch teaches you things a library never will. I now understand *why* mode-specific normalization exists, because I watched the model fail without it.

That constraints force you to learn. Deploying on a free tier taught me about cold starts, 512MB memory limits, and the difference between a CPU and a CUDA build of PyTorch, all things a tutorial would have hidden from me.

## What's next

More domains. A cleaner studio. Better defaults so the first dataset you generate is impressive without any tuning. And I want to keep poking at the validation, because measuring synthetic data well is harder and more interesting than generating it.

## Thank you

I built this because I needed it. I'm sharing it because I think other people who can't easily get data need it too.

If you try it, tell me what breaks. I want to make it better.

---

*Abdoulie Balisa — [portfolio](https://balisa50.github.io) · [GitHub](https://github.com/Balisa50)*

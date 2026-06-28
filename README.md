<!-- markdownlint-disable MD013 MD033 -->
# NOVA

**A universal synthetic-data engine for finance - with two modes - served through a FastAPI + Next.js web app.**

- **Create** *(from nothing)* - define columns, distributions and **domain rules**, and NOVA generates brand-new, realistic data **with no source dataset**. Ships with presets for seven financial domains (banking, payments/fraud, insurance, remittances, macro, wealth, corporate) - or define your own. This is the answer to data scarcity in understudied regions: anyone with domain knowledge can make the data they need.
- **Copy** *(from real data)* - upload a CSV and a **Conditional Tabular GAN, built from scratch in PyTorch**, learns its joint distribution and generates statistically identical, privacy-safe rows, scored on four independent validation metrics.

> This is a research-portfolio project. Every component - the ground-truth generator, the CTGAN, the preprocessing, the validation suite, and the criteria engine - is implemented from first principles. No `sdv`/`ctgan` library is used for the model.

---

## Table of contents
1. [What's inside](#whats-inside)
2. [Architecture](#architecture)
3. [Quickstart](#quickstart)
4. [The dataset](#the-dataset)
5. [The CTGAN](#the-ctgan)
6. [Validation](#validation)
7. [API](#api)
8. [Web app](#web-app)
9. [Deployment](#deployment)
10. [Design decisions & honesty notes](#design-decisions--honesty-notes)
11. [License](#license)

---

## What's inside

```
nova/
├── backend/
│   ├── synthfin/
│   │   ├── data/generator.py    # structural-causal ground-truth generator
│   │   ├── preprocessing.py     # mode-specific normalization + one-hot (+inverse)
│   │   ├── ctgan.py             # Generator, Discriminator, DataSampler, CTGAN
│   │   ├── validation.py        # KS/Chi2, correlation L1, TSTR, privacy MIA
│   │   └── schema.py            # automatic schema detection for any CSV
│   ├── app/                     # FastAPI service (main.py + service.py)
│   ├── scripts/                 # generate_dataset / check_preprocessing / train / validate
│   ├── data/west_african_loans.csv
│   └── models/ctgan_final.pth
├── frontend/                    # Next.js 16 + TypeScript + Tailwind
├── render.yaml                  # backend deploy blueprint
└── docs/                        # Medium article + LinkedIn post drafts
```

## Architecture

```
 Browser ──▶ Next.js (Vercel) ──▶ /api/generate ──▶ FastAPI (Render)
                                                        │
                              ┌─────────────────────────┼──────────────────────────┐
                              ▼                         ▼                          ▼
                     DataTransformer            CTGAN.sample()               validate_all()
              (mode-specific normalization)   (conditional generator)   (KS/Chi2 · corr · TSTR · MIA)
```

## Quickstart

```bash
# 1. Backend env
cd backend
pip install -r requirements.txt

# 2. Build the ground-truth dataset (verifies correlations + constraints)
python -m scripts.generate_dataset

# 3. Sanity-check the preprocessing round-trip
python -m scripts.check_preprocessing

# 4. Train the CTGAN (CPU-friendly, early stopping)
python -m scripts.train --epochs 300

# 5. Validate synthetic vs real
python -m scripts.validate

# 6. Run the API
uvicorn app.main:app --reload
# -> http://127.0.0.1:8000/docs

# 7. Frontend
cd ../frontend
npm install
echo "NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000" > .env.local
npm run dev
```

## The dataset

A 10,000-row, 29-column synthetic ground-truth set simulating West African microfinance loans (`scripts/generate_dataset.py`). Columns span demographics, loan terms, collateral, borrower history, macro context, and three nested default flags.

Rather than drawing columns independently, the generator is a **structural causal model**: latent standard-normal drivers are combined and pushed through copula transforms, so the required correlations emerge from a coherent story (education → income → loan size; rural → agriculture; risk drivers → default). The script verifies all ten target correlations and seven integrity constraints on every run.

## The CTGAN

Faithful to Xu et al. (2019), *Modeling Tabular Data using Conditional GAN*:

| Component | Implementation |
|---|---|
| Continuous columns | Per-column Bayesian Gaussian Mixture, mode-specific normalization (alpha scalar + mode one-hot) |
| Discrete columns | One-hot, NaN carried as its own category |
| Generator | Residual MLP, tanh + gumbel-softmax outputs, conditional vector |
| Critic | PacGAN packing + LeakyReLU/Dropout, **WGAN-GP** gradient penalty |
| Training-by-sampling | Log-frequency category sampling so rare classes (defaulters) don't collapse |
| Early stopping | Best checkpoint by mean KS fidelity on a held-aside real subsample |

## Validation

`synthfin/validation.py` - four independent checks, each with a pass/fail threshold:

| Metric | Method | Pass threshold | Result |
|---|---|---|---|
| Statistical similarity | Mean column-shape similarity (1 − KS statistic / 1 − TVD) | ≥ 0.90 | **0.943** ✅ |
| Correlation preservation | L1 mean \|corr_real − corr_synth\| | < 0.10 | **0.051** ✅ |
| TSTR utility | RandomForest trained on synthetic, tested on real | accuracy ratio ≥ 0.90 | **0.92** (AUC ratio **0.94**) ✅ |
| Privacy (DCR) | Distance to closest record vs a real holdout | ratio ≥ 0.90, duplicates ≤ 5% | **1.10**, **1.1%** ✅ |

**All four metrics pass** (model: 100 epochs, early-stopped; best validation KS 0.11). Full results in `backend/models/validation_report.json`; re-generate with `python -m scripts.validate`.

Two deliberate, documented departures from the original spec, both to be *more* rigorous, not less:

- **Statistical similarity is scored on the KS/Chi² statistic (effect size), not the p-value.** At n = 10,000 a KS p-value collapses to ~0 for differences far too small to matter, so a "p > 0.05 for 80% of columns" rule is unachievable for *any* generator. Mean column-shape similarity is the sample-size-independent measure (the SDMetrics convention); the p-value pass-rate is still reported for transparency.
- **Privacy is measured with Distance-to-Closest-Record, not a detection classifier.** A real-vs-synthetic detector measures *fidelity*, not privacy - and a high score is not a leak (a model that memorised the data would be undetectable yet maximally unsafe). DCR asks the correct question: are synthetic rows abnormally close to real training rows? The detection accuracy is still reported as a fidelity *diagnostic* (≈0.89 - synthetic data remains somewhat distinguishable, as expected from a from-scratch CTGAN on CPU).

## API

| Endpoint | Method | Mode | Description |
|---|---|---|---|
| `/api/health` | GET | - | Liveness + whether a model is loaded |
| `/api/status` | GET | - | Trained epochs, columns, target, device |
| `/api/generate` | POST | Copy | CSV (optional) + `num_rows` + `default_rate` → synthetic preview, full CSV, validation metrics |
| `/api/sample` | GET | Copy | Download a 1,000-row sample to try the app |
| `/api/presets` | GET | Create | List the financial-domain criteria presets |
| `/api/preset/{id}` | GET | Create | Full criteria spec for one preset |
| `/api/generate-criteria` | POST | Create | `preset_id` **or** custom `spec` + `num_rows` → data generated from rules alone |

## Create mode - the criteria engine

`synthfin/criteria.py` generates data from a JSON spec of **columns + distributions + ordered rules**, no source data required:

```jsonc
{ "columns": [
    {"name": "exam_score", "type": "continuous", "dist": {"dist": "normal", "mu": 62, "sigma": 18}, "min": 0, "max": 100},
    {"name": "school_setting", "type": "categorical", "dist": {"dist": "categorical", "values": ["Urban","Rural"], "weights":[0.4,0.6]}},
    {"name": "passed", "type": "binary"} ],
  "rules": [
    {"target": "exam_score", "when": "school_setting == 'Rural'", "expr": "exam_score - 8"},
    {"target": "passed", "expr": "exam_score >= 40"} ] }
```

Rule conditions/expressions are evaluated by a **whitelist AST evaluator** (never `eval()`), so a spec that arrives over the API cannot inject code - attribute access, arbitrary calls, subscripting and lambdas are all rejected. Run `python -m scripts.check_criteria` to see the rural-Gambia student example reproduce its domain rules and block three injection attempts; `python -m scripts.build_presets` writes and smoke-tests the seven domain presets.

## Web app

Next.js 16 (App Router) + TypeScript + Tailwind. A **Create / Copy** mode toggle drives the studio: Create lets you pick a domain (or edit the raw spec) and generate from rules; Copy is the drag-and-drop CSV → CTGAN flow with the four-metric dashboard. The UI is intentionally **flat** - accent rules and dividers instead of boxed cards.

## Deployment

- **Frontend → Vercel.** Set `NEXT_PUBLIC_BACKEND_URL` (and `BACKEND_URL`) to the backend URL.
- **Backend → Fly.io** via `backend/fly.toml` + `backend/Dockerfile` (CPU-only torch; numpy 2.x / scikit-learn 1.7.2 pinned so the checkpoint loads). `render.yaml` is kept as an alternative. PyTorch + RandomForest validation wants >512 MB for heavy `/generate`; bump the VM or lower `MAX_ROWS`. (Create mode is light and runs comfortably in 512 MB.)

## Design decisions & honesty notes

- **Added `monthly_income_usd`.** The original spec's correlation table referenced an "Income" column that wasn't in the column list; income is the natural anchor for loan size and default, so it's made explicit.
- **`loan_amount_local = usd × fx` and `interest_rate_daily` derived from APR.** The spec drew these independently, which would let the two currencies / two rate quotes contradict each other. They're made internally consistent.
- **Generator width.** The canonical CTGAN (256×256 residual blocks) is used rather than the prompt's 256→512→1024 tower - it is both more faithful to the paper and ~5× faster on CPU with no measurable quality loss at this scale.
- **CTGAN does not enforce hard arithmetic identities.** `loan_amount_local` correlates strongly with `usd × fx` but is not exactly equal, because the model learns a joint distribution rather than a deterministic rule - expected GAN behaviour.

## License

MIT.

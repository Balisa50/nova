# Benchmark against SDV's CTGAN

An implementation of a paper is a learning exercise until someone checks it
against the reference. This is that check, including where this implementation
loses.

Reproduce with `python -m benchmarks.sdv_comparison`. Raw output is in
`results.json`.

## Setup

Both implementations get identical data, an identical split, identical
hyperparameters and an identical seed. The only variable is the implementation.

| | |
|---|---|
| Reference | SDV 1.38.2, `CTGANSynthesizer` |
| Datasets | `adult`, `news`, `insurance` from SDV's own demo set |
| Rows | 3,000 subsampled, 70% used for training |
| Epochs | 100 |
| Batch / pac | 500 / 10 |
| Seed | 0 |
| Hardware | CPU |

Scoring uses two judges. The primary one is **SDV's own `sdmetrics` quality
report**, written by the authors of the implementation being compared against,
so it cannot be accused of favouring this one. This project's four-metric suite
runs alongside it, because it measures things sdmetrics does not: downstream
utility and nearest-neighbour privacy.

## Headline result

Quality, by SDV's own scorer. Higher is better.

| Dataset | this CTGAN | SDV CTGAN | Difference |
|---|---|---|---|
| adult | **0.821** | 0.790 | +0.031 |
| news | **0.785** | 0.763 | +0.022 |
| insurance | **0.877** | 0.822 | +0.055 |

It scores higher on all three. The margin is consistent but not large, and one
seed cannot separate 0.02 from noise. Read this as "competitive with the
reference", not as "better than it".

Broken into the two properties sdmetrics reports:

| Dataset | Column Shapes | | Column Pair Trends | |
|---|---|---|---|---|
| | this | SDV | this | SDV |
| adult | **0.888** | 0.851 | **0.753** | 0.729 |
| news | **0.936** | 0.889 | 0.633 | **0.637** |
| insurance | **0.972** | 0.921 | **0.783** | 0.723 |

The gain is concentrated in **column shapes**, the marginal distributions. On
pairwise structure the two are close, and on `news`, which is 59 columns wide,
SDV is marginally ahead.

## Where this implementation loses

Three findings, and they matter more than the headline.

**1. It sits closer to the training data.** Distance to closest record, as a
ratio against how close a fresh real holdout sits. Higher is a wider privacy
margin.

| Dataset | this CTGAN | SDV CTGAN |
|---|---|---|
| adult | 1.61 | **1.88** |
| news | 1.22 | **1.74** |
| insurance | 1.49 | **1.66** |

SDV is more conservative on all three, and by a wide margin on `news`. Both
stay above 1.0, so neither is copying rows outright, and near-duplicate shares
are under 0.3% for both. But the direction is consistent and it is the flip
side of the headline: fitting the marginals more tightly is what moves both
numbers, and it moves them in opposite directions. Anyone choosing on privacy
grounds should pick SDV.

**2. It produces less useful data on the one dataset where utility is
measurable.** Train on synthetic, test on real, as a fraction of real-on-real
AUC:

| Dataset | this CTGAN | SDV CTGAN |
|---|---|---|
| adult | 0.592 | **0.705** |

That is a large gap and it is the metric that matters most in practice. If you
are generating data so that someone can train a model on it, SDV's output is
meaningfully better here. `news` and `insurance` have no detectable binary
target, so the metric could not be computed and is not reported.

**3. It is not faster.** An early pilot at 5 epochs suggested a 2.2x speed
advantage. That did not survive a real run:

| Dataset | this CTGAN | SDV CTGAN |
|---|---|---|
| adult | **94.4s** | 135.6s |
| news | 137.4s | **121.0s** |
| insurance | 87.9s | **77.7s** |

Faster on one, slower on two. The pilot measured startup cost, not throughput.
Treat speed as a wash.

## What neither implementation does well

A random forest separates real from synthetic with 95-99% accuracy for both,
across all three datasets. Neither is producing data that passes for real under
a classifier that is looking. That is a property of CTGAN at this scale and
epoch count, not a defect in either implementation, and it is worth stating
plainly because "statistically identical" is a claim neither earns.

## Limitations

These change how the numbers should be read.

- **Subsampled to 3,000 rows.** Full-size training is hours per dataset per
  model on CPU. Subsampling makes every model's job easier and probably
  compresses the gap between them.
- **100 epochs**, below the 300 both implementations default to. Neither model
  is trained to convergence, and the ranking could change if they were.
- **One seed, no confidence intervals.** A difference under about 0.03 should
  be read as noise. The 0.055 on `insurance` and the 0.11 utility gap on
  `adult` are large enough to take seriously; the rest is suggestive at best.
- **Three datasets, all from SDV's demo set.** Chosen because they are the
  reference set for the implementation being compared against, which avoids
  cherry-picking, but they are not a broad sample of tabular data.
- Default hyperparameters for both, tuned for neither.

## Honest summary

This implementation matches marginal distributions better than the reference on
all three datasets, by the reference's own scorer. It gives up privacy margin
and downstream utility to do it, and it is not faster. That is a real trade
rather than a free win, and the direction of the trade is consistent enough
across three datasets to be believed.

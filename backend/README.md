# synthfin

A Conditional Tabular GAN written from the paper in PyTorch, with a
four-metric validation suite that scores the output rather than asserting
it is good.

Built for a specific problem: institutions holding data they cannot share,
in places where the public datasets everyone benchmarks on do not exist.

```bash
pip install synthfin
```

## Copy: learn from data you cannot share

```python
import pandas as pd
from synthfin import synthesize

real = pd.read_csv("loans.csv")
synth, report = synthesize(real, n_rows=5000)
synth.to_csv("loans_synthetic.csv", index=False)
```

Column types are detected, ID columns are dropped rather than modelled,
and the frame you get back has your own column order.

`report` holds four independent scores, because no single number answers
the question:

| Section | Question |
|---|---|
| `fidelity` | Do the one-dimensional distributions match? KS and chi-square, plus a fidelity score that does not collapse as `n` grows. |
| `correlation` | Does the dependence structure survive? |
| `utility` | Train on synthetic, test on real. Does a model learned from the synthetic data still work on the real thing? |
| `privacy` | How close is the nearest synthetic row to a real one? This is the memorisation check. |

When no target column is detectable, `utility` says it was skipped
instead of reporting a number it did not compute.

## Create: generate with no source data at all

Declare columns, distributions and rules:

```python
from synthfin import generate_from_criteria

df, report = generate_from_criteria({
    "n_rows": 1000,
    "columns": [
        {"name": "age", "type": "int", "dist": "normal",
         "mean": 34, "std": 9, "min": 18, "max": 70},
        {"name": "region", "type": "category",
         "values": ["urban", "rural"], "probs": [0.6, 0.4]},
    ],
    "rules": [{"target": "senior", "expr": "age >= 60"}],
})
```

Rule expressions go through a whitelist AST evaluator, never `eval`.
Attribute access, arbitrary calls, subscripting and lambdas are all
rejected, so a specification arriving over an API cannot execute code.

Seven domain presets ship with the package:

```python
from synthfin import list_presets, get_preset

[p["id"] for p in list_presets()]
spec = get_preset("microfinance")
```

## Dropping a level

`synthesize` is a thin wrapper. When the defaults stop fitting, call the
pieces:

```python
from synthfin import CTGAN, detect_schema, validate

schema = detect_schema(real)
model = CTGAN(epochs=300, batch_size=512, pac=8, seed=0)
model.fit(real, discrete_columns=schema["discrete"])

synth = model.sample(5000, seed=0)
report = validate(real, synth, target=schema["target"])
```

`CTGAN.sample` also takes `condition_column` and `condition_value_probs`,
which is how you generate a book at a default rate you choose rather than
the one the training data happened to have.

## What this is not

- **Not differentially private.** A GAN trained on real rows can memorise
  them. The privacy metric measures nearest-neighbour distance, which
  detects memorisation; it does not prevent it and carries no formal
  guarantee. Do not present output from this as anonymised under a
  regulation that means something specific by the word.
- **Benchmarked against SDV, with mixed results.** On SDV's own quality
  scorer it edges the reference implementation on all three public
  datasets tested (0.821/0.785/0.877 against 0.790/0.763/0.822). It gives
  up ground to do it: nearest-neighbour privacy margin is narrower on all
  three, downstream utility on `adult` is clearly worse (0.59 against
  0.71), and it is not faster. See [benchmarks/BENCHMARK.md](benchmarks/BENCHMARK.md)
  for the numbers, the losses and the limitations.
- **Not a drop-in for arithmetic identities.** CTGAN learns a joint
  distribution, so a derived column like `local = usd * fx` comes out
  strongly correlated but not exactly equal. Enforce hard identities
  after sampling.

## Requirements

Python 3.10+. Installs numpy, pandas, scikit-learn, scipy and torch.
CPU is fine; the defaults were tuned on one.

The numpy 2.x and scikit-learn 1.7.x pins are not incidental. A trained
checkpoint pickles numpy-2.x arrays and a scikit-learn 1.7
`BayesianGaussianMixture`, and older versions fail to load it.

## Licence

MIT. See [LICENSE](LICENSE). Every dataset in this repository is
synthetic.

Source: [github.com/Balisa50/nova](https://github.com/Balisa50/nova)

"""Benchmark this CTGAN against SDV's reference implementation.

WHY THIS EXISTS
An implementation of a paper is a learning exercise until someone can check it
against the reference. This script produces that number, including where this
implementation loses.

DESIGN
Both models see identical data, an identical split, identical hyperparameters
and an identical seed. The only difference is the implementation.

Scoring uses two independent judges:

  1. SDV's own sdmetrics quality report. This is the neutral referee. It is
     written by the authors of the implementation being compared against, so it
     cannot be accused of favouring this one.
  2. This project's four-metric suite, which measures things sdmetrics does not
     score the same way, in particular train-on-synthetic-test-on-real utility
     and nearest-neighbour privacy.

Both are reported. Where they disagree, that is a result too.

HONEST LIMITATIONS, stated because they change how the numbers should be read:

  * Datasets are subsampled to SUBSAMPLE rows. Full-size training on CPU is
    hours per dataset per model. Subsampling makes every model's job easier and
    compresses the gap between them.
  * EPOCHS is below the 300 both implementations default to, for the same
    reason. Neither model is trained to convergence.
  * One seed. No confidence intervals. A difference smaller than a few points
    should be read as noise, not as a ranking.

Run:  python -m benchmarks.sdv_comparison
"""

from __future__ import annotations

import json
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# Held identical between the two implementations.
DATASETS = ["adult", "news", "insurance"]
SUBSAMPLE = 3_000
EPOCHS = 100
BATCH_SIZE = 500
PAC = 10
SEED = 0

OUT = Path(__file__).resolve().parent / "results.json"


CACHE = Path(__file__).resolve().parent / ".data"


def load(name: str, attempts: int = 4):
    """Fetch a demo dataset, caching it so a re-run needs no network.

    The first run of this hit a read timeout part-way through downloading from
    S3 and lost the datasets it had already fetched. A benchmark that cannot be
    re-run without the network is not reproducible, so each dataset is written
    to .data on first fetch and read from there afterwards.
    """
    from sdv.datasets.demo import download_demo
    from sdv.metadata import Metadata

    CACHE.mkdir(exist_ok=True)
    csv_path = CACHE / f"{name}.csv"
    meta_path = CACHE / f"{name}.meta.json"

    if csv_path.exists() and meta_path.exists():
        data = pd.read_csv(csv_path)
        meta = Metadata.load_from_json(meta_path)
    else:
        last = None
        for attempt in range(attempts):
            try:
                data, meta = download_demo(modality="single_table", dataset_name=name)
                break
            except Exception as e:  # noqa: BLE001 - any transport failure is retryable
                last = e
                print(f"  download attempt {attempt + 1} failed: {str(e)[:90]}", flush=True)
                time.sleep(5 * (attempt + 1))
        else:
            raise RuntimeError(f"could not download {name} after {attempts} attempts: {last}")

        data.to_csv(csv_path, index=False)
        if meta_path.exists():
            meta_path.unlink()
        meta.save_to_json(meta_path)

    if len(data) > SUBSAMPLE:
        data = data.sample(SUBSAMPLE, random_state=SEED).reset_index(drop=True)
    return data, meta


def discrete_columns(df: pd.DataFrame) -> list[str]:
    """Categorical by dtype, plus low-cardinality integers.

    Both implementations are told the same thing, so the choice of threshold
    affects both equally.
    """
    out = []
    for col in df.columns:
        s = df[col]
        if s.dtype == object or pd.api.types.is_bool_dtype(s):
            out.append(col)
        elif pd.api.types.is_integer_dtype(s) and s.nunique(dropna=True) < 20:
            out.append(col)
    return out


def fit_nova(train: pd.DataFrame, disc: list[str], n: int):
    from synthfin.ctgan import CTGAN

    t0 = time.time()
    model = CTGAN(
        epochs=EPOCHS,
        batch_size=BATCH_SIZE,
        pac=PAC,
        early_stop=False,  # SDV has no early stopping; disabling it keeps the
        seed=SEED,         # comparison about the model rather than the schedule
        verbose=False,
    )
    model.fit(train, discrete_columns=disc)
    fit_s = time.time() - t0

    t0 = time.time()
    synth = model.sample(n, seed=SEED)
    return synth[train.columns.intersection(synth.columns)], fit_s, time.time() - t0


def fit_sdv(train: pd.DataFrame, meta, n: int):
    from sdv.single_table import CTGANSynthesizer

    t0 = time.time()
    model = CTGANSynthesizer(
        meta, epochs=EPOCHS, batch_size=BATCH_SIZE, pac=PAC, verbose=False
    )
    model.fit(train)
    fit_s = time.time() - t0

    t0 = time.time()
    synth = model.sample(n)
    return synth, fit_s, time.time() - t0


def sdmetrics_score(real: pd.DataFrame, synth: pd.DataFrame, meta) -> dict:
    """The neutral referee: SDV's own quality report."""
    from sdv.evaluation.single_table import evaluate_quality

    report = evaluate_quality(real, synth[real.columns], meta, verbose=False)
    props = report.get_properties()
    out = {"overall": float(report.get_score())}
    for _, row in props.iterrows():
        out[str(row["Property"])] = float(row["Score"])
    return out


def nova_score(real: pd.DataFrame, synth: pd.DataFrame, disc: list[str]) -> dict:
    """This project's four-metric suite."""
    from synthfin.api import validate

    cont = [c for c in real.columns if c not in disc]
    rep = validate(real, synth[real.columns], continuous=cont, discrete=disc, seed=SEED)

    def get(section: str, *path):
        node = rep.get(section)
        for k in path:
            if not isinstance(node, dict) or k not in node:
                return None
            node = node[k]
        return node

    return {
        # mean column-shape similarity, 1 is identical
        "fidelity": get("fidelity", "summary", "mean_similarity"),
        # mean absolute difference between correlation matrices, 0 is identical
        "correlation_l1": get("correlation", "l1_diff"),
        # train on synthetic, test on real, as a fraction of real-on-real AUC
        "utility_auc_ratio": get("utility", "auc_ratio"),
        # nearest-neighbour distance vs a real holdout, below 1 means the
        # synthetic rows sit closer to the training data than real rows do
        "privacy_dcr_ratio": get("privacy", "median_dcr_ratio"),
        "privacy_duplicate_share": get("privacy", "duplicate_share"),
        "detection_accuracy": get("detection", "attack_accuracy"),
    }


def run_one(name: str) -> dict:
    print(f"\n=== {name} ===", flush=True)
    data, meta = load(name)
    disc = discrete_columns(data)
    print(f"  {data.shape[0]} rows x {data.shape[1]} cols, {len(disc)} discrete", flush=True)

    rng = np.random.default_rng(SEED)
    idx = rng.permutation(len(data))
    cut = int(len(data) * 0.7)
    train = data.iloc[idx[:cut]].reset_index(drop=True)

    result: dict = {"dataset": name, "rows": int(len(data)), "cols": int(data.shape[1]),
                    "discrete": len(disc), "train_rows": int(len(train))}

    for label, fn in (("nova", lambda: fit_nova(train, disc, len(train))),
                      ("sdv", lambda: fit_sdv(train, meta, len(train)))):
        try:
            synth, fit_s, sample_s = fn()
            entry = {"fit_seconds": round(fit_s, 1), "sample_seconds": round(sample_s, 2)}
            try:
                entry["sdmetrics"] = sdmetrics_score(train, synth, meta)
            except Exception as e:
                entry["sdmetrics_error"] = str(e)[:200]
            try:
                entry["nova_metrics"] = nova_score(train, synth, disc)
            except Exception as e:
                entry["nova_metrics_error"] = str(e)[:200]
            result[label] = entry
            print(f"  {label:5} fit {fit_s:6.1f}s  "
                  f"sdmetrics {entry.get('sdmetrics', {}).get('overall', float('nan')):.4f}", flush=True)
        except Exception as e:
            result[label] = {"error": str(e)[:300]}
            print(f"  {label:5} FAILED: {str(e)[:150]}", flush=True)

    return result


def main() -> None:
    print(f"epochs={EPOCHS} subsample={SUBSAMPLE} batch={BATCH_SIZE} pac={PAC} seed={SEED}")

    config = {"epochs": EPOCHS, "subsample": SUBSAMPLE, "batch_size": BATCH_SIZE,
              "pac": PAC, "seed": SEED, "split": "70% train"}
    results: list[dict] = []

    # Written after every dataset rather than only at the end. The widest
    # dataset here is slow on CPU, and a run that dies on the third should not
    # throw away the first two.
    for name in DATASETS:
        results.append(run_one(name))
        OUT.write_text(
            json.dumps({"config": config, "results": results}, indent=2),
            encoding="utf-8",
        )
        print(f"  -> results.json holds {len(results)} of {len(DATASETS)}", flush=True)

    print("wrote " + str(OUT))


if __name__ == "__main__":
    main()

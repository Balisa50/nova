"""
Load the trained CTGAN, generate synthetic data, and run the full 4-metric
validation against the real ground-truth set.

Run (from backend/):  python -m scripts.validate
"""

from __future__ import annotations

import json
import os
import sys
import warnings

import pandas as pd
from sklearn.exceptions import ConvergenceWarning

warnings.filterwarnings("ignore", category=ConvergenceWarning)

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from synthfin.constraints import enforce_loan_constraints  # noqa: E402
from synthfin.ctgan import CTGAN              # noqa: E402
from synthfin.schema import detect_schema      # noqa: E402
from synthfin.validation import validate_all, print_report  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, "data", "west_african_loans.csv")
MODEL_PATH = os.path.join(ROOT, "models", "ctgan_final.pth")
REPORT_PATH = os.path.join(ROOT, "models", "validation_report.json")


def main() -> int:
    df = pd.read_csv(CSV, keep_default_na=False)
    schema = detect_schema(df)
    real = df.drop(columns=schema["id_columns"])

    model = CTGAN.load(MODEL_PATH)
    model.attach_sampler_from(real, schema["discrete"])

    # Recommended usage: generate matching the reference's target prevalence.
    # (Unconditioned generation slightly over-produces defaults; conditioning on
    # the empirical rate is the product's default behaviour and is what the API
    # does when default_rate is unset.)
    target = schema.get("target")
    cond_col, cond_probs = None, None
    if target and real[target].nunique() == 2:
        r = float(real[target].astype(float).mean())
        cond_col, cond_probs = target, {"1": r, "0": 1 - r}
    synth = model.sample(len(real), seed=2025,
                         condition_column=cond_col, condition_value_probs=cond_probs)
    synth = enforce_loan_constraints(synth)   # re-impose deterministic identities

    report = validate_all(real, synth, schema, seed=0)
    print_report(report)

    # Per-column fidelity, worst first -- shows which columns drag the score.
    per = report["statistical"]["per_column"]
    worst = sorted(per.items(), key=lambda kv: kv[1]["similarity"])[:8]
    print("\nLowest-fidelity columns (1.0 = identical):")
    for col, r in worst:
        print(f"  {col:<22} {r['test']:<5} sim={r['similarity']:.3f}")

    def _json_safe(o):
        import numpy as _np
        if isinstance(o, (_np.bool_,)):
            return bool(o)
        if isinstance(o, (_np.integer,)):
            return int(o)
        if isinstance(o, (_np.floating,)):
            return float(o)
        raise TypeError(type(o))

    with open(REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2, default=_json_safe)
    print(f"\nSaved report -> {REPORT_PATH}")
    return 0 if report["overall"]["all_pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

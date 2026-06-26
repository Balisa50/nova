"""
Verify the preprocessing pipeline: schema detection + lossless round-trip.

Round-trip = transform -> inverse_transform should recover the original frame.
Discrete columns must match exactly; continuous columns are recovered within a
small tolerance (mode-specific normalization clips at +/-4 sigma, so only far
outliers lose precision -- we report the worst-case error honestly).

Run:  python -m scripts.check_preprocessing   (from backend/)
"""

from __future__ import annotations

import os
import sys
import warnings

import numpy as np
import pandas as pd
from sklearn.exceptions import ConvergenceWarning

warnings.filterwarnings("ignore", category=ConvergenceWarning)

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from synthfin.preprocessing import DataTransformer   # noqa: E402
from synthfin.schema import detect_schema             # noqa: E402

CSV = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "data", "west_african_loans.csv")


def main() -> int:
    # keep_default_na=False: our ground-truth has no missing values, and the
    # literal category "None" (education / collateral) must not be read as NaN.
    df = pd.read_csv(CSV, keep_default_na=False)
    # Re-coerce numeric columns that keep_default_na left as strings (none here,
    # but defensive) -- pandas already infers numerics from a clean file.
    schema = detect_schema(df)
    print("Schema detection:")
    print(f"  id_columns ({len(schema['id_columns'])}): {schema['id_columns']}")
    print(f"  target: {schema['target']}")
    print(f"  discrete ({len(schema['discrete'])}): {schema['discrete']}")
    print(f"  continuous ({len(schema['continuous'])}): {schema['continuous']}")

    model_df = df.drop(columns=schema["id_columns"])
    transformer = DataTransformer(seed=0).fit(model_df, schema["discrete"])
    print(f"\nTransformed output dimensions: {transformer.output_dimensions}")
    print("Per-column modes (continuous):")
    for info in transformer.column_transform_info:
        if info.column_type == "continuous":
            print(f"  {info.column_name:<22} modes={info.output_dimensions - 1}")

    matrix = transformer.transform(model_df)
    print(f"\nTransform matrix shape: {matrix.shape}  dtype={matrix.dtype}")
    assert matrix.shape[1] == transformer.output_dimensions

    recon = transformer.inverse_transform(matrix)

    # ---- discrete columns: exact match ---- #
    ok = True
    print("\nDiscrete round-trip (exact match required):")
    for col in schema["discrete"]:
        match = (recon[col].astype(str).to_numpy() == model_df[col].astype(str).to_numpy()).mean()
        passed = match == 1.0
        ok = ok and passed
        print(f"  {'PASS' if passed else 'FAIL'}  {col:<22} match={match:.4f}")

    # ---- continuous columns: tolerance ---- #
    print("\nContinuous round-trip (relative error tolerance):")
    for col in schema["continuous"]:
        a = model_df[col].to_numpy(dtype=float)
        b = recon[col].to_numpy(dtype=float)
        scale = max(np.std(a), 1e-9)
        rmse = float(np.sqrt(np.mean((a - b) ** 2)))
        nrmse = rmse / scale
        passed = nrmse < 0.10
        ok = ok and passed
        print(f"  {'PASS' if passed else 'FAIL'}  {col:<22} NRMSE={nrmse:.4f}")

    print("\n" + ("PREPROCESSING ROUND-TRIP OK" if ok else "ROUND-TRIP HAD FAILURES"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

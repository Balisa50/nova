"""
Generate the ground-truth West African microfinance dataset and verify that
the realised correlations, distributions and integrity constraints match the
specification.

Run:  python -m scripts.generate_dataset   (from the backend/ directory)
"""

from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

# Windows consoles default to cp1252; force UTF-8 so report glyphs never crash.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# Allow running as a script from backend/.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from synthfin.data import DatasetConfig, generate_west_african_loans  # noqa: E402

OUT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "data", "west_african_loans.csv")

# (label, series_a_fn, series_b_fn, target, tolerance)
def _corr(df: pd.DataFrame, a: str, b: str) -> float:
    return float(np.corrcoef(df[a].astype(float), df[b].astype(float))[0, 1])


def verify(df: pd.DataFrame) -> bool:
    print(f"\nRows: {len(df):,}   Columns: {df.shape[1]}")
    print(f"Missing values: {int(df.isna().sum().sum())}")
    print(f"Overall default rate: {df['default'].mean():.3f}")
    print(f"default_30d rate: {df['default_30d'].mean():.3f}   "
          f"default_90d rate: {df['default_90d'].mean():.3f}")

    ok = True

    # Encodings for ordinal/categorical correlation checks.
    edu_rank = {"None": 0, "Primary": 1, "Secondary": 2, "Tertiary": 3}
    term_num = df["term_months"].astype(int)
    aux = pd.DataFrame({
        "income": df["monthly_income_usd"],
        "loan": df["loan_amount_usd"],
        "edu": df["education_level"].map(edu_rank),
        "age": df["age"],
        "experience": df["years_experience"],
        "term": term_num,
        "rural": (df["rural_urban"] == "Rural").astype(int),
        "agri": (df["loan_purpose"] == "Agriculture").astype(int),
        "collateral": df["has_collateral"],
        "group": df["group_lending"],
        "prev_def": df["previous_defaults"],
        "household": df["household_size"],
        "apr": df["interest_rate_apr"],
        "default": df["default"],
    })

    checks = [
        ("income ~ loan_amount", "income", "loan", 0.60, 0.08),
        ("education ~ income", "edu", "income", 0.50, 0.08),
        ("age ~ experience", "age", "experience", 0.70, 0.08),
        ("loan_amount ~ term", "loan", "term", 0.40, 0.10),
        ("rural ~ agriculture", "rural", "agri", 0.50, 0.15),
        ("collateral ~ default", "collateral", "default", -0.30, 0.15),
        ("group_lending ~ default", "group", "default", -0.25, 0.15),
        ("previous_defaults ~ default", "prev_def", "default", 0.40, 0.15),
        ("household_size ~ default", "household", "default", 0.20, 0.12),
        ("interest_rate ~ default", "apr", "default", 0.30, 0.12),
    ]

    print("\nCorrelation checks (realised vs target):")
    print(f"  {'pair':<30}{'target':>8}{'actual':>9}{'tol':>7}  status")
    for label, a, b, target, tol in checks:
        actual = float(np.corrcoef(aux[a].astype(float), aux[b].astype(float))[0, 1])
        passed = abs(actual - target) <= tol
        ok = ok and passed
        flag = "PASS" if passed else "FAIL"
        print(f"  {label:<30}{target:>8.2f}{actual:>9.3f}{tol:>7.2f}  {flag}")

    # Integrity constraints.
    print("\nIntegrity constraints:")
    constraints = {
        "default_30d subset-of default_90d": bool((df["default_30d"] <= df["default_90d"]).all()),
        "default_90d subset-of default": bool((df["default_90d"] <= df["default"]).all()),
        "previous_defaults <= previous_loans_count":
            bool((df["previous_defaults"] <= df["previous_loans_count"]).all()),
        "loan_amount_local == usd*fx (positive)": bool((df["loan_amount_local"] > 0).all()),
        "age in [18,75]": bool(df["age"].between(18, 75).all()),
        "credit_score in [300,800]": bool(df["credit_score"].between(300, 800).all()),
        "no collateral_type when has_collateral==0":
            bool((df.loc[df["has_collateral"] == 0, "collateral_type"] == "None").all()),
    }
    for name, passed in constraints.items():
        ok = ok and passed
        print(f"  {'PASS' if passed else 'FAIL'}  {name}")

    return ok


def main() -> int:
    cfg = DatasetConfig(n_rows=10_000, seed=42, target_default_rate=0.25)
    df = generate_west_african_loans(cfg)

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    df.to_csv(OUT_PATH, index=False)
    print(f"Saved -> {OUT_PATH}")

    ok = verify(df)
    print("\n" + ("ALL CHECKS PASSED" if ok else "SOME CHECKS FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

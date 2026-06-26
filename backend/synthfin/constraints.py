"""
Domain-constraint enforcement for generated data.

A GAN learns a joint *distribution*; it does not enforce exact deterministic
identities between columns. When the schema contains a column that is, by
construction, a deterministic function of another (here: the daily interest
rate is just the APR divided by 36,500), the right thing to do is reconstruct
it after generation rather than ask the network to memorise an identity it can
only approximate. This mirrors SDV's "Constraint" mechanism.

Constraints are dataset-specific and applied at the edge (service / validation),
so the core CTGAN stays domain-agnostic.
"""

from __future__ import annotations

import pandas as pd


def enforce_loan_constraints(df: pd.DataFrame) -> pd.DataFrame:
    """Re-impose known deterministic relationships on West African loan data."""
    out = df.copy()
    # Daily rate is exactly APR / 100 / 365 -- recompute it from generated APR.
    if "interest_rate_apr" in out.columns and "interest_rate_daily" in out.columns:
        out["interest_rate_daily"] = (out["interest_rate_apr"] / 100.0 / 365.0).round(6)
    return out

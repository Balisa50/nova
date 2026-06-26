"""
Automatic schema detection for arbitrary tabular CSVs.

Splits columns into discrete (categorical), continuous, identifier (dropped),
and target. Rules deliberately match the project spec:

  * id columns  : object/string with near-unique values, or a name ending in
                  'id'/'uuid' that is mostly unique -> dropped from modelling.
  * discrete    : object / bool / category, OR integer with < `cat_threshold`
                  unique values.
  * continuous  : everything else numeric.
  * target      : first column whose name matches a known target keyword
                  (default/target/label/churn/fraud/...). Always discrete.
"""

from __future__ import annotations

from typing import Optional

import pandas as pd

TARGET_KEYWORDS = ("default", "target", "label", "churn", "fraud", "is_default", "y")
ID_SUFFIXES = ("id", "uuid", "guid", "_id", "uid")


def _looks_like_id(name: str, series: pd.Series) -> bool:
    n = len(series)
    if n == 0:
        return False
    uniqueness = series.nunique(dropna=True) / n
    name_l = name.lower()
    name_hit = name_l.endswith(ID_SUFFIXES) or name_l in ("id", "uuid", "guid")
    if name_hit and uniqueness > 0.5:
        return True
    # Pure free-text near-unique object columns are unmodellable identifiers.
    if series.dtype == object and uniqueness > 0.9:
        return True
    return False


def detect_schema(df: pd.DataFrame, cat_threshold: int = 20) -> dict:
    # cat_threshold=20: integer columns with fewer than this many distinct values
    # are treated as categorical. CTGAN models low/moderate-cardinality counts
    # (household size, previous-loan counts) far better as one-hot than via a
    # Gaussian mixture, so the threshold is deliberately generous.
    """Return {'discrete', 'continuous', 'id_columns', 'target'} for a DataFrame."""
    id_columns, discrete, continuous = [], [], []
    target: Optional[str] = None

    # Pick the target first (so it is forced discrete even if numeric-binary).
    # Match exact names or a `_keyword` suffix -- NOT a bare suffix, otherwise a
    # short keyword like "y" would swallow any column ending in that letter
    # (e.g. "repayment_frequenc-y").
    for col in df.columns:
        cl = col.lower()
        matched = cl in TARGET_KEYWORDS or any(cl.endswith("_" + k) for k in TARGET_KEYWORDS)
        if matched and df[col].nunique(dropna=True) <= max(cat_threshold, 20):
            target = col
            break

    for col in df.columns:
        s = df[col]
        if _looks_like_id(col, s):
            id_columns.append(col)
            continue
        if col == target:
            discrete.append(col)
            continue
        if s.dtype == object or pd.api.types.is_bool_dtype(s) or isinstance(s.dtype, pd.CategoricalDtype):
            discrete.append(col)
        elif pd.api.types.is_integer_dtype(s) and s.nunique(dropna=True) < cat_threshold:
            discrete.append(col)
        else:
            continuous.append(col)

    return {
        "discrete": discrete,
        "continuous": continuous,
        "id_columns": id_columns,
        "target": target,
    }

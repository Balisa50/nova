"""
Preprocessing for CTGAN: mode-specific normalization + one-hot encoding.

This implements the data transform from Xu et al. (2019), "Modeling Tabular
Data using Conditional GAN" (NeurIPS), Section 4.2:

  * Continuous columns are normalised *per mode*. A variational Gaussian
    mixture (Bayesian GMM) is fit per column; each value is represented by
      (1) a scalar alpha = (x - mode_mean) / (4 * mode_std), clipped to [-1, 1]
      (2) a one-hot vector beta indicating which mode produced it.
    This lets a tanh-activated generator output multimodal columns it could
    never reach with a single Gaussian assumption.

  * Discrete columns become one-hot vectors.

The transformed matrix is the concatenation of all per-column blocks. All
information required to invert the transform (mixture means/stds, valid mode
indices, category lists, original dtypes, column order) is stored as metadata,
so preprocess -> generate -> postprocess round-trips back to the original
schema. The transformer works on *any* CSV, not just the ground-truth set.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

import numpy as np
import pandas as pd
from sklearn.mixture import BayesianGaussianMixture


# --------------------------------------------------------------------------- #
# Layout metadata
# --------------------------------------------------------------------------- #
@dataclass
class SpanInfo:
    """One activation span inside a column's output block."""
    dim: int
    activation: str  # 'tanh' or 'softmax'


@dataclass
class ColumnTransformInfo:
    column_name: str
    column_type: str               # 'continuous' or 'discrete'
    output_dimensions: int
    output_info: List[SpanInfo]
    # continuous:
    gmm: object = None
    valid_modes: np.ndarray = None  # bool mask over GMM components
    means: np.ndarray = None
    stds: np.ndarray = None
    median: float = 0.0             # imputation value for NaN
    col_min: float = 0.0            # observed range, for output clamping
    col_max: float = 0.0
    # discrete:
    categories: list = field(default_factory=list)
    has_nan: bool = False           # NaN carried as its own category
    # reconstruction:
    original_dtype: object = None


NA_SENTINEL = "__nan__"


class DataTransformer:
    """Fit/transform/inverse-transform tabular data for CTGAN."""

    def __init__(self, max_modes: int = 10, weight_threshold: float = 2e-2,
                 normalize_factor: float = 4.0, seed: int = 0):
        self.max_modes = max_modes
        self.weight_threshold = weight_threshold
        self.normalize_factor = normalize_factor
        self.rng = np.random.default_rng(seed)
        self._seed = seed

        self.columns: List[str] = []
        self.discrete_columns: List[str] = []
        self.column_transform_info: List[ColumnTransformInfo] = []
        self.output_dimensions: int = 0

    # ----------------------------- fit --------------------------------- #
    def fit(self, df: pd.DataFrame, discrete_columns: List[str]) -> "DataTransformer":
        self.columns = list(df.columns)
        self.discrete_columns = list(discrete_columns)
        self.column_transform_info = []
        self.output_dimensions = 0

        for col in self.columns:
            if col in discrete_columns:
                info = self._fit_discrete(col, df[col])
            else:
                info = self._fit_continuous(col, df[col])
            self.column_transform_info.append(info)
            self.output_dimensions += info.output_dimensions
        return self

    def _fit_continuous(self, name: str, series: pd.Series) -> ColumnTransformInfo:
        median = float(series.median()) if series.notna().any() else 0.0
        x = series.fillna(median).to_numpy(dtype=float).reshape(-1, 1)
        gmm = BayesianGaussianMixture(
            n_components=min(self.max_modes, len(np.unique(x))),
            weight_concentration_prior_type="dirichlet_process",
            weight_concentration_prior=1e-3,
            max_iter=200,
            n_init=1,
            random_state=self._seed,
        )
        gmm.fit(x)
        valid = gmm.weights_ > self.weight_threshold
        if valid.sum() == 0:                      # degenerate safety net
            valid[np.argmax(gmm.weights_)] = True
        means = gmm.means_.reshape(-1)[valid]
        stds = np.sqrt(gmm.covariances_.reshape(-1))[valid]
        stds = np.clip(stds, 1e-6, None)
        num_modes = int(valid.sum())
        return ColumnTransformInfo(
            column_name=name,
            column_type="continuous",
            output_dimensions=1 + num_modes,
            output_info=[SpanInfo(1, "tanh"), SpanInfo(num_modes, "softmax")],
            gmm=gmm, valid_modes=valid, means=means, stds=stds, median=median,
            col_min=float(np.nanmin(x)), col_max=float(np.nanmax(x)),
            original_dtype=series.dtype,
        )

    def _fit_discrete(self, name: str, series: pd.Series) -> ColumnTransformInfo:
        categories = sorted(series.dropna().unique().tolist(), key=lambda v: str(v))
        has_nan = bool(series.isna().any())
        if has_nan:                       # carry missingness as a real category
            categories = categories + [NA_SENTINEL]
        n = len(categories)
        return ColumnTransformInfo(
            column_name=name,
            column_type="discrete",
            output_dimensions=n,
            output_info=[SpanInfo(n, "softmax")],
            categories=categories,
            has_nan=has_nan,
            original_dtype=series.dtype,
        )

    # --------------------------- transform ------------------------------ #
    def transform(self, df: pd.DataFrame) -> np.ndarray:
        blocks = []
        for info in self.column_transform_info:
            if info.column_type == "continuous":
                blocks.append(self._transform_continuous(info, df[info.column_name]))
            else:
                blocks.append(self._transform_discrete(info, df[info.column_name]))
        return np.concatenate(blocks, axis=1).astype("float32")

    def _transform_continuous(self, info: ColumnTransformInfo, series: pd.Series) -> np.ndarray:
        x = series.fillna(info.median).to_numpy(dtype=float).reshape(-1, 1)
        n = x.shape[0]
        means = info.means.reshape(1, -1)
        stds = info.stds.reshape(1, -1)

        # Normalised value of x under each valid mode.
        normalized = (x - means) / (self.normalize_factor * stds)

        # Probability of each valid mode, then sample one mode per row.
        # Vectorised inverse-CDF sampling (robust to float sum!=1, fast on 10k+).
        probs = info.gmm.predict_proba(x)[:, info.valid_modes]
        probs = probs / np.clip(probs.sum(axis=1, keepdims=True), 1e-12, None)
        cdf = np.cumsum(probs, axis=1)
        cdf[:, -1] = 1.0
        u = self.rng.random(n)[:, None]
        chosen = (u > cdf).sum(axis=1)
        chosen = np.clip(chosen, 0, probs.shape[1] - 1)

        alpha = normalized[np.arange(n), chosen].reshape(-1, 1)
        alpha = np.clip(alpha, -1.0, 1.0)
        beta = np.eye(probs.shape[1], dtype=float)[chosen]
        return np.concatenate([alpha, beta], axis=1)

    def _transform_discrete(self, info: ColumnTransformInfo, series: pd.Series) -> np.ndarray:
        idx = {c: i for i, c in enumerate(info.categories)}
        s = series
        if info.has_nan:
            s = s.where(s.notna(), NA_SENTINEL)
        # Unseen categories fall back to the first slot (rare; keeps shape valid).
        codes = s.map(idx).fillna(0).astype(int).to_numpy()
        return np.eye(len(info.categories), dtype=float)[codes]

    # ------------------------ inverse transform ------------------------- #
    def inverse_transform(self, data: np.ndarray) -> pd.DataFrame:
        out = {}
        col_start = 0
        for info in self.column_transform_info:
            block = data[:, col_start: col_start + info.output_dimensions]
            col_start += info.output_dimensions
            if info.column_type == "continuous":
                out[info.column_name] = self._inverse_continuous(info, block)
            else:
                out[info.column_name] = self._inverse_discrete(info, block)
        df = pd.DataFrame(out, columns=self.columns)
        return self._restore_dtypes(df)

    def _inverse_continuous(self, info: ColumnTransformInfo, block: np.ndarray) -> np.ndarray:
        alpha = np.clip(block[:, 0], -1.0, 1.0)
        mode = np.argmax(block[:, 1:], axis=1)
        mean = info.means[mode]
        std = info.stds[mode]
        value = alpha * self.normalize_factor * std + mean
        # Clamp to the observed range so the generator can never emit an
        # impossible value (e.g. negative loan amount, age below 18).
        return np.clip(value, info.col_min, info.col_max)

    def _inverse_discrete(self, info: ColumnTransformInfo, block: np.ndarray) -> np.ndarray:
        idx = np.argmax(block, axis=1)
        cats = np.array(info.categories, dtype=object)
        values = cats[idx]
        if info.has_nan:
            values = np.where(values == NA_SENTINEL, np.nan, values)
        return values

    def _restore_dtypes(self, df: pd.DataFrame) -> pd.DataFrame:
        for info in self.column_transform_info:
            dt = info.original_dtype
            col = df[info.column_name]
            has_missing = col.isna().any()
            if pd.api.types.is_integer_dtype(dt) and not has_missing:
                df[info.column_name] = np.round(col.astype(float)).astype("int64")
            elif pd.api.types.is_float_dtype(dt):
                df[info.column_name] = col.astype(float)
            elif not has_missing:
                df[info.column_name] = col.astype(dt)
        return df

    # --------------------- helpers for the CTGAN ------------------------ #
    @property
    def discrete_column_spans(self):
        """[(start, length)] of each discrete one-hot block in the output matrix.

        Used by the conditional sampler to build cond vectors and pick masked
        columns during training-by-sampling.
        """
        spans = []
        start = 0
        for info in self.column_transform_info:
            if info.column_type == "discrete":
                spans.append((start, info.output_dimensions))
            start += info.output_dimensions
        return spans

"""
Service layer: loads the trained CTGAN once and turns an uploaded (or bundled)
real dataset into synthetic data + a validation report.

Generation uses the pre-trained model (so requests finish in seconds). The
uploaded CSV is the *real reference*: it re-anchors the conditional sampler to
the user's category frequencies and is what we validate the synthetic data
against. The uploaded schema must match the model's trained columns; novel
schemas can be trained offline with scripts/train.py.
"""

from __future__ import annotations

import os
import time

import pandas as pd

from synthfin.constraints import enforce_loan_constraints
from synthfin.ctgan import CTGAN
from synthfin.schema import detect_schema
from synthfin.validation import validate_all

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_MODEL = os.environ.get("MODEL_PATH", os.path.join(ROOT, "models", "ctgan_final.pth"))
DEFAULT_CSV = os.environ.get("REFERENCE_CSV", os.path.join(ROOT, "data", "west_african_loans.csv"))
MAX_ROWS = int(os.environ.get("MAX_ROWS", "20000"))


class SynthFinService:
    def __init__(self, model_path: str = DEFAULT_MODEL, csv_path: str = DEFAULT_CSV):
        self.model_path = model_path
        self.csv_path = csv_path
        self.model: CTGAN | None = None
        self.reference: pd.DataFrame | None = None
        self.schema: dict | None = None
        self.model_columns: list | None = None
        self._load()

    def _load(self):
        if os.path.exists(self.csv_path):
            self.reference = pd.read_csv(self.csv_path, keep_default_na=False)
            self.schema = detect_schema(self.reference)
        if os.path.exists(self.model_path):
            self.model = CTGAN.load(self.model_path)
            self.model_columns = list(self.model.transformer.columns)
            if self.reference is not None:
                ref = self.reference.drop(columns=self.schema["id_columns"], errors="ignore")
                self.model.attach_sampler_from(ref, self.schema["discrete"])

    # ------------------------------------------------------------------ #
    @property
    def model_loaded(self) -> bool:
        return self.model is not None

    def health(self) -> dict:
        return {"status": "healthy" if self.model_loaded else "degraded",
                "model_loaded": self.model_loaded}

    def status(self) -> dict:
        info = {"model_loaded": self.model_loaded,
                "reference_dataset": os.path.basename(self.csv_path),
                "max_rows": MAX_ROWS}
        if self.model_loaded:
            hist = self.model.loss_history
            info.update({
                "trained_epochs": hist[-1]["epoch"] if hist else None,
                "best_ks": min((h["ks_mean"] for h in hist if "ks_mean" in h), default=None),
                "n_columns": len(self.model_columns),
                "columns": self.model_columns,
                "discrete_columns": self.schema["discrete"] if self.schema else [],
                "target": self.schema["target"] if self.schema else None,
                "device": str(self.model.device),
            })
        return info

    # ------------------------------------------------------------------ #
    def generate(self, real_df: pd.DataFrame | None, num_rows: int,
                 default_rate: float | None = None, seed: int = 2025) -> dict:
        if not self.model_loaded:
            raise RuntimeError("No trained model is loaded on the server.")
        num_rows = max(1, min(int(num_rows), MAX_ROWS))

        # Resolve the real reference frame and its schema.
        if real_df is None:
            real = self.reference.drop(columns=self.schema["id_columns"], errors="ignore")
            schema = {k: v for k, v in self.schema.items()}
            schema = detect_schema(real)
        else:
            schema = detect_schema(real_df)
            real = real_df.drop(columns=schema["id_columns"], errors="ignore")
            self._check_compatible(real)
            self.model.attach_sampler_from(real, schema["discrete"])

        # Condition on the binary target at the requested default rate, or the
        # reference's empirical rate when none is given (this is what keeps
        # downstream utility high -- see validation).
        cond_col, cond_probs = None, None
        target = schema.get("target")
        if target and real[target].nunique() == 2:
            r = (float(min(max(default_rate, 0.0), 1.0)) if default_rate is not None
                 else float(real[target].astype(float).mean()))
            cond_col, cond_probs = target, {"1": r, "0": 1 - r, 1: r, 0: 1 - r}

        t0 = time.time()
        synth = self.model.sample(num_rows, seed=seed,
                                  condition_column=cond_col,
                                  condition_value_probs=cond_probs)
        synth = enforce_loan_constraints(synth)   # re-impose deterministic identities
        gen_time = time.time() - t0

        report = validate_all(real, synth, schema, seed=0)

        target_rate = (float(synth[target].astype(float).mean())
                       if target and target in synth else None)
        real_rate = (float(real[target].astype(float).mean())
                     if target and target in real else None)

        return {
            "num_rows": int(num_rows),
            "generation_seconds": round(gen_time, 2),
            "columns": list(synth.columns),
            "preview": synth.head(10).to_dict(orient="records"),
            "target_column": target,
            "synthetic_default_rate": target_rate,
            "real_default_rate": real_rate,
            "validation": report,
            "csv": synth.to_csv(index=False),
        }

    def _check_compatible(self, df: pd.DataFrame):
        expected = set(self.model_columns)
        got = set(df.columns)
        missing = expected - got
        if missing:
            raise ValueError(
                "Uploaded CSV is missing columns the model was trained on: "
                f"{sorted(missing)}. The hosted demo serves the West African "
                "microfinance schema; train a model on a new schema with "
                "scripts/train.py."
            )

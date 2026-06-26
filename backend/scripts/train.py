"""
Train the CTGAN on the ground-truth West African loans dataset and save a
checkpoint to models/ctgan_final.pth.

Run (from backend/):
    python -m scripts.train --epochs 300
    python -m scripts.train --epochs 3 --smoke      # quick end-to-end check
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
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

from synthfin.ctgan import CTGAN          # noqa: E402
from synthfin.schema import detect_schema  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, "data", "west_african_loans.csv")
MODEL_PATH = os.path.join(ROOT, "models", "ctgan_final.pth")
LOSS_PATH = os.path.join(ROOT, "models", "loss_history.json")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=300)
    ap.add_argument("--batch-size", type=int, default=512)
    ap.add_argument("--disc-steps", type=int, default=3,
                    help="critic updates per generator update (WGAN-GP n_critic)")
    ap.add_argument("--smoke", action="store_true",
                    help="tiny run to validate the pipeline end-to-end")
    args = ap.parse_args()

    df = pd.read_csv(CSV, keep_default_na=False)
    schema = detect_schema(df)
    model_df = df.drop(columns=schema["id_columns"])
    discrete = schema["discrete"]
    print(f"Rows={len(model_df)}  discrete={len(discrete)}  "
          f"continuous={len(schema['continuous'])}  target={schema['target']}")

    epochs = 3 if args.smoke else args.epochs
    model = CTGAN(epochs=epochs, batch_size=args.batch_size,
                  discriminator_steps=args.disc_steps, verbose=True)
    print(f"Device: {model.device}  | training {epochs} epochs "
          f"| n_critic={args.disc_steps} ...")

    t0 = time.time()
    model.fit(model_df, discrete)
    dt = time.time() - t0
    print(f"Training finished in {dt:.1f}s ({dt / epochs:.2f}s/epoch)")

    # Sanity sample.
    synth = model.sample(min(2000, len(model_df)), seed=123)
    print(f"\nSample shape: {synth.shape}")
    print(f"Synthetic default rate: {synth['default'].mean():.3f} "
          f"(real {model_df['default'].mean():.3f})")
    print(synth.head(3).to_string())

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    model.save(MODEL_PATH)
    with open(LOSS_PATH, "w") as f:
        json.dump(model.loss_history, f, indent=2)
    print(f"\nSaved model -> {MODEL_PATH}")
    print(f"Saved loss  -> {LOSS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

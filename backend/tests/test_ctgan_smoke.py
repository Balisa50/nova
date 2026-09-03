"""Smoke tests for the CTGAN implementation.

These are deliberately small and fast. They do not check sample quality, only
that the model trains, samples the requested shape, and respects the schema it
was fitted on. Quality is measured separately by the four-metric validation
suite in synthfin.validation.
"""

import numpy as np
import pandas as pd
import pytest

from synthfin.ctgan import CTGAN


@pytest.fixture(scope="module")
def frame():
    rng = np.random.default_rng(0)
    n = 256
    return pd.DataFrame(
        {
            "amount": rng.lognormal(mean=8.0, sigma=0.6, size=n),
            "term_months": rng.integers(3, 36, size=n).astype(float),
            "region": rng.choice(["urban", "peri_urban", "rural"], size=n),
            "defaulted": rng.choice(["yes", "no"], size=n, p=[0.2, 0.8]),
        }
    )


@pytest.fixture(scope="module")
def fitted(frame):
    model = CTGAN(
        latent_dim=16,
        batch_size=32,
        pac=2,
        epochs=2,
        early_stop=False,
        max_modes=3,
        seed=0,
        verbose=False,
    )
    model.fit(frame, discrete_columns=["region", "defaulted"])
    return model


def test_batch_size_must_divide_pac():
    with pytest.raises(ValueError):
        CTGAN(batch_size=10, pac=4)


def test_fit_records_loss_history(fitted):
    assert len(fitted.loss_history) > 0


def test_sample_returns_requested_row_count(fitted, frame):
    out = fitted.sample(64)
    assert len(out) == 64
    assert list(out.columns) == list(frame.columns)


def test_sample_respects_categorical_domain(fitted, frame):
    out = fitted.sample(128)
    for col in ("region", "defaulted"):
        assert set(out[col].unique()) <= set(frame[col].unique())


def test_sample_is_deterministic_under_a_seed(fitted):
    a = fitted.sample(32, seed=7)
    b = fitted.sample(32, seed=7)
    pd.testing.assert_frame_equal(a, b)

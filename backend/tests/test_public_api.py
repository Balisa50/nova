"""Tests for the packaged public surface.

These guard the promises the README makes to someone who has just run
`pip install`. They are deliberately about contract, not quality: that the
documented import works, that the frame handed back is shaped like the one
handed in, and that the report has the four sections it claims.
"""

import numpy as np
import pandas as pd
import pytest
import synthfin
from synthfin import detect_schema, get_preset, list_presets, synthesize, validate


@pytest.fixture(scope="module")
def loans():
    rng = np.random.default_rng(0)
    n = 400
    return pd.DataFrame(
        {
            "customer_id": [f"C{i:05d}" for i in range(n)],
            "age": rng.integers(19, 68, n),
            "loan_amount_usd": rng.lognormal(6.4, 0.55, n).round(2),
            "term_months": rng.choice([6, 12, 24, 36], n),
            "region": rng.choice(["urban", "peri_urban", "rural"], n),
            "defaulted": rng.choice(["no", "yes"], n, p=[0.8, 0.2]),
        }
    )


@pytest.fixture(scope="module")
def run(loans):
    return synthesize(loans, n_rows=200, epochs=8, seed=0)


def test_everything_in_dunder_all_is_importable():
    for name in synthfin.__all__:
        assert hasattr(synthfin, name), name


def test_version_is_exposed():
    assert synthfin.__version__.count(".") == 2


def test_synthesize_returns_the_requested_row_count(run):
    synth, _ = run
    assert len(synth) == 200


def test_output_keeps_the_input_column_order(run, loans):
    synth, _ = run
    assert list(synth.columns) == [c for c in loans.columns if c != "customer_id"]


def test_id_columns_are_not_modelled(run):
    # A synthetic customer id learned from real ids looks meaningful and
    # carries nothing, and it flatters the privacy score.
    synth, _ = run
    assert "customer_id" not in synth.columns


def test_categories_stay_inside_the_fitted_domain(run, loans):
    synth, _ = run
    for col in ("region", "defaulted"):
        assert set(synth[col].unique()) <= set(loans[col].unique())


def test_report_has_all_four_sections(run):
    _, report = run
    assert set(report) == {"fidelity", "correlation", "utility", "privacy"}


def test_utility_is_scored_when_a_target_is_detectable(run):
    # `defaulted` is the obvious target name in credit risk. It used to miss,
    # because matching is exact-name or "_keyword" suffix and the keyword list
    # only had "default", so utility skipped without saying why.
    _, report = run
    assert "skipped" not in report["utility"]
    assert "auc_ratio" in report["utility"]


def test_utility_says_so_rather_than_faking_a_score(loans):
    no_target = loans.drop(columns=["defaulted"])
    synth, report = synthesize(no_target, n_rows=100, epochs=4, seed=0)
    assert "skipped" in report["utility"]


def test_score_false_skips_validation(loans):
    _, report = synthesize(loans, n_rows=100, epochs=4, seed=0, score=False)
    assert report == {}


def test_detect_schema_finds_the_inflected_target(loans):
    assert detect_schema(loans)["target"] == "defaulted"


def test_detect_schema_does_not_swallow_lookalike_columns():
    # The "_keyword" suffix rule exists so a short keyword like "y" cannot
    # match any column ending in that letter.
    df = pd.DataFrame({"repayment_frequency": ["m"] * 10, "amount": range(10)})
    assert detect_schema(df)["target"] is None


def test_validate_can_be_called_on_its_own(loans, run):
    synth, _ = run
    report = validate(loans[synth.columns], synth)
    assert set(report) == {"fidelity", "correlation", "utility", "privacy"}


def test_presets_are_package_data_not_a_sibling_directory():
    # They used to live at backend/presets, resolved via a path built from
    # __file__. That works from a checkout and returns nothing at all from an
    # installed wheel, so `pip install synthfin` shipped zero presets while the
    # README promised seven. importlib.resources is why this now holds either
    # way; the count is why it stays true.
    presets = list_presets()
    assert len(presets) == 7
    assert {p["id"] for p in presets} == {
        "corporate", "insurance", "investment", "loans",
        "macro", "remittances", "transactions",
    }


def test_every_listed_preset_can_actually_be_fetched():
    for summary in list_presets():
        spec = get_preset(summary["id"])
        assert spec is not None, summary["id"]
        assert spec["columns"], summary["id"]


def test_get_preset_returns_none_for_an_unknown_id():
    assert get_preset("no-such-preset") is None

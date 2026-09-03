"""The two functions most people want, over the parts underneath.

Nothing here is load-bearing. `synthesize` is detect_schema, then CTGAN,
then `validate`; `validate` is the four metric functions called with the
column lists. Both exist so that using the model does not require reading
the package first, and both return the same objects the pieces do, so you
can drop to those pieces whenever the defaults stop fitting.
"""

from __future__ import annotations

import pandas as pd

from synthfin.ctgan import CTGAN
from synthfin.schema import detect_schema
from synthfin.validation import (
    run_dcr_privacy,
    run_privacy_assessment,
    run_statistical_tests,
    run_tstr_validation,
    test_correlation_preservation,
)


def validate(
    real: pd.DataFrame,
    synth: pd.DataFrame,
    *,
    continuous: list[str] | None = None,
    discrete: list[str] | None = None,
    target: str | None = None,
    seed: int = 0,
) -> dict:
    """Score synthetic data against the real data it was learned from.

    Four independent questions, because no single number answers them all:

      fidelity     do the one-dimensional distributions match (KS,
                   chi-square, plus an n-independent fidelity score)
      correlation  does the dependence structure survive
      utility      train on synthetic, test on real: does a model learned
                   from the synthetic data still work on the real thing
      privacy      distance to the closest real record, against how close a
                   fresh real holdout sits. This is the memorisation check
      detection    whether a classifier can tell real from synthetic. Reported
                   separately because it measures distinguishability, which is
                   fidelity rather than privacy: a model that scores well here
                   may still have copied rows

    Column lists are inferred with `detect_schema` when omitted. `target`
    likewise, and the utility section is skipped when there is no target
    to predict, rather than being faked.
    """
    if continuous is None or discrete is None or target is None:
        schema = detect_schema(real)
        continuous = continuous if continuous is not None else schema["continuous"]
        discrete = discrete if discrete is not None else schema["discrete"]
        target = target if target is not None else schema.get("target")

    report: dict = {
        "fidelity": run_statistical_tests(
            real, synth, continuous, discrete, seed=seed
        ),
        "correlation": test_correlation_preservation(
            real, synth, continuous, discrete
        ),
        # Distance to closest record. The detection classifier below answers a
        # different question and was previously reported in this slot, which
        # overstated the privacy result: being hard to distinguish from real
        # data is not evidence that no real row was memorised.
        "privacy": run_dcr_privacy(real, synth, continuous, discrete, seed=seed),
        "detection": run_privacy_assessment(
            real, synth, continuous, discrete, seed=seed
        ),
    }

    if target is not None and target in real.columns and target in synth.columns:
        report["utility"] = run_tstr_validation(
            real, synth, target, continuous, discrete, seed=seed
        )
    else:
        report["utility"] = {
            "skipped": "no target column detected, so there is nothing to "
                       "train and test. Pass target= to score utility."
        }

    return report


def synthesize(
    real: pd.DataFrame,
    n_rows: int | None = None,
    *,
    epochs: int = 300,
    seed: int = 0,
    discrete_columns: list[str] | None = None,
    continuous_columns: list[str] | None = None,
    target: str | None = None,
    score: bool = True,
    verbose: bool = False,
    **ctgan_kwargs,
) -> tuple[pd.DataFrame, dict]:
    """Learn `real` and return synthetic rows plus a validation report.

        synth, report = synthesize(real_df, n_rows=5000)

    `n_rows` defaults to the size of the input. Column types are detected
    unless you pass them. Any other keyword goes to `CTGAN`, so
    `batch_size`, `pac`, `latent_dim` and the early-stopping controls are
    all reachable without importing it.

    Set `score=False` to skip validation, which is most of the wall time
    on a small run.

    Returns `(synthetic_frame, report)`. The report is `{}` when
    `score=False`.
    """
    if discrete_columns is None or continuous_columns is None or target is None:
        schema = detect_schema(real)
        discrete_columns = (
            discrete_columns if discrete_columns is not None else schema["discrete"]
        )
        continuous_columns = (
            continuous_columns if continuous_columns is not None else schema["continuous"]
        )
        target = target if target is not None else schema.get("target")

    # ID columns are neither modelled nor emitted. A synthetic customer id
    # learned from real ids is worse than useless: it looks meaningful and
    # carries nothing, and it inflates the privacy score.
    modelled = list(discrete_columns) + list(continuous_columns)
    fit_frame = real[modelled]

    model = CTGAN(epochs=epochs, seed=seed, verbose=verbose, **ctgan_kwargs)
    model.fit(fit_frame, discrete_columns=discrete_columns,
              continuous_columns=continuous_columns)

    synth = model.sample(n_rows if n_rows is not None else len(real), seed=seed)

    # CTGAN emits discrete columns before continuous ones. Hand back the
    # caller's own column order instead, minus whatever was not modelled, so a
    # synthetic frame drops into the same code the real one came out of.
    synth = synth[[c for c in real.columns if c in synth.columns]]

    report = (
        validate(fit_frame, synth, continuous=continuous_columns,
                 discrete=discrete_columns, target=target, seed=seed)
        if score
        else {}
    )
    return synth, report

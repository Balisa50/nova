"""NOVA: synthetic tabular data, from a model you can read.

A Conditional Tabular GAN implemented from the paper in PyTorch, with
mode-specific normalisation, a conditional sampler that corrects for
category imbalance, and a four-metric validation suite that scores the
result rather than asserting it is good.

Two ways in.

**Copy** takes real data you cannot share and learns its joint
distribution:

    import pandas as pd
    from synthfin import synthesize

    real = pd.read_csv("loans.csv")
    synth, report = synthesize(real, n_rows=5000, epochs=300)
    synth.to_csv("loans_synthetic.csv", index=False)

`report` carries the four validation metrics. Nothing about the run is
hidden: `synthesize` is a thin wrapper over `detect_schema`, `CTGAN` and
`validate`, and you can call those three yourself when you want control
over any step.

**Create** needs no source data at all. Declare the columns,
distributions and rules and generate from the specification:

    from synthfin import generate_from_criteria

    df, report = generate_from_criteria({
        "n_rows": 1000,
        "columns": [
            {"name": "age", "type": "integer",
             "dist": {"dist": "normal", "mu": 34, "sigma": 9},
             "min": 18, "max": 70},
            {"name": "region", "type": "categorical",
             "dist": {"dist": "categorical",
                      "values": ["urban", "rural"], "weights": [0.6, 0.4]}},
            {"name": "senior", "type": "binary",
             "dist": {"dist": "bernoulli", "p": 0.1}},
        ],
        "rules": [{"target": "senior", "expr": "age >= 60"}],
    })

Every column a rule targets must be declared in `columns` first; the rule
overwrites it rather than creating it. Check a spec before running it with
`validate_spec`, which returns a list of problems and an empty list when
there are none.

Rule expressions run through a whitelist AST evaluator, never `eval`, so
a specification arriving over an API cannot execute code.
"""

__version__ = "0.1.0"

from synthfin.api import synthesize, validate
from synthfin.criteria import (
    CriteriaError,
    generate_from_criteria,
    validate_spec,
)
from synthfin.ctgan import CTGAN
from synthfin.preprocessing import DataTransformer
from synthfin.presets import get_preset, list_presets
from synthfin.schema import detect_schema
from synthfin.validation import (
    run_dcr_privacy,
    run_privacy_assessment,
    run_statistical_tests,
    run_tstr_validation,
    test_correlation_preservation,
)

__all__ = [
    "CTGAN",
    "CriteriaError",
    "DataTransformer",
    "__version__",
    "detect_schema",
    "generate_from_criteria",
    "get_preset",
    "list_presets",
    "run_dcr_privacy",
    "run_privacy_assessment",
    "run_statistical_tests",
    "run_tstr_validation",
    "synthesize",
    "test_correlation_preservation",
    "validate",
    "validate_spec",
]

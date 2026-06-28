"""
Verify the Criteria Engine (Mode 2) end to end on the rural-Gambia student
example, and confirm the safe evaluator blocks code injection.

Run (from backend/):  python -m scripts.check_criteria
"""

from __future__ import annotations

import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from synthfin.criteria import CriteriaError, generate_from_criteria, safe_eval  # noqa: E402

STUDENT_SPEC = {
    "name": "Rural Gambia: Student Exam Performance",
    "target": "passed",
    "columns": [
        {"name": "student_id", "type": "id", "dist": {"dist": "uuid"}},
        {"name": "gender", "type": "categorical",
         "dist": {"dist": "categorical", "values": ["Male", "Female"], "weights": [0.5, 0.5]}},
        {"name": "school_type", "type": "categorical",
         "dist": {"dist": "categorical", "values": ["Public", "Private", "Religious"],
                  "weights": [0.5, 0.3, 0.2]}},
        {"name": "school_setting", "type": "categorical",
         "dist": {"dist": "categorical", "values": ["Urban", "Rural"], "weights": [0.4, 0.6]}},
        {"name": "distance_to_school", "type": "continuous",
         "dist": {"dist": "gamma", "shape": 2, "scale": 3}, "min": 0, "max": 30},
        {"name": "meals_per_day", "type": "integer",
         "dist": {"dist": "poisson", "lam": 3}, "min": 1, "max": 5},
        {"name": "exam_score", "type": "continuous",
         "dist": {"dist": "normal", "mu": 62, "sigma": 18}, "min": 0, "max": 100},
        {"name": "passed", "type": "binary", "dist": {"dist": "derived"}},
    ],
    "rules": [
        {"target": "exam_score", "when": "school_type == 'Public'", "expr": "exam_score - 10"},
        {"target": "exam_score", "when": "school_type == 'Private'", "expr": "exam_score + 15"},
        {"target": "exam_score", "when": "school_setting == 'Rural'", "expr": "exam_score - 8"},
        {"target": "exam_score", "when": "distance_to_school > 5", "expr": "exam_score - 20"},
        {"target": "exam_score", "when": "meals_per_day < 2", "expr": "exam_score - 30"},
        {"target": "exam_score",
         "when": "(gender == 'Female') and (school_setting == 'Rural')", "expr": "exam_score + 5"},
        {"target": "passed", "expr": "exam_score >= 40"},
    ],
}


def main() -> int:
    df, report = generate_from_criteria(STUDENT_SPEC, n_rows=10000, seed=7)
    print(f"Generated {report['n_rows']} rows x {report['n_columns']} cols, "
          f"missing={report['missing_values']}")
    print(df.head(4).to_string())

    print("\nDomain-knowledge checks (should reflect the rules):")
    pass_rate = df["passed"].mean()
    urban = df[df.school_setting == "Urban"]["passed"].mean()
    rural = df[df.school_setting == "Rural"]["passed"].mean()
    near = df[df.distance_to_school <= 5]["exam_score"].mean()
    far = df[df.distance_to_school > 5]["exam_score"].mean()
    priv = df[df.school_type == "Private"]["exam_score"].mean()
    pub = df[df.school_type == "Public"]["exam_score"].mean()
    f_rural = df[(df.gender == "Female") & (df.school_setting == "Rural")]["exam_score"].mean()
    m_rural = df[(df.gender == "Male") & (df.school_setting == "Rural")]["exam_score"].mean()

    checks = [
        ("overall pass rate in 0.45-0.75", 0.45 <= pass_rate <= 0.75, f"{pass_rate:.3f}"),
        ("urban pass > rural pass", urban > rural, f"{urban:.3f} vs {rural:.3f}"),
        ("distance>5 lowers score ~20", (near - far) > 12, f"near {near:.1f} - far {far:.1f} = {near-far:.1f}"),
        ("private > public score", priv > pub, f"{priv:.1f} vs {pub:.1f}"),
        ("girls outperform boys (rural)", f_rural > m_rural, f"{f_rural:.1f} vs {m_rural:.1f}"),
        ("score range within [0,100]", df.exam_score.between(0, 100).all(), "ok"),
        ("no missing values", report["missing_values"] == 0, "ok"),
    ]
    ok = True
    for label, passed, detail in checks:
        ok = ok and passed
        print(f"  {'PASS' if passed else 'FAIL'}  {label:<34} ({detail})")

    print("\nSecurity: safe evaluator must reject injection:")
    attacks = ["__import__('os').system('echo hacked')",
               "().__class__.__bases__", "exam_score.__class__"]
    for atk in attacks:
        try:
            safe_eval(atk, {"exam_score": df["exam_score"].to_numpy()})
            print(f"  FAIL  did NOT block: {atk}")
            ok = False
        except CriteriaError:
            print(f"  PASS  blocked: {atk[:32]}...")

    print("\n" + ("CRITERIA ENGINE OK" if ok else "CRITERIA ENGINE HAD FAILURES"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

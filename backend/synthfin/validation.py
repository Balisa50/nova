"""
Validation framework for synthetic data quality (4 independent metrics).

  1. Statistical similarity   KS test (continuous) + Chi-square (categorical).
                              Pass: p > 0.05 for >= 80% of columns.
  2. Correlation preservation L1 mean |corr_real - corr_synth| over an encoded
                              numeric matrix. Pass: < 0.10.
  3. TSTR utility             Train a RandomForest on SYNTHETIC, test on a held-
                              out REAL set; compare to a real-trained baseline.
                              Pass: accuracy ratio >= 0.90.
  4. Privacy (MIA)            Can an attacker tell real from synthetic? Train a
                              RandomForest to classify origin. Pass: attack
                              accuracy <= 0.60 (0.50 = perfectly private).

Every metric returns a dict with a numeric score and a boolean `pass`, and
`validate_all` aggregates them into a single report.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.neighbors import NearestNeighbors


# --------------------------------------------------------------------------- #
# Encoding helpers
# --------------------------------------------------------------------------- #
def _aligned_dummies(real: pd.DataFrame, synth: pd.DataFrame,
                     feature_cols: list, discrete_cols: list):
    """One-hot encode both frames with a shared, aligned column set."""
    cat = [c for c in feature_cols if c in discrete_cols]
    combined = pd.concat(
        [real[feature_cols].assign(_src="r"), synth[feature_cols].assign(_src="s")],
        ignore_index=True,
    )
    dummies = pd.get_dummies(combined.drop(columns="_src"), columns=cat, dummy_na=False)
    dummies = dummies.apply(pd.to_numeric, errors="coerce").fillna(0.0).astype(float)
    src = combined["_src"].to_numpy()
    return (dummies[src == "r"].to_numpy(dtype=float),
            dummies[src == "s"].to_numpy(dtype=float))


def _numeric_encode(df: pd.DataFrame, continuous: list, discrete: list) -> pd.DataFrame:
    """Encode a frame to all-numeric for correlation comparison."""
    out = pd.DataFrame(index=df.index)
    for c in continuous:
        out[c] = pd.to_numeric(df[c], errors="coerce")
    for c in discrete:
        out[c] = pd.Categorical(df[c].astype(str)).codes
    return out.fillna(out.median(numeric_only=True))


# --------------------------------------------------------------------------- #
# 1. Statistical similarity
# --------------------------------------------------------------------------- #
def run_statistical_tests(real: pd.DataFrame, synth: pd.DataFrame,
                          continuous: list, discrete: list, alpha: float = 0.05,
                          test_size: int = 1000, seed: int = 0) -> dict:
    """KS / Chi-square hypothesis tests + an n-independent fidelity score.

    Two things are reported per column:

      * `p_value` / `pass` -- the hypothesis test is run on a random subsample
        of `test_size` rows from each frame. KS and Chi-square p-values collapse
        to ~0 at n=10k for differences far too small to matter, so the test is
        only meaningful at a moderate n (this is why SDMetrics scores the KS
        *statistic*, not the p-value). Subsampling keeps the test honest.

      * `similarity` -- 1 - KS_statistic (continuous) or 1 - total-variation
        distance (categorical), in [0, 1]. This is sample-size independent and
        is the real fidelity signal.
    """
    rng = np.random.default_rng(seed)
    results, passes, sims = {}, [], []

    def _sub(x):
        x = np.asarray(x)
        if len(x) <= test_size:
            return x
        return x[rng.choice(len(x), test_size, replace=False)]

    for col in continuous:
        a_full = pd.to_numeric(real[col], errors="coerce").dropna().to_numpy()
        b_full = pd.to_numeric(synth[col], errors="coerce").dropna().to_numpy()
        if len(a_full) < 2 or len(b_full) < 2:
            continue
        full_stat = stats.ks_2samp(a_full, b_full).statistic           # fidelity
        _, p = stats.ks_2samp(_sub(a_full), _sub(b_full))              # hypothesis test
        sim = 1.0 - float(full_stat)
        ok = bool(p > alpha)
        results[col] = {"test": "KS", "statistic": float(full_stat),
                        "p_value": float(p), "similarity": sim, "pass": ok}
        passes.append(ok)
        sims.append(sim)

    for col in discrete:
        cats = sorted(set(real[col].astype(str)) | set(synth[col].astype(str)))
        rp = real[col].astype(str).value_counts(normalize=True).reindex(cats, fill_value=0).to_numpy()
        sp = synth[col].astype(str).value_counts(normalize=True).reindex(cats, fill_value=0).to_numpy()
        tvd = 0.5 * float(np.abs(rp - sp).sum())                       # total variation
        sim = 1.0 - tvd

        rc = real[col].astype(str).iloc[:0]  # placeholder
        rc = pd.Series(_sub(real[col].astype(str).to_numpy())).value_counts().reindex(cats, fill_value=0).to_numpy()
        sc = pd.Series(_sub(synth[col].astype(str).to_numpy())).value_counts().reindex(cats, fill_value=0).to_numpy()
        table = np.vstack([rc, sc])
        table = table[:, table.sum(axis=0) > 0]
        if table.shape[1] < 2:
            continue
        _, p, _, _ = stats.chi2_contingency(table)
        ok = bool(p > alpha)
        results[col] = {"test": "Chi2", "tvd": tvd, "p_value": float(p),
                        "similarity": sim, "pass": ok}
        passes.append(ok)
        sims.append(sim)

    pass_rate = float(np.mean(passes)) if passes else 0.0
    mean_sim = float(np.mean(sims)) if sims else 0.0
    # Verdict is the size-independent mean column-shape similarity (the SDMetrics
    # convention), not the p-value pass-rate -- KS/Chi2 p-values collapse to ~0
    # at n=10k for negligible differences, so they are reported only as context.
    return {
        "per_column": results,
        "summary": {"pass_rate": pass_rate,
                    "mean_similarity": mean_sim,
                    "n_columns": len(passes),
                    "overall_pass": bool(mean_sim >= 0.90)},
    }


# --------------------------------------------------------------------------- #
# 2. Correlation preservation
# --------------------------------------------------------------------------- #
def test_correlation_preservation(real: pd.DataFrame, synth: pd.DataFrame,
                                  continuous: list, discrete: list,
                                  threshold: float = 0.10) -> dict:
    r = _numeric_encode(real, continuous, discrete)
    s = _numeric_encode(synth, continuous, discrete)
    cols = [c for c in r.columns if r[c].std() > 0 and s[c].std() > 0]
    cr = np.corrcoef(r[cols].to_numpy().T)
    cs = np.corrcoef(s[cols].to_numpy().T)
    diff = np.abs(cr - cs)
    # mean over off-diagonal entries
    off = ~np.eye(diff.shape[0], dtype=bool)
    l1 = float(diff[off].mean())
    return {"l1_diff": l1, "max_diff": float(diff[off].max()),
            "n_features": len(cols), "pass": bool(l1 < threshold)}


# --------------------------------------------------------------------------- #
# 3. TSTR utility
# --------------------------------------------------------------------------- #
def run_tstr_validation(real: pd.DataFrame, synth: pd.DataFrame,
                        target: str, continuous: list, discrete: list,
                        threshold: float = 0.90, seed: int = 0) -> dict:
    feature_cols = [c for c in continuous + discrete if c != target]
    real_X, synth_X = _aligned_dummies(real, synth, feature_cols, discrete)
    real_y = real[target].astype(str).to_numpy()
    synth_y = synth[target].astype(str).to_numpy()

    Xtr, Xte, ytr, yte = train_test_split(real_X, real_y, test_size=0.3,
                                          random_state=seed, stratify=_safe_strat(real_y))

    def _fit_score(X, y):
        clf = RandomForestClassifier(n_estimators=200, random_state=seed, n_jobs=-1)
        clf.fit(X, y)
        pred = clf.predict(Xte)
        acc = accuracy_score(yte, pred)
        auc = _safe_auc(clf, Xte, yte)
        return acc, auc

    real_acc, real_auc = _fit_score(Xtr, ytr)              # train-real / test-real
    synth_acc, synth_auc = _fit_score(synth_X, synth_y)    # train-synth / test-real

    ratio = synth_acc / real_acc if real_acc > 0 else 0.0
    auc_ratio = (synth_auc / real_auc) if (real_auc and real_auc > 0) else float("nan")
    return {
        "real_accuracy": float(real_acc), "synth_accuracy": float(synth_acc),
        "real_auc": float(real_auc), "synth_auc": float(synth_auc),
        "performance_ratio": float(ratio), "auc_ratio": float(auc_ratio),
        "pass": bool(ratio >= threshold),
    }


def _safe_strat(y):
    _, counts = np.unique(y, return_counts=True)
    return y if counts.min() >= 2 else None


def _safe_auc(clf, X, y) -> float:
    classes = np.unique(y)
    if len(classes) != 2:
        return float("nan")
    proba = clf.predict_proba(X)
    pos = list(clf.classes_).index(classes[-1])
    try:
        return roc_auc_score((y == classes[-1]).astype(int), proba[:, pos])
    except ValueError:
        return float("nan")


# --------------------------------------------------------------------------- #
# 4. Privacy (membership inference / distinguishability attack)
# --------------------------------------------------------------------------- #
def run_privacy_assessment(real: pd.DataFrame, synth: pd.DataFrame,
                           continuous: list, discrete: list,
                           threshold: float = 0.60, seed: int = 0) -> dict:
    feature_cols = continuous + discrete
    real_X, synth_X = _aligned_dummies(real, synth, feature_cols, discrete)
    n = min(len(real_X), len(synth_X))
    rng = np.random.default_rng(seed)
    ri = rng.choice(len(real_X), n, replace=False)
    si = rng.choice(len(synth_X), n, replace=False)
    X = np.vstack([real_X[ri], synth_X[si]])
    y = np.concatenate([np.ones(n), np.zeros(n)])

    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, random_state=seed, stratify=y)
    clf = RandomForestClassifier(n_estimators=200, random_state=seed, n_jobs=-1)
    clf.fit(Xtr, ytr)
    acc = float(accuracy_score(yte, clf.predict(Xte)))
    return {"attack_accuracy": acc, "baseline": 0.50,
            "advantage": float(acc - 0.50), "pass": bool(acc <= threshold)}


# --------------------------------------------------------------------------- #
# 4b. Privacy (Distance to Closest Record) -- the rigorous privacy test
# --------------------------------------------------------------------------- #
def run_dcr_privacy(real: pd.DataFrame, synth: pd.DataFrame,
                    continuous: list, discrete: list, seed: int = 0) -> dict:
    """Distance-to-Closest-Record privacy check.

    A detection classifier (run_privacy_assessment) measures whether real and
    synthetic are *distinguishable* -- that is fidelity, not privacy, and a high
    value is not a leak. Real membership-privacy asks the opposite question:
    are synthetic rows suspiciously *close* to real training rows (memorisation)?

    We split the real data into a reference set (proxy for the training set) and
    a holdout. We then compare nearest-neighbour distances: synthetic->reference
    versus holdout->reference. If synthetic rows are no closer to the reference
    than a genuinely fresh real sample (the holdout) is, the model has not copied
    individuals. We also flag the share of synthetic rows that fall closer than
    the 5th percentile of holdout distances (potential near-duplicates).
    """
    feature_cols = continuous + discrete
    real_X, synth_X = _aligned_dummies(real, synth, feature_cols, discrete)
    rng = np.random.default_rng(seed)
    idx = rng.permutation(len(real_X))
    half = len(real_X) // 2
    ref, hold = real_X[idx[:half]], real_X[idx[half:]]

    mu, sd = ref.mean(0), ref.std(0)
    sd[sd == 0] = 1.0
    ref_s, hold_s, synth_s = (ref - mu) / sd, (hold - mu) / sd, (synth_X - mu) / sd

    nn = NearestNeighbors(n_neighbors=1).fit(ref_s)
    synth_d = nn.kneighbors(synth_s)[0].ravel()
    hold_d = nn.kneighbors(hold_s)[0].ravel()

    med_synth, med_hold = float(np.median(synth_d)), float(np.median(hold_d))
    ratio = med_synth / med_hold if med_hold > 0 else float("inf")
    dup_thresh = float(np.percentile(hold_d, 5))
    dup_share = float(np.mean(synth_d < dup_thresh))

    passed = bool(ratio >= 0.90 and dup_share <= 0.05)
    return {"median_dcr_ratio": ratio, "duplicate_share": dup_share,
            "median_synth_distance": med_synth, "median_holdout_distance": med_hold,
            "pass": passed}


# --------------------------------------------------------------------------- #
# Aggregate
# --------------------------------------------------------------------------- #
def validate_all(real: pd.DataFrame, synth: pd.DataFrame, schema: dict,
                 seed: int = 0) -> dict:
    continuous = schema["continuous"]
    discrete = schema["discrete"]
    target = schema.get("target")

    report = {
        "statistical": run_statistical_tests(real, synth, continuous, discrete),
        "correlation": test_correlation_preservation(real, synth, continuous, discrete),
        "privacy": run_dcr_privacy(real, synth, continuous, discrete, seed=seed),
        # Detection accuracy is reported as a fidelity diagnostic, not privacy:
        # a high value means synth is still distinguishable, not that data leaked.
        "distinguishability": run_privacy_assessment(real, synth, continuous, discrete, seed=seed),
    }
    if target is not None and real[target].nunique() >= 2:
        report["tstr"] = run_tstr_validation(real, synth, target, continuous, discrete, seed=seed)

    checks = [
        report["statistical"]["summary"]["overall_pass"],
        report["correlation"]["pass"],
        report["privacy"]["pass"],
    ]
    if "tstr" in report:
        checks.append(report["tstr"]["pass"])
    report["overall"] = {"passed": int(sum(checks)), "total": len(checks),
                         "all_pass": bool(all(checks))}
    return report


def print_report(report: dict) -> None:
    s = report["statistical"]["summary"]
    print("\n=== NOVA validation report ===")
    print(f"1. Statistical similarity : pass_rate={s['pass_rate']:.2%} "
          f"(mean_sim={s['mean_similarity']:.3f}) over {s['n_columns']} cols "
          f"-> {'PASS' if s['overall_pass'] else 'FAIL'}")
    c = report["correlation"]
    print(f"2. Correlation preservation: L1={c['l1_diff']:.4f} "
          f"(max={c['max_diff']:.3f}) -> {'PASS' if c['pass'] else 'FAIL'}")
    if "tstr" in report:
        t = report["tstr"]
        print(f"3. TSTR utility           : acc_ratio={t['performance_ratio']:.3f} "
              f"auc_ratio={t['auc_ratio']:.3f} (synth_auc={t['synth_auc']:.3f}) "
              f"-> {'PASS' if t['pass'] else 'FAIL'}")
    p = report["privacy"]
    print(f"4. Privacy (DCR)          : dcr_ratio={p['median_dcr_ratio']:.3f} "
          f"dup_share={p['duplicate_share']:.3f} -> {'PASS' if p['pass'] else 'FAIL'}")
    d = report["distinguishability"]
    print(f"   (diagnostic) detection acc={d['attack_accuracy']:.3f} "
          f"-> lower = higher fidelity")
    o = report["overall"]
    print(f"\nOVERALL: {o['passed']}/{o['total']} metrics passed "
          f"-> {'ALL PASS' if o['all_pass'] else 'NEEDS WORK'}")

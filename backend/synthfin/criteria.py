"""
NOVA Criteria Engine (Mode 2: Create) — generate synthetic data from domain
knowledge alone, with no pre-existing dataset.

A *criteria spec* declares columns (each with a base distribution) plus a list
of ordered *rules* that encode domain knowledge ("rural schools score lower",
"new account + big international transfer => likely fraud"). The engine samples
each column from its distribution, applies the rules in order (vectorised, like
spreadsheet formulas), clamps/rounds to declared types, and reports how well the
realised data satisfies the intended targets.

SECURITY: rule conditions and expressions are arbitrary strings that may arrive
from an untrusted API client. They are evaluated by a *whitelist AST evaluator*
(`_SafeEval`) — never Python `eval()`. Only arithmetic, comparisons, boolean
logic, membership, a ternary, and a small set of numeric functions are allowed;
attribute access, calls to arbitrary names, subscripting, comprehensions and
lambdas are rejected. This makes `__import__`/`__class__`-style escapes
impossible.
"""

from __future__ import annotations

import ast
import uuid
from typing import Any

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------- #
# Safe expression evaluator (vectorised over numpy arrays)
# --------------------------------------------------------------------------- #
_ALLOWED_FUNCS = {
    "abs": np.abs,
    "min": np.minimum,
    "max": np.maximum,
    "clip": np.clip,
    "where": np.where,
    "log": np.log,
    "log1p": np.log1p,
    "exp": np.exp,
    "sqrt": np.sqrt,
    "round": np.round,
    "floor": np.floor,
    "ceil": np.ceil,
    "isin": lambda x, vals: np.isin(x, list(vals)),
}

_BINOPS = {
    ast.Add: np.add, ast.Sub: np.subtract, ast.Mult: np.multiply,
    ast.Div: np.divide, ast.FloorDiv: np.floor_divide, ast.Mod: np.mod,
    ast.Pow: np.power,
}
# Python operators (not np.equal/np.less): these dispatch elementwise on numpy
# arrays AND work on object/string arrays, which np.equal does not.
_CMPOPS = {
    ast.Eq: lambda a, b: a == b,
    ast.NotEq: lambda a, b: a != b,
    ast.Lt: lambda a, b: a < b,
    ast.LtE: lambda a, b: a <= b,
    ast.Gt: lambda a, b: a > b,
    ast.GtE: lambda a, b: a >= b,
}


class CriteriaError(ValueError):
    """Raised for invalid specs or unsafe/invalid expressions."""


class _SafeEval(ast.NodeVisitor):
    """Evaluate a whitelisted expression AST against an environment of arrays."""

    def __init__(self, env: dict[str, Any]):
        self.env = env

    def run(self, expr: str):
        try:
            tree = ast.parse(expr, mode="eval")
        except SyntaxError as e:
            raise CriteriaError(f"Could not parse expression {expr!r}: {e}")
        return self.visit(tree.body)

    # --- disallow everything not explicitly handled --- #
    def generic_visit(self, node):
        raise CriteriaError(f"Disallowed expression element: {type(node).__name__}")

    def visit_Constant(self, node):
        return node.value

    def visit_Name(self, node):
        if node.id in self.env:
            return self.env[node.id]
        raise CriteriaError(f"Unknown name in expression: {node.id!r}")

    def visit_List(self, node):
        return [self.visit(e) for e in node.elts]

    visit_Tuple = visit_List

    def visit_UnaryOp(self, node):
        v = self.visit(node.operand)
        if isinstance(node.op, ast.USub):
            return np.negative(v)
        if isinstance(node.op, ast.UAdd):
            return v
        if isinstance(node.op, ast.Not):
            return np.logical_not(v)
        raise CriteriaError("Disallowed unary operator")

    def visit_BinOp(self, node):
        op = _BINOPS.get(type(node.op))
        if op is None:
            raise CriteriaError("Disallowed binary operator")
        return op(self.visit(node.left), self.visit(node.right))

    def visit_BoolOp(self, node):
        vals = [self.visit(v) for v in node.values]
        reducer = np.logical_and if isinstance(node.op, ast.And) else np.logical_or
        out = vals[0]
        for v in vals[1:]:
            out = reducer(out, v)
        return out

    def visit_Compare(self, node):
        left = self.visit(node.left)
        result = None
        for op, comparator in zip(node.ops, node.comparators):
            right = self.visit(comparator)
            if isinstance(op, ast.In):
                cur = np.isin(left, list(right))
            elif isinstance(op, ast.NotIn):
                cur = np.logical_not(np.isin(left, list(right)))
            else:
                fn = _CMPOPS.get(type(op))
                if fn is None:
                    raise CriteriaError("Disallowed comparison operator")
                cur = fn(left, right)
            result = cur if result is None else np.logical_and(result, cur)
            left = right
        return result

    def visit_IfExp(self, node):
        return np.where(self.visit(node.test), self.visit(node.body),
                        self.visit(node.orelse))

    def visit_Call(self, node):
        if not isinstance(node.func, ast.Name) or node.func.id not in _ALLOWED_FUNCS:
            raise CriteriaError("Only whitelisted functions may be called")
        if node.keywords:
            raise CriteriaError("Keyword arguments are not allowed")
        args = [self.visit(a) for a in node.args]
        return _ALLOWED_FUNCS[node.func.id](*args)


def safe_eval(expr: str, env: dict[str, Any]):
    return _SafeEval(env).run(expr)


# --------------------------------------------------------------------------- #
# Distribution sampling
# --------------------------------------------------------------------------- #
def sample_distribution(spec: dict, n: int, rng: np.random.Generator):
    dist = (spec or {}).get("dist", "derived")
    if dist == "normal":
        return rng.normal(spec.get("mu", 0.0), spec.get("sigma", 1.0), n)
    if dist == "gamma":
        return rng.gamma(spec.get("shape", 2.0), spec.get("scale", 1.0), n)
    if dist == "poisson":
        return rng.poisson(spec.get("lam", 1.0), n).astype(float)
    if dist == "uniform":
        return rng.uniform(spec.get("low", 0.0), spec.get("high", 1.0), n)
    if dist == "exponential":
        return rng.exponential(spec.get("scale", 1.0), n)
    if dist == "lognormal":
        return rng.lognormal(spec.get("mu", 0.0), spec.get("sigma", 1.0), n)
    if dist == "bernoulli":
        return (rng.random(n) < spec.get("p", 0.5)).astype(float)
    if dist in ("categorical", "choice"):
        values = spec["values"]
        weights = spec.get("weights")
        if weights:
            w = np.array(weights, dtype=float)
            w = w / w.sum()
        else:
            w = None
        return rng.choice(values, size=n, p=w)
    if dist == "uuid":
        return np.array([str(uuid.uuid4()) for _ in range(n)], dtype=object)
    if dist == "constant":
        return np.full(n, spec.get("value", 0))
    if dist == "derived":
        return None  # filled by rules
    raise CriteriaError(f"Unknown distribution: {dist!r}")


# --------------------------------------------------------------------------- #
# Generation
# --------------------------------------------------------------------------- #
def _init_value(col: dict):
    t = col.get("type", "continuous")
    if t in ("categorical", "string", "id"):
        return ""
    return 0.0


def generate_from_criteria(spec: dict, n_rows: int = 10000, seed: int = 0) -> tuple[pd.DataFrame, dict]:
    """Generate a synthetic dataset from a criteria spec (no source data)."""
    if "columns" not in spec or not spec["columns"]:
        raise CriteriaError("Spec must declare at least one column.")
    n = max(1, int(n_rows))
    rng = np.random.default_rng(seed)

    columns = spec["columns"]
    names = [c["name"] for c in columns]
    if len(set(names)) != len(names):
        raise CriteriaError("Duplicate column names in spec.")

    # 1) sample base distributions / initialise derived columns
    env: dict[str, Any] = {}
    for col in columns:
        sampled = sample_distribution(col.get("dist", {"dist": "derived"}), n, rng)
        env[col["name"]] = (np.full(n, _init_value(col), dtype=object)
                            if sampled is None and col.get("type") in ("categorical", "string", "id")
                            else (np.full(n, _init_value(col)) if sampled is None else sampled))

    # 2) apply rules in order
    for i, rule in enumerate(spec.get("rules", [])):
        target = rule.get("target")
        expr = rule.get("expr")
        if not target or expr is None:
            raise CriteriaError(f"Rule #{i} must have 'target' and 'expr'.")
        if target not in env:
            raise CriteriaError(f"Rule #{i} targets unknown column {target!r}.")
        when = rule.get("when")
        try:
            mask = (np.asarray(safe_eval(when, env), dtype=bool) if when
                    else np.ones(n, dtype=bool))
            new = safe_eval(expr, env)
        except CriteriaError as e:
            raise CriteriaError(f"Rule #{i} ({target}): {e}")
        new = np.asarray(new)
        if new.ndim == 0:
            new = np.full(n, new.item())
        cur = np.asarray(env[target])
        # Object columns stay object; everything numeric/boolean becomes float
        # (booleans collapse to 1.0/0.0, which the binary post-process re-casts).
        if cur.dtype == object:
            new, cur = new.astype(object), cur.astype(object).copy()
        else:
            new, cur = new.astype(float), cur.astype(float).copy()
        cur[mask] = new[mask]
        env[target] = cur

    # 3) post-process to declared types + ranges
    report_cols = {}
    out = {}
    for col in columns:
        name, t = col["name"], col.get("type", "continuous")
        if name.startswith("_"):
            continue  # scratch/helper column — usable in rules, hidden from output
        v = np.asarray(env[name])
        if t in ("continuous",):
            v = v.astype(float)
            if "min" in col or "max" in col:
                v = np.clip(v, col.get("min", -np.inf), col.get("max", np.inf))
            out[name] = np.round(v, 4)
        elif t in ("integer", "count"):
            v = np.round(v.astype(float))
            if "min" in col or "max" in col:
                v = np.clip(v, col.get("min", -np.inf), col.get("max", np.inf))
            out[name] = v.astype("int64")
        elif t == "binary":
            v = (np.asarray(v, dtype=float) >= 0.5).astype("int64")
            out[name] = v
            report_cols[name] = {"rate": float(v.mean())}
        else:  # categorical / id / string
            out[name] = v.astype(object)
        if t in ("continuous", "integer", "count"):
            report_cols[name] = {"mean": float(np.mean(out[name])),
                                 "min": float(np.min(out[name])),
                                 "max": float(np.max(out[name]))}

    df = pd.DataFrame(out, columns=[n for n in names if not n.startswith("_")])
    report = {
        "n_rows": int(n),
        "n_columns": len(names),
        "missing_values": int(df.isna().sum().sum()),
        "columns": report_cols,
        "target": spec.get("target"),
        "target_rate": (float(df[spec["target"]].astype(float).mean())
                        if spec.get("target") in df else None),
    }
    return df, report


def validate_spec(spec: dict) -> list[str]:
    """Lightweight static validation; returns a list of human-readable problems."""
    problems = []
    if not isinstance(spec.get("columns"), list) or not spec["columns"]:
        problems.append("Spec needs a non-empty 'columns' list.")
        return problems
    names = set()
    for c in spec["columns"]:
        if "name" not in c:
            problems.append("A column is missing 'name'.")
            continue
        names.add(c["name"])
    for i, r in enumerate(spec.get("rules", [])):
        if r.get("target") not in names:
            problems.append(f"Rule #{i} targets unknown column {r.get('target')!r}.")
    return problems

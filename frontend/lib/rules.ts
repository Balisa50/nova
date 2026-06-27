// Visual rule model <-> Criteria Engine JSON.
//
// The visual builder edits "items": each item is either an editable Rule (an
// IF/THEN card) or a raw built-in rule we couldn't represent visually (a base
// rate, a clamp, a derived column). Items keep their original order so the
// generated spec is identical to what the engine expects.

import type { ColumnSpec, CriteriaSpec, RuleSpec } from "@/lib/api";

export type CondOp = "is" | "is_not" | "is_above" | "is_at_least" | "is_below" | "is_at_most";
export type EffectKind =
  | "set_to"
  | "increase_pct"
  | "decrease_pct"
  | "add"
  | "subtract"
  | "multiply"
  | "more_likely"
  | "less_likely";

// effect.column === RISK means "the chance of the target" (maps to the _p helper)
export const RISK = "__risk__";

export interface Condition {
  id: string;
  column: string;
  op: CondOp;
  value: string;
}
export interface Effect {
  column: string; // a real column name, or RISK
  kind: EffectKind;
  value: string;
}
export interface Rule {
  id: string;
  join: "and" | "or";
  conditions: Condition[];
  effect: Effect;
}

export type Item = { kind: "rule"; rule: Rule } | { kind: "builtin"; raw: RuleSpec };

export interface ColMeta {
  name: string;
  type: string; // continuous | integer | count | categorical | binary | id | string
  values?: string[];
  numeric: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10);

// --------------------------------------------------------------------------- //
// Column metadata
// --------------------------------------------------------------------------- //
export function columnMeta(spec: CriteriaSpec): ColMeta[] {
  return (spec.columns || [])
    .filter((c) => !c.name.startsWith("_") && c.type !== "id")
    .map((c) => toMeta(c));
}
function toMeta(c: ColumnSpec): ColMeta {
  const numeric = ["continuous", "integer", "count"].includes(c.type);
  const dist = c.dist as { dist?: string; values?: unknown[] } | undefined;
  const values =
    dist && (dist.dist === "categorical" || dist.dist === "choice")
      ? (dist.values as unknown[]).map(String)
      : undefined;
  return { name: c.name, type: c.type, numeric, values };
}
export function metaOf(cols: ColMeta[], name: string): ColMeta | undefined {
  return cols.find((c) => c.name === name);
}

export const OP_LABEL: Record<CondOp, string> = {
  is: "is",
  is_not: "is not",
  is_above: "is above",
  is_at_least: "is at least",
  is_below: "is below",
  is_at_most: "is at most",
};
const OP_SYM: Record<CondOp, string> = {
  is: "==", is_not: "!=", is_above: ">", is_at_least: ">=", is_below: "<", is_at_most: "<=",
};

export function operatorsFor(meta?: ColMeta): CondOp[] {
  if (!meta) return ["is"];
  if (meta.numeric) return ["is_above", "is_at_least", "is_below", "is_at_most", "is", "is_not"];
  return ["is", "is_not"];
}

// A starting value so categorical/binary fields are never "empty" on screen.
export function defaultValue(meta?: ColMeta): string {
  if (!meta) return "";
  if (meta.values && meta.values.length) return meta.values[0];
  if (meta.type === "binary") return "1";
  return "";
}

export const EFFECT_LABEL: Record<EffectKind, string> = {
  set_to: "set to",
  increase_pct: "increase by %",
  decrease_pct: "decrease by %",
  add: "add",
  subtract: "subtract",
  multiply: "multiply by",
  more_likely: "more likely",
  less_likely: "less likely",
};
export function effectsFor(meta?: ColMeta): EffectKind[] {
  if (!meta) return ["set_to"]; // RISK handled separately by caller
  if (meta.numeric) return ["set_to", "increase_pct", "decrease_pct", "add", "subtract", "multiply"];
  return ["set_to"]; // categorical / binary
}

// --------------------------------------------------------------------------- //
// Parse: CriteriaSpec.rules -> Item[]
// --------------------------------------------------------------------------- //
export function parseItems(spec: CriteriaSpec): Item[] {
  return (spec.rules || []).map((rs) => {
    const rule = tryParseRule(rs);
    return rule ? { kind: "rule" as const, rule } : { kind: "builtin" as const, raw: rs };
  });
}

function tryParseRule(rs: RuleSpec): Rule | null {
  const parsedWhen = parseWhen(rs.when);
  if (parsedWhen === null) return null;
  const effect = parseExpr(rs.target, rs.expr);
  if (!effect) return null;
  return { id: uid(), join: parsedWhen.join, conditions: parsedWhen.conditions, effect };
}

function parseWhen(when?: string): { join: "and" | "or"; conditions: Condition[] } | null {
  if (!when || !when.trim()) return { join: "and", conditions: [] };
  const join: "and" | "or" = / or /.test(when) ? "or" : "and";
  const parts = when.split(join === "or" ? / or /i : / and /i);
  const conditions: Condition[] = [];
  for (const part of parts) {
    const c = parseComparison(part.trim().replace(/^\(/, "").replace(/\)$/, "").trim());
    if (!c) return null;
    conditions.push(c);
  }
  return { join, conditions };
}

function parseComparison(s: string): Condition | null {
  const symbols: [string, CondOp][] = [
    [">=", "is_at_least"], ["<=", "is_at_most"], ["==", "is"],
    ["!=", "is_not"], [">", "is_above"], ["<", "is_below"],
  ];
  for (const [sym, op] of symbols) {
    const i = s.indexOf(sym);
    if (i > 0) {
      const col = s.slice(0, i).trim();
      let val = s.slice(i + sym.length).trim();
      val = val.replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");
      if (!/^[A-Za-z_][\w]*$/.test(col)) return null;
      return { id: uid(), column: col, op, value: val };
    }
  }
  return null;
}

function parseExpr(ruleTarget: string, expr: string): Effect | null {
  const e = expr.trim();
  if (ruleTarget === "_p") {
    let m = e.match(/^_p\s*\+\s*([\d.]+)$/);
    if (m) return { column: RISK, kind: "more_likely", value: String(round(+m[1] * 100)) };
    m = e.match(/^_p\s*-\s*([\d.]+)$/);
    if (m) return { column: RISK, kind: "less_likely", value: String(round(+m[1] * 100)) };
    return null; // base rate / clip -> builtin
  }
  const t = escapeRe(ruleTarget);
  // constant number
  if (/^-?[\d.]+$/.test(e)) return { column: ruleTarget, kind: "set_to", value: e };
  // quoted categorical
  const q = e.match(/^'(.*)'$/);
  if (q) return { column: ruleTarget, kind: "set_to", value: q[1] };
  // target * k
  let m = e.match(new RegExp(`^${t}\\s*\\*\\s*([\\d.]+)$`));
  if (m) {
    const k = +m[1];
    if (k < 1) return { column: ruleTarget, kind: "decrease_pct", value: String(round((1 - k) * 100)) };
    if (k > 1) return { column: ruleTarget, kind: "increase_pct", value: String(round((k - 1) * 100)) };
    return { column: ruleTarget, kind: "multiply", value: m[1] };
  }
  m = e.match(new RegExp(`^${t}\\s*\\+\\s*([\\d.]+)$`));
  if (m) return { column: ruleTarget, kind: "add", value: m[1] };
  m = e.match(new RegExp(`^${t}\\s*-\\s*([\\d.]+)$`));
  if (m) return { column: ruleTarget, kind: "subtract", value: m[1] };
  return null; // derived / boolean / multi-term -> builtin
}

// --------------------------------------------------------------------------- //
// Serialize: Item[] -> CriteriaSpec
// --------------------------------------------------------------------------- //
export function buildSpec(base: CriteriaSpec, items: Item[], cols: ColMeta[]): CriteriaSpec {
  const rules: RuleSpec[] = items.map((it) =>
    it.kind === "builtin" ? it.raw : ruleToSpec(it.rule, cols)
  );
  return { ...base, rules };
}

function ruleToSpec(rule: Rule, cols: ColMeta[]): RuleSpec {
  const out: RuleSpec = { target: "", expr: "" };
  if (rule.conditions.length) {
    out.when = rule.conditions
      .map((c) => `(${c.column} ${OP_SYM[c.op]} ${fmtVal(c.value, metaOf(cols, c.column))})`)
      .join(` ${rule.join} `);
  }
  const ef = rule.effect;
  if (ef.column === RISK) {
    out.target = "_p";
    out.expr = ef.kind === "more_likely" ? `_p + ${num(ef.value) / 100}` : `_p - ${num(ef.value) / 100}`;
  } else {
    out.target = ef.column;
    const meta = metaOf(cols, ef.column);
    const c = ef.column;
    const v = num(ef.value);
    switch (ef.kind) {
      case "set_to":
        if (meta?.type === "binary") out.expr = isTrue(ef.value) ? "1" : "0";
        else if (meta && !meta.numeric) out.expr = `'${ef.value}'`;
        else out.expr = String(num(ef.value));
        break;
      case "increase_pct": out.expr = `${c} * ${1 + v / 100}`; break;
      case "decrease_pct": out.expr = `${c} * ${1 - v / 100}`; break;
      case "add": out.expr = `${c} + ${v}`; break;
      case "subtract": out.expr = `${c} - ${v}`; break;
      case "multiply": out.expr = `${c} * ${v}`; break;
      default: out.expr = String(v);
    }
  }
  return out;
}

function isTrue(value: string): boolean {
  return /^(1|true|yes)$/i.test(value.trim());
}
function fmtVal(value: string, meta?: ColMeta): string {
  if (meta?.type === "binary") return isTrue(value) ? "1" : "0";
  if (meta && !meta.numeric) return `'${value}'`;
  return String(num(value));
}

// --------------------------------------------------------------------------- //
// Plain English
// --------------------------------------------------------------------------- //
export function ruleToEnglish(rule: Rule, target?: string): string {
  const ifPart = rule.conditions.length
    ? "If " +
      rule.conditions
        .map((c) => `${label(c.column)} ${OP_LABEL[c.op]} ${c.value}`)
        .join(rule.join === "or" ? " or " : " and ") +
      ", "
    : "Always: ";
  return ifPart + effectEnglish(rule.effect, target);
}
function effectEnglish(ef: Effect, target?: string): string {
  if (ef.column === RISK) {
    const t = label(target || "the target");
    return ef.kind === "more_likely"
      ? `make ${t} ${ef.value}% more likely`
      : `make ${t} ${ef.value}% less likely`;
  }
  const c = label(ef.column);
  switch (ef.kind) {
    case "set_to": return `set ${c} to ${ef.value}`;
    case "increase_pct": return `increase ${c} by ${ef.value}%`;
    case "decrease_pct": return `decrease ${c} by ${ef.value}%`;
    case "add": return `add ${ef.value} to ${c}`;
    case "subtract": return `subtract ${ef.value} from ${c}`;
    case "multiply": return `multiply ${c} by ${ef.value}`;
    default: return `change ${c}`;
  }
}

const ACR: Record<string, string> = { usd: "USD", apr: "APR", bmi: "BMI", gdp: "GDP", roe: "ROE", pct: "%" };
export function label(name: string): string {
  return name.split("_").map((w) => ACR[w] ?? w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// --------------------------------------------------------------------------- //
function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function newRule(cols: ColMeta[], target?: string): Rule {
  const firstNumeric = cols.find((c) => c.numeric) ?? cols[0];
  const effectCol = target ? RISK : (cols[0]?.name ?? "");
  return {
    id: uid(),
    join: "and",
    conditions: firstNumeric
      ? [{ id: uid(), column: firstNumeric.name, op: operatorsFor(firstNumeric)[0], value: "" }]
      : [],
    effect: {
      column: effectCol,
      kind: effectCol === RISK ? "more_likely" : effectsFor(metaOf(cols, effectCol))[0],
      value: effectCol === RISK ? "" : defaultValue(metaOf(cols, effectCol)),
    },
  };
}

export function ruleComplete(rule: Rule): boolean {
  if (rule.conditions.some((c) => c.value.trim() === "")) return false;
  if (rule.effect.value.trim() === "") return false;
  return true;
}

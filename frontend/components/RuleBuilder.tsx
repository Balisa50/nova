"use client";

import {
  EFFECT_LABEL,
  OP_LABEL,
  RISK,
  type ColMeta,
  type Condition,
  type Effect,
  type EffectKind,
  type Item,
  type Rule,
  defaultValue,
  effectsFor,
  label,
  metaOf,
  newRule,
  operatorsFor,
  ruleToEnglish,
} from "@/lib/rules";

export function RuleBuilder({
  items,
  setItems,
  cols,
  target,
}: {
  items: Item[];
  setItems: (items: Item[]) => void;
  cols: ColMeta[];
  target?: string;
}) {
  const builtinCount = items.filter((it) => it.kind === "builtin").length;
  let n = 0;

  function update(idx: number, rule: Rule) {
    setItems(items.map((it, i) => (i === idx ? { kind: "rule", rule } : it)));
  }
  function remove(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }
  function duplicate(idx: number) {
    const it = items[idx];
    if (it.kind !== "rule") return;
    const copy: Item = { kind: "rule", rule: { ...it.rule, id: Math.random().toString(36).slice(2) } };
    setItems([...items.slice(0, idx + 1), copy, ...items.slice(idx + 1)]);
  }
  function add() {
    setItems([...items, { kind: "rule", rule: newRule(cols, target) }]);
  }

  return (
    <div>
      <div className="space-y-4">
        {items.map((it, idx) =>
          it.kind === "rule" ? (
            <RuleCard
              key={it.rule.id}
              index={++n}
              rule={it.rule}
              cols={cols}
              target={target}
              onChange={(r) => update(idx, r)}
              onDelete={() => remove(idx)}
              onDuplicate={() => duplicate(idx)}
            />
          ) : null
        )}
      </div>

      <button
        onClick={add}
        className="mt-5 border border-line text-muted hover:text-accent hover:border-accent px-4 py-2.5 text-sm"
      >
        + Add a rule
      </button>

      {builtinCount > 0 && (
        <p className="mt-4 text-xs text-faint">
          + {builtinCount} built-in rule{builtinCount > 1 ? "s" : ""} kept as-is (base rates, limits,
          and derived fields). Open the JSON tab to see everything.
        </p>
      )}
    </div>
  );
}

function RuleCard({
  index,
  rule,
  cols,
  target,
  onChange,
  onDelete,
  onDuplicate,
}: {
  index: number;
  rule: Rule;
  cols: ColMeta[];
  target?: string;
  onChange: (r: Rule) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  function setCond(i: number, c: Condition) {
    onChange({ ...rule, conditions: rule.conditions.map((x, j) => (j === i ? c : x)) });
  }
  function addCond() {
    const first = cols.find((c) => c.numeric) ?? cols[0];
    onChange({
      ...rule,
      conditions: [
        ...rule.conditions,
        { id: Math.random().toString(36).slice(2), column: first?.name ?? "", op: operatorsFor(first)[0], value: "" },
      ],
    });
  }
  function removeCond(i: number) {
    onChange({ ...rule, conditions: rule.conditions.filter((_, j) => j !== i) });
  }

  return (
    <div className="border border-line bg-surface/40">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <span className="font-mono text-xs text-faint">RULE {index}</span>
        <div className="flex gap-4 text-xs">
          <button onClick={onDuplicate} className="text-faint hover:text-fg">
            Duplicate
          </button>
          <button onClick={onDelete} className="text-faint hover:text-fail">
            Delete
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* IF */}
        <div>
          <span className="font-mono text-[11px] text-accent tracking-widest">IF</span>
          <div className="mt-2 space-y-2">
            {rule.conditions.length === 0 && (
              <p className="text-sm text-faint">Always (no condition).</p>
            )}
            {rule.conditions.map((c, i) => (
              <div key={c.id}>
                {i > 0 && (
                  <button
                    onClick={() => onChange({ ...rule, join: rule.join === "and" ? "or" : "and" })}
                    className="mb-2 font-mono text-[11px] text-muted hover:text-accent uppercase"
                  >
                    {rule.join}
                  </button>
                )}
                <ConditionRow
                  cols={cols}
                  cond={c}
                  onChange={(nc) => setCond(i, nc)}
                  onRemove={() => removeCond(i)}
                />
              </div>
            ))}
          </div>
          <button onClick={addCond} className="mt-2 text-xs text-faint hover:text-accent">
            + add condition
          </button>
        </div>

        {/* THEN */}
        <div>
          <span className="font-mono text-[11px] text-accent tracking-widest">THEN</span>
          <div className="mt-2">
            <EffectRow
              cols={cols}
              target={target}
              effect={rule.effect}
              onChange={(e) => onChange({ ...rule, effect: e })}
            />
          </div>
        </div>

        <p className="border-t border-line pt-3 text-xs text-muted italic">
          {ruleToEnglish(rule, target)}
        </p>
      </div>
    </div>
  );
}

function ConditionRow({
  cols,
  cond,
  onChange,
  onRemove,
}: {
  cols: ColMeta[];
  cond: Condition;
  onChange: (c: Condition) => void;
  onRemove: () => void;
}) {
  const meta = metaOf(cols, cond.column);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={cond.column}
        onChange={(v) => {
          const m = metaOf(cols, v);
          onChange({ ...cond, column: v, op: operatorsFor(m)[0], value: defaultValue(m) });
        }}
        options={cols.map((c) => ({ value: c.name, label: label(c.name) }))}
      />
      <Select
        value={cond.op}
        onChange={(v) => onChange({ ...cond, op: v as Condition["op"] })}
        options={operatorsFor(meta).map((o) => ({ value: o, label: OP_LABEL[o] }))}
      />
      <ValueField meta={meta} value={cond.value} onChange={(v) => onChange({ ...cond, value: v })} />
      <button onClick={onRemove} className="text-faint hover:text-fail text-sm px-1" aria-label="remove condition">
        ×
      </button>
    </div>
  );
}

function EffectRow({
  cols,
  target,
  effect,
  onChange,
}: {
  cols: ColMeta[];
  target?: string;
  effect: Effect;
  onChange: (e: Effect) => void;
}) {
  const isRisk = effect.column === RISK;
  const meta = isRisk ? undefined : metaOf(cols, effect.column);
  const colOptions = [
    ...(target ? [{ value: RISK, label: `${label(target)} likelihood` }] : []),
    ...cols.map((c) => ({ value: c.name, label: label(c.name) })),
  ];
  const actionOptions: EffectKind[] = isRisk ? ["more_likely", "less_likely"] : effectsFor(meta);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={effect.column}
        onChange={(v) => {
          const risk = v === RISK;
          const m = risk ? undefined : metaOf(cols, v);
          const kind: EffectKind = risk ? "more_likely" : effectsFor(m)[0];
          onChange({ column: v, kind, value: risk ? "" : defaultValue(m) });
        }}
        options={colOptions}
      />
      <Select
        value={effect.kind}
        onChange={(v) => onChange({ ...effect, kind: v as EffectKind, value: "" })}
        options={actionOptions.map((a) => ({ value: a, label: EFFECT_LABEL[a] }))}
      />
      {isRisk ? (
        <PercentField value={effect.value} onChange={(v) => onChange({ ...effect, value: v })} />
      ) : effect.kind === "set_to" ? (
        <ValueField meta={meta} value={effect.value} onChange={(v) => onChange({ ...effect, value: v })} />
      ) : (
        <NumberField
          value={effect.value}
          onChange={(v) => onChange({ ...effect, value: v })}
          suffix={effect.kind === "increase_pct" || effect.kind === "decrease_pct" ? "%" : ""}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-surface border border-line px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ValueField({
  meta,
  value,
  onChange,
}: {
  meta?: ColMeta;
  value: string;
  onChange: (v: string) => void;
}) {
  if (meta && meta.values) {
    return (
      <Select
        value={value || meta.values[0]}
        onChange={onChange}
        options={meta.values.map((v) => ({ value: v, label: v }))}
      />
    );
  }
  if (meta && meta.type === "binary") {
    return (
      <Select
        value={value || "1"}
        onChange={onChange}
        options={[
          { value: "1", label: "Yes" },
          { value: "0", label: "No" },
        ]}
      />
    );
  }
  return <NumberField value={value} onChange={onChange} />;
}

function NumberField({
  value,
  onChange,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <span className="inline-flex items-center">
      <input
        type="number"
        value={value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface border border-line px-2 py-1.5 w-24 text-sm tabular text-fg outline-none focus:border-accent"
      />
      {suffix && <span className="ml-1 text-sm text-faint">{suffix}</span>}
    </span>
  );
}

function PercentField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <NumberField value={value} onChange={onChange} suffix="%" />;
}

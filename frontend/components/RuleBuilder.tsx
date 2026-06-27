"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  isDateType,
  isTextType,
  label,
  metaOf,
  newRule,
  operatorsFor,
  ruleToEnglish,
} from "@/lib/rules";

const uid = () => Math.random().toString(36).slice(2);

// Move the dragged rule into its new slot while leaving any non-editable
// built-in rules pinned where they are (they fill the non-rule positions).
function reorderRules(items: Item[], activeId: string, overId: string): Item[] {
  const ruleItems = items.filter((it) => it.kind === "rule");
  const from = ruleItems.findIndex((it) => it.kind === "rule" && it.rule.id === activeId);
  const to = ruleItems.findIndex((it) => it.kind === "rule" && it.rule.id === overId);
  if (from < 0 || to < 0) return items;
  const moved = arrayMove(ruleItems, from, to);
  let k = 0;
  return items.map((it) => (it.kind === "rule" ? moved[k++] : it));
}

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
  // dnd-kit assigns global ids that drift between SSR and the client, so we
  // only enable drag-and-drop after mount. Server + first paint show static
  // handles, which keeps hydration clean.
  const [dnd, setDnd] = useState(false);
  useEffect(() => setDnd(true), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const builtinCount = items.filter((it) => it.kind === "builtin").length;
  const ruleIds = items.flatMap((it) => (it.kind === "rule" ? [it.rule.id] : []));

  function update(id: string, rule: Rule) {
    setItems(items.map((it) => (it.kind === "rule" && it.rule.id === id ? { kind: "rule", rule } : it)));
  }
  function remove(id: string) {
    setItems(items.filter((it) => !(it.kind === "rule" && it.rule.id === id)));
  }
  function duplicate(id: string) {
    const idx = items.findIndex((it) => it.kind === "rule" && it.rule.id === id);
    const it = items[idx];
    if (!it || it.kind !== "rule") return;
    const copy: Item = { kind: "rule", rule: cloneRule(it.rule) };
    setItems([...items.slice(0, idx + 1), copy, ...items.slice(idx + 1)]);
  }
  function add() {
    setItems([...items, { kind: "rule", rule: newRule(cols, target) }]);
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setItems(reorderRules(items, String(active.id), String(over.id)));
    }
  }

  let n = 0;
  const cards = items.map((it) => {
    if (it.kind !== "rule") return null;
    const index = ++n;
    const common = {
      index,
      rule: it.rule,
      cols,
      target,
      dnd,
      onChange: (r: Rule) => update(it.rule.id, r),
      onDelete: () => remove(it.rule.id),
      onDuplicate: () => duplicate(it.rule.id),
    };
    return dnd ? (
      <SortableRuleCard key={it.rule.id} {...common} />
    ) : (
      <RuleCard key={it.rule.id} {...common} handle={<StaticHandle />} />
    );
  });

  const list = <div className="space-y-4">{cards}</div>;

  return (
    <div>
      {dnd ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ruleIds} strategy={verticalListSortingStrategy}>
            {list}
          </SortableContext>
        </DndContext>
      ) : (
        list
      )}

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

function cloneRule(rule: Rule): Rule {
  return {
    ...rule,
    id: uid(),
    conditions: rule.conditions.map((c) => ({ ...c, id: uid() })),
  };
}

// --------------------------------------------------------------------------- //
// Drag handle
// --------------------------------------------------------------------------- //
type Sortable = ReturnType<typeof useSortable>;

function StaticHandle() {
  return <span className="touch-none select-none text-faint leading-none">⠿</span>;
}

function Handle({
  setRef,
  listeners,
  attributes,
  label: aria,
}: {
  setRef?: (el: HTMLElement | null) => void;
  listeners?: Sortable["listeners"];
  attributes?: Sortable["attributes"];
  label: string;
}) {
  return (
    <button
      type="button"
      ref={setRef}
      {...attributes}
      {...listeners}
      aria-label={aria}
      title="Drag to reorder"
      className="cursor-grab active:cursor-grabbing touch-none select-none text-faint hover:text-accent leading-none"
    >
      ⠿
    </button>
  );
}

// --------------------------------------------------------------------------- //
// Rules (sortable)
// --------------------------------------------------------------------------- //
type RuleCardProps = {
  index: number;
  rule: Rule;
  cols: ColMeta[];
  target?: string;
  dnd: boolean;
  onChange: (r: Rule) => void;
  onDelete: () => void;
  onDuplicate: () => void;
};

function SortableRuleCard(props: RuleCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.rule.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : undefined,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style}>
      <RuleCard
        {...props}
        handle={
          <Handle
            setRef={setActivatorNodeRef}
            listeners={listeners}
            attributes={attributes}
            label={`reorder rule ${props.index}`}
          />
        }
      />
    </div>
  );
}

function RuleCard({
  index,
  rule,
  cols,
  target,
  dnd,
  onChange,
  onDelete,
  onDuplicate,
  handle,
}: RuleCardProps & { handle: ReactNode }) {
  const condSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const condIds = rule.conditions.map((c) => c.id);

  function setCond(id: string, c: Condition) {
    onChange({ ...rule, conditions: rule.conditions.map((x) => (x.id === id ? c : x)) });
  }
  function addCond() {
    const first = cols.find((c) => c.numeric) ?? cols[0];
    onChange({
      ...rule,
      conditions: [
        ...rule.conditions,
        { id: uid(), column: first?.name ?? "", op: operatorsFor(first)[0], value: "" },
      ],
    });
  }
  function removeCond(id: string) {
    onChange({ ...rule, conditions: rule.conditions.filter((x) => x.id !== id) });
  }
  function toggleJoin() {
    onChange({ ...rule, join: rule.join === "and" ? "or" : "and" });
  }
  function onCondDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = rule.conditions.findIndex((c) => c.id === active.id);
    const to = rule.conditions.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;
    onChange({ ...rule, conditions: arrayMove(rule.conditions, from, to) });
  }

  const conditionRows = rule.conditions.map((c, i) =>
    dnd ? (
      <SortableCondition
        key={c.id}
        cond={c}
        cols={cols}
        join={i > 0 ? rule.join : undefined}
        onToggleJoin={toggleJoin}
        onChange={(nc) => setCond(c.id, nc)}
        onRemove={() => removeCond(c.id)}
      />
    ) : (
      <div key={c.id}>
        {i > 0 && <JoinToggle join={rule.join} onToggle={toggleJoin} />}
        <ConditionRow
          cols={cols}
          cond={c}
          onChange={(nc) => setCond(c.id, nc)}
          onRemove={() => removeCond(c.id)}
          handle={<StaticHandle />}
        />
      </div>
    )
  );

  return (
    <div className="border border-line bg-surface/40">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <span className="flex items-center gap-2.5">
          {handle}
          <span className="font-mono text-xs text-faint">RULE {index}</span>
        </span>
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
            {dnd ? (
              <DndContext sensors={condSensors} collisionDetection={closestCenter} onDragEnd={onCondDragEnd}>
                <SortableContext items={condIds} strategy={verticalListSortingStrategy}>
                  {conditionRows}
                </SortableContext>
              </DndContext>
            ) : (
              conditionRows
            )}
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

// --------------------------------------------------------------------------- //
// Conditions (sortable)
// --------------------------------------------------------------------------- //
function JoinToggle({ join, onToggle }: { join: "and" | "or"; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="mb-2 font-mono text-[11px] text-muted hover:text-accent uppercase"
    >
      {join}
    </button>
  );
}

function SortableCondition({
  cond,
  cols,
  join,
  onToggleJoin,
  onChange,
  onRemove,
}: {
  cond: Condition;
  cols: ColMeta[];
  join?: "and" | "or";
  onToggleJoin: () => void;
  onChange: (c: Condition) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: cond.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {join && <JoinToggle join={join} onToggle={onToggleJoin} />}
      <ConditionRow
        cols={cols}
        cond={cond}
        onChange={onChange}
        onRemove={onRemove}
        handle={
          <Handle
            setRef={setActivatorNodeRef}
            listeners={listeners}
            attributes={attributes}
            label="reorder condition"
          />
        }
      />
    </div>
  );
}

function ConditionRow({
  cols,
  cond,
  onChange,
  onRemove,
  handle,
}: {
  cols: ColMeta[];
  cond: Condition;
  onChange: (c: Condition) => void;
  onRemove: () => void;
  handle: ReactNode;
}) {
  const meta = metaOf(cols, cond.column);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {handle}
      <Select
        value={cond.column}
        onChange={(v) => {
          const m = metaOf(cols, v);
          onChange({ ...cond, column: v, op: operatorsFor(m)[0], value: defaultValue(m), value2: undefined });
        }}
        options={cols.map((c) => ({ value: c.name, label: label(c.name) }))}
      />
      <Select
        value={cond.op}
        onChange={(v) => {
          const op = v as Condition["op"];
          const next: Condition = { ...cond, op };
          if (op === "between") {
            if (!next.value) next.value = defaultValue(meta);
            if (!next.value2) next.value2 = defaultValue(meta);
          }
          onChange(next);
        }}
        options={operatorsFor(meta).map((o) => ({ value: o, label: OP_LABEL[o] }))}
      />
      {cond.op === "between" ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          <ValueField meta={meta} value={cond.value} onChange={(v) => onChange({ ...cond, value: v })} />
          <span className="text-sm text-faint">and</span>
          <ValueField meta={meta} value={cond.value2 ?? ""} onChange={(v) => onChange({ ...cond, value2: v })} />
        </span>
      ) : (
        <ValueField meta={meta} value={cond.value} onChange={(v) => onChange({ ...cond, value: v })} />
      )}
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
  if (isDateType(meta)) {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface border border-line px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
      />
    );
  }
  if (isTextType(meta)) {
    return (
      <input
        type="text"
        value={value}
        placeholder="text"
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface border border-line px-2 py-1.5 w-40 text-sm text-fg outline-none focus:border-accent"
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

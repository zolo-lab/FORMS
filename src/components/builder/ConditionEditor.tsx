"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { OP_LABELS, coerceRuleValue, fromRuleSet, needsValue, toRuleSet, type Rule } from "@/lib/forms/condition-ui";
import type { ComparisonOp, Condition, FormDefinition, FormField } from "@/lib/forms/schema";
import { comparisonOps } from "@/lib/forms/schema";
import { pickerLabels } from "@/lib/forms/builder";
import { allFields } from "@/lib/forms/schema";
import { revealRule } from "@/lib/forms/dependents";
import { FieldPicker } from "./FieldPicker";
import { resolveOptions } from "@/lib/forms/lookups";

export function ConditionEditor({
  def, selfId, value, onChange, lead,
}: {
  def: FormDefinition;
  selfId?: string;
  value: Condition | undefined;
  onChange: (c: Condition | undefined) => void;
  /** Sentence start, e.g. "הצג שדה זה אם". */
  lead: string;
}) {
  const set = toRuleSet(value);
  // A new rule has no field yet, so it is not part of the condition until one is picked.
  const [adding, setAdding] = useState(false);
  if (!set) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">התנאי מורכב מדי לעורך הוויזואלי ונשמר כפי שהוא. ניתן לערוך אותו בטאב JSON.</p>
        <Button variant="outline" size="sm" onClick={() => onChange(undefined)}>מחיקת התנאי</Button>
      </div>
    );
  }
  const candidates = allFields(def).filter((f) => f.id !== selfId && FIELD_TYPE_META[f.type].hasAnswer);
  const byId = new Map(candidates.map((f) => [f.id, f]));
  const names = pickerLabels(candidates);
  const update = (rules: Rule[], mode = set.mode) => onChange(fromRuleSet({ mode, rules }));
  const patch = (i: number, r: Partial<Rule>) => update(set.rules.map((x, j) => (j === i ? { ...x, ...r } : x)));
  /**
   * The rule a new pick starts with: "filled" (a box: "ticked", yes/no: "yes"), the common iForms case of
   * «אם השדה מולא – פתח». A multiple-choice answer is a list: "שווה ל" never matches it, "מכיל" does.
   */
  const startRule = (id: string): Rule => {
    const f = byId.get(id);
    if (!f) return { field: id, op: "eq" };
    if (f.type === "checkboxes") return { field: id, op: "contains" };
    if (FIELD_TYPE_META[f.type].hasOptions) return { field: id, op: "eq" };
    return revealRule(f) as Rule;
  };

  return (
    <div className="space-y-2">
      {set.rules.length === 0 && <p className="text-sm text-muted-foreground">ללא תנאי: {lead.includes("הצג") ? "מוצג תמיד" : lead.includes("נעל") ? "השדה פתוח לעריכה" : "לא חובה"}.</p>}
      {set.rules.map((r, i) => {
        const target = byId.get(r.field);
        return (
          <div key={i} className="space-y-1.5 rounded-md border p-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="shrink-0 text-muted-foreground">{i === 0 ? lead : set.mode === "all" ? "וגם" : "או"}</span>
              <FieldPicker
                key={`${i}:${r.field}`}
                label="שדה"
                fields={candidates.map((f) => ({ id: f.id, label: names.get(f.id) ?? f.label }))}
                value={r.field}
                onPick={(id) => { if (id !== r.field) update(set.rules.map((x, j) => (j === i ? startRule(id) : x))); }}
              />
              <Button variant="ghost" size="sm" aria-label="הסרת תנאי" onClick={() => update(set.rules.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
            </div>
            <div className="flex gap-2">
              <Select aria-label="פעולה" value={r.op} onChange={(e) => patch(i, { op: e.target.value as ComparisonOp })} className="h-9">
                {comparisonOps.map((op) => <option key={op} value={op}>{OP_LABELS[op]}</option>)}
              </Select>
              {needsValue(r.op) && <ValueInput target={target} rule={r} lookups={undefined} onChange={(v) => patch(i, { value: v })} />}
            </div>
          </div>
        );
      })}
      {adding && (
        <div className="flex items-center gap-2 rounded-md border border-dashed p-2 text-sm">
          <span className="shrink-0 text-muted-foreground">{set.rules.length === 0 ? lead : set.mode === "all" ? "וגם" : "או"}</span>
          <FieldPicker
            label="שדה לתנאי חדש"
            fields={candidates.map((f) => ({ id: f.id, label: names.get(f.id) ?? f.label }))}
            onPick={(id) => { setAdding(false); update([...set.rules, startRule(id)]); }}
          />
          <Button variant="ghost" size="sm" aria-label="ביטול" onClick={() => setAdding(false)}><Trash2 className="size-4" /></Button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={candidates.length === 0 || adding} onClick={() => setAdding(true)}><Plus className="size-4" />הוספת תנאי</Button>
        {candidates.length === 0 && <p className="text-xs text-muted-foreground">אין עדיין שדה אחר שאפשר להתנות בו.</p>}
        {set.rules.length > 1 && (
          <Select aria-label="קשר בין התנאים" value={set.mode} onChange={(e) => update(set.rules, e.target.value as "all" | "any")} className="h-8 w-auto">
            <option value="all">כל התנאים (וגם)</option>
            <option value="any">אחד מהתנאים (או)</option>
          </Select>
        )}
      </div>
    </div>
  );
}

function ValueInput({ target, rule, onChange }: { target?: FormField; rule: Rule; lookups?: undefined; onChange: (v: unknown) => void }) {
  // Choosing one option also fits "מכיל" / "לא מכיל" of a multiple-choice field.
  const single = rule.op === "eq" || rule.op === "neq" || ((rule.op === "contains" || rule.op === "notContains") && target?.type === "checkboxes");
  if (single && target?.type === "yes_no") {
    return (
      <Select aria-label="ערך" value={String(rule.value ?? "")} onChange={(e) => onChange(e.target.value)} className="h-9">
        <option value="">בחר…</option><option value="yes">כן</option><option value="no">לא</option>
      </Select>
    );
  }
  if (single && target && FIELD_TYPE_META[target.type].hasOptions) {
    const options = resolveOptions(target);
    if (options.length) {
      return (
        <Select aria-label="ערך" value={String(rule.value ?? "")} onChange={(e) => onChange(e.target.value)} className="h-9">
          <option value="">בחר…</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      );
    }
  }
  if (single && target?.type === "consent") {
    return (
      <Select aria-label="ערך" value={String(rule.value ?? "")} onChange={(e) => onChange(e.target.value === "true")} className="h-9">
        <option value="">בחר…</option><option value="true">מסומן</option><option value="false">לא מסומן</option>
      </Select>
    );
  }
  const shown = Array.isArray(rule.value) ? rule.value.join(", ") : String(rule.value ?? "");
  return <Input aria-label="ערך" className="h-9" value={shown} onChange={(e) => onChange(coerceRuleValue(rule.op, e.target.value))} placeholder={rule.op === "in" || rule.op === "notIn" ? "ערכים מופרדים בפסיק" : "ערך"} />;
}

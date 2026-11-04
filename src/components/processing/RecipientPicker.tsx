"use client";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { recipientLabel, type ProcessingContext } from "@/lib/processing/model";
import type { RecipientRef } from "@/lib/processing/types";
import { RECIPIENT_LABELS, type RecipientKind } from "@/lib/notifications/triggers";
import { isValidEmail } from "@/lib/validators/israeli";
import type { StepRole } from "@/lib/workflow/types";

/** The roles a processing e-mail may go to (the ones that mean a person of this request). */
const ROLES: RecipientKind[] = ["employee", "creator", "secretariat", "bookkeeping", "managers"];

type AddKind = "fixed" | "role" | "user" | "step" | "field";

/**
 * Who an e-mail destination goes to: chips for what is already chosen, and one row to add another.
 * `fixedOnly` is the completion card, whose addresses are stored in the package column.
 */
export function RecipientPicker({
  value, onChange, ctx, fixedOnly = false, idPrefix,
}: {
  value: RecipientRef[];
  onChange: (next: RecipientRef[]) => void;
  ctx: ProcessingContext;
  fixedOnly?: boolean;
  idPrefix: string;
}) {
  const [kind, setKind] = useState<AddKind>("fixed");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);

  const kinds: { id: AddKind; label: string; options?: { id: string; label: string }[] }[] = [
    { id: "fixed", label: "כתובת מייל" },
    ...(fixedOnly ? [] : [
      { id: "role" as const, label: "תפקיד בבקשה", options: ROLES.map((r) => ({ id: r, label: RECIPIENT_LABELS[r] })) },
      { id: "step" as const, label: "מי שחתם בשלב", options: (ctx.steps ?? []).map((s) => ({ id: s.role, label: s.label })) },
      { id: "field" as const, label: "המייל שמולא בשדה", options: (ctx.emailFields ?? []).map((f) => ({ id: f.id, label: f.label })) },
      { id: "user" as const, label: "משתמש במערכת", options: ctx.users ?? [] },
    ]),
  ];
  const current = kinds.find((k) => k.id === kind) ?? kinds[0]!;
  const options = current.options ?? [];

  const same = (a: RecipientRef, b: RecipientRef) => JSON.stringify(a) === JSON.stringify(b);
  function add() {
    let ref: RecipientRef;
    if (kind === "fixed") {
      const mail = email.trim().toLowerCase();
      if (!isValidEmail(mail)) { setError("כתובת מייל לא תקינה"); return; }
      ref = { kind: "fixed", name: name.trim() || mail, email: mail };
    } else {
      if (!pick) { setError("יש לבחור"); return; }
      ref = kind === "role" ? { kind: "role", role: pick as RecipientKind }
        : kind === "step" ? { kind: "step", role: pick as StepRole }
        : kind === "field" ? { kind: "field", fieldId: pick }
        : { kind: "user", userId: pick };
    }
    setError(null);
    if (!value.some((v) => same(v, ref))) onChange([...value, ref]);
    setEmail(""); setName(""); setPick("");
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((ref, i) => {
            const label = recipientLabel(ref, ctx);
            const gone = label.endsWith("שנמחק");
            return (
              <li key={`${JSON.stringify(ref)}-${i}`}>
                <span className={cn("inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm", gone ? "border-destructive text-destructive" : "bg-secondary")}>
                  {label}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={`הסרת ${label}`}
                    onClick={() => onChange(value.filter((_, j) => j !== i))}
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {kinds.length > 1 && (
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-kind`}>סוג נמען</Label>
            <Select id={`${idPrefix}-kind`} value={kind} onChange={(e) => { setKind(e.target.value as AddKind); setPick(""); setError(null); }} className="w-44">
              {kinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </Select>
          </div>
        )}
        {kind === "fixed" ? (
          <>
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-email`}>כתובת</Label>
              <Input id={`${idPrefix}-email`} type="email" dir="ltr" value={email} className="w-56"
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-name`}>שם (לא חובה)</Label>
              <Input id={`${idPrefix}-name`} value={name} className="w-40" onChange={(e) => setName(e.target.value)} />
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-pick`}>{current.label}</Label>
            <Select id={`${idPrefix}-pick`} value={pick} onChange={(e) => { setPick(e.target.value); setError(null); }} className="w-56">
              <option value="">בחרו…</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
          </div>
        )}
        <Button type="button" variant="outline" onClick={add} disabled={kind !== "fixed" && options.length === 0}>
          <Plus className="size-4" aria-hidden />הוספה
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {kind !== "fixed" && options.length === 0 && <p className="text-xs text-muted-foreground">אין מה לבחור כאן עדיין.</p>}
    </div>
  );
}

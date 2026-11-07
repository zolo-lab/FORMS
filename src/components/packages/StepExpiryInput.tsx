"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExpiryRule } from "@/lib/requests/expiry";

type Option = { id: string; label: string };
type Kind = ExpiryRule["kind"] | "inherit";

const KINDS: { kind: Kind; label: string }[] = [
  { kind: "inherit", label: "כמו בהגדרות הטופס" },
  { kind: "none", label: "ללא תוקף" },
  { kind: "days", label: "מספר ימים מתחילת השלב" },
  { kind: "dayOfNextMonth", label: "יום בחודש שאחרי תאריך" },
  { kind: "dayOfMonth", label: "יום בחודש לפי תאריך (אותו חודש או הבא)" },
];

/** A rule being edited: the date field may still be empty (shown as a problem until chosen). */
export type DraftRule = ExpiryRule | undefined;

/** What is missing in a rule, for the step's problem list. */
export function expiryProblem(rule: DraftRule): string | null {
  if (!rule) return null;
  if (rule.kind === "days" && !(rule.days >= 1)) return "תוקף הקישור: מספר הימים חייב להיות 1 ומעלה";
  if ((rule.kind === "dayOfNextMonth" || rule.kind === "dayOfMonth") && !rule.dateFieldId) return "תוקף הקישור: בחרו את שדה התאריך";
  return null;
}

function switchKind(kind: Kind, prev: DraftRule, dateFields: Option[]): DraftRule {
  const day = prev && "day" in prev ? prev.day : kind === "dayOfMonth" ? 20 : 7;
  const dateFieldId = prev && "dateFieldId" in prev ? prev.dateFieldId : (dateFields[0]?.id ?? "");
  if (kind === "inherit") return undefined;
  if (kind === "none") return { kind: "none" };
  if (kind === "days") return { kind: "days", days: prev?.kind === "days" ? prev.days : 7 };
  return { kind, day, dateFieldId };
}

/** One rule: the kind, then only the inputs that kind needs. */
function RuleFields({ id, rule, onChange, dateFields, noInherit }: { id: string; rule: DraftRule; onChange: (r: DraftRule) => void; dateFields: Option[]; noInherit?: boolean }) {
  const kind: Kind = rule?.kind ?? "inherit";
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,1fr)]">
      <div className="space-y-1">
        <Label htmlFor={`${id}-kind`}>תוקף הקישור</Label>
        <Select id={`${id}-kind`} value={kind} onChange={(e) => onChange(switchKind(e.target.value as Kind, rule, dateFields))}>
          {KINDS.filter((k) => !noInherit || k.kind !== "inherit").map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </Select>
      </div>
      {rule?.kind === "days" && (
        <div className="space-y-1">
          <Label htmlFor={`${id}-days`}>ימים</Label>
          <Input id={`${id}-days`} type="number" min={1} max={365} inputMode="numeric" value={rule.days || ""} onChange={(e) => onChange({ kind: "days", days: Math.round(Number(e.target.value)) })} />
        </div>
      )}
      {(rule?.kind === "dayOfNextMonth" || rule?.kind === "dayOfMonth") && (
        <>
          <div className="space-y-1">
            <Label htmlFor={`${id}-day`}>יום בחודש</Label>
            <Input id={`${id}-day`} type="number" min={1} max={31} inputMode="numeric" value={rule.day || ""} onChange={(e) => onChange({ ...rule, day: Math.min(31, Math.max(1, Math.round(Number(e.target.value)) || 1)) })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-field`}>לפי שדה התאריך</Label>
            <Select id={`${id}-field`} value={rule.dateFieldId} onChange={(e) => onChange({ ...rule, dateFieldId: e.target.value })} aria-invalid={!rule.dateFieldId || undefined}>
              <option value="">בחרו…</option>
              {rule.dateFieldId && !dateFields.some((f) => f.id === rule.dateFieldId) && <option value={rule.dateFieldId}>שדה שכבר לא קיים</option>}
              {dateFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </Select>
          </div>
        </>
      )}
    </div>
  );
}

const HELP: Partial<Record<Kind, string>> = {
  inherit: "הקישור של השלב פג יחד עם הבקשה, לפי \"תוקף הקישורים\" בהגדרות השליחה.",
  none: "הקישור של השלב לא פג.",
  days: "נספר מהרגע שהשלב מתחיל.",
  dayOfNextMonth: "למשל ה-7 בחודש שאחרי תאריך תחילת העבודה.",
  dayOfMonth: "למשל ה-20: תאריך עד ה-20 בחודש – ה-20 באותו חודש; אחרי ה-20 – ה-20 בחודש הבא.",
};

/**
 * "תוקף הקישור" of one step: after it the step's link no longer opens and the request is marked expired (an admin can
 * extend it). Organizations can have their own rule for the same step.
 */
export function StepExpiryInput({ id, expiry, expiryByOrg, onChange, dateFields, orgs }: {
  id: string;
  expiry: DraftRule;
  expiryByOrg?: Record<string, ExpiryRule>;
  onChange: (p: { expiry?: ExpiryRule; expiryByOrg?: Record<string, ExpiryRule> }) => void;
  dateFields: Option[];
  /** Organizations for exceptions; omitted inside an organization's own route. */
  orgs?: Option[];
}) {
  const exceptions = Object.entries(expiryByOrg ?? {});
  const unused = (orgs ?? []).filter((o) => !expiryByOrg?.[o.id]);
  const setException = (org: string, rule: DraftRule) => {
    const next = { ...(expiryByOrg ?? {}) };
    if (rule) next[org] = rule;
    else delete next[org];
    onChange({ expiry, expiryByOrg: Object.keys(next).length ? next : undefined });
  };
  const renameException = (from: string, to: string) => {
    if (!to || to === from || expiryByOrg?.[to]) return;
    const next: Record<string, ExpiryRule> = {};
    for (const [k, v] of exceptions) next[k === from ? to : k] = v;
    onChange({ expiry, expiryByOrg: next });
  };
  const orgName = (oid: string) => orgs?.find((o) => o.id === oid)?.label ?? "עמותה שכבר לא קיימת";

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <RuleFields id={id} rule={expiry} onChange={(r) => onChange({ expiry: r, expiryByOrg })} dateFields={dateFields} />
      <p className="text-xs text-muted-foreground">{HELP[expiry?.kind ?? "inherit"]}{expiry && expiry.kind !== "none" ? " הקישור נשאר פתוח לפחות 3 ימים מתחילת השלב." : ""}</p>
      {orgs && (
        <details className="group" open={exceptions.length > 0 || undefined}>
          <summary className="cursor-pointer text-sm font-medium text-primary">
            חריגה לפי עמותה{exceptions.length > 0 ? ` (${exceptions.length})` : ""}
          </summary>
          <div className="mt-2 space-y-3">
            {exceptions.map(([org, rule], k) => (
              <div key={org} className="space-y-2 rounded-md bg-muted/40 p-3">
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor={`${id}-org-${k}`}>עמותה</Label>
                    <Select id={`${id}-org-${k}`} value={org} onChange={(e) => renameException(org, e.target.value)}>
                      <option value={org}>{orgName(org)}</option>
                      {unused.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </Select>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => setException(org, undefined)} aria-label={`הסרת החריגה של ${orgName(org)}`}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
                <RuleFields id={`${id}-org-${k}`} rule={rule} onChange={(r) => setException(org, r ?? { kind: "none" })} dateFields={dateFields} noInherit />
              </div>
            ))}
            {unused.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setException(unused[0]!.id, { kind: "dayOfMonth", day: 20, dateFieldId: dateFields[0]?.id ?? "" })}>
                <Plus className="size-4" aria-hidden />הוספת חריגה לעמותה
              </Button>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

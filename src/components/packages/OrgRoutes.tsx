"use client";

import { useState } from "react";
import { Copy, GitBranch, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assignRoles, type StepDraft } from "@/lib/workflow/step-who";
import { stepLabel } from "@/lib/workflow/step-fields";
import type { StepRole } from "@/lib/workflow/types";
import { StepsEditor, type EditorDraft, type EmailField, type StepsSaveState } from "./StepsEditor";

import type { DateFieldOption } from "./ExpiryRuleBuilder";

type Option = { id: string; label: string };
export type SaveRoute = (organizationId: string, drafts: StepDraft[] | null) => Promise<{ ok: true } | { ok: false; errors: string[] }>;

const strip = (e: EditorDraft): StepDraft => { const d: Partial<EditorDraft> = { ...e }; delete d.key; delete d.origRole; return d as StepDraft; };
/**
 * Editable copies of steps. A route of its own already belongs to one organization, so per-organization link-expiry
 * exceptions have no meaning in it (and are not shown here): they are dropped, and the step's own rule is what applies.
 */
const fresh = (drafts: StepDraft[], forOrg?: string): EditorDraft[] =>
  drafts.map((d) => {
    // Copied for one organization: its exception (if it had one) becomes the step's own rule, so nothing changes for it.
    const own = (forOrg && d.expiryByOrg?.[forOrg]) || d.expiry;
    const copy: EditorDraft = { ...d, key: crypto.randomUUID(), origRole: d.role, ...(own ? { expiry: own } : {}) };
    delete copy.expiryByOrg;
    return copy;
  });
const same = (a: EditorDraft[] | null, b: EditorDraft[] | null) => JSON.stringify(a?.map(strip) ?? null) === JSON.stringify(b?.map(strip) ?? null);

/**
 * An organization's route ("מסלול"): its own steps and people, or – without one – the general route. A route can be
 * made from the general one or copied from another organization's, then edited (another manager, one more step).
 */
export function OrgRoutes({
  org, orgs, routes, fallback, contacts, groups, emailFields, dateFields, defaultExpiry, general, heldRoles, save, onRoutesChange,
}: {
  dateFields?: DateFieldOption[];
  defaultExpiry?: string;
  /**
   * The general route, editable for this organization's link expiry only (an organization – not a project – that
   * follows it). Saved with the general route.
   */
  general?: { drafts: EditorDraft[]; onChange: (next: EditorDraft[]) => void; onSave: () => void; dirty: boolean; state: StepsSaveState; waitingForForm: boolean };
  org: Option;
  orgs: Option[];
  /** Saved routes, per organization id. */
  routes: Record<string, StepDraft[]>;
  /** What it follows without a route of its own (the general route, or – for a project – its organization's). */
  fallback: { label: string; drafts: StepDraft[] };
  contacts: Option[];
  groups: Option[];
  emailFields: EmailField[];
  /** Roles of the form's fields: a new step never takes one of them over. */
  heldRoles: StepRole[];
  save: SaveRoute;
  onRoutesChange: (routes: Record<string, StepDraft[]>) => void;
}) {
  const [work, setWork] = useState<Record<string, EditorDraft[] | null>>(() => Object.fromEntries(orgs.map((o) => [o.id, routes[o.id] ? fresh(routes[o.id]!) : null])));
  const [saved, setSaved] = useState(work);
  const [state, setState] = useState<Record<string, StepsSaveState>>({});
  const [copyFrom, setCopyFrom] = useState("");
  const [copyTo, setCopyTo] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const mine = work[org.id] ?? null;
  const dirty = !same(mine, saved[org.id] ?? null);
  const withRoute = orgs.filter((o) => o.id !== org.id && work[o.id]);
  const ctx = { contacts, groups, fields: emailFields };

  const setMine = (next: EditorDraft[] | null, forOrg = org.id) => {
    setWork((w) => ({ ...w, [forOrg]: next }));
    setState((s) => ({ ...s, [forOrg]: { kind: "idle" } }));
  };
  const change = (next: EditorDraft[]) => {
    const general = heldRoles.filter((r) => !next.some((d) => d.role === r));
    setMine(assignRoles(next, general));
  };
  async function persist(next: EditorDraft[] | null, forOrg = org.id) {
    setState((s) => ({ ...s, [forOrg]: { kind: "saving" } }));
    const r = await save(forOrg, next ? next.map(strip) : null);
    if (!r.ok) {
      setState((s) => ({ ...s, [forOrg]: { kind: "error", errors: r.errors } }));
      return;
    }
    setWork((w) => ({ ...w, [forOrg]: next }));
    setSaved((w) => ({ ...w, [forOrg]: next }));
    setState((s) => ({ ...s, [forOrg]: { kind: "saved" } }));
    const all: Record<string, StepDraft[]> = {};
    for (const o of orgs) {
      const w = o.id === forOrg ? next : (saved[o.id] ?? null);
      if (w) all[o.id] = w.map(strip);
    }
    onRoutesChange(all);
  }

  if (!mine) {
    return (
      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary" aria-hidden><GitBranch className="size-5" /></span>
          <div className="min-w-0 space-y-1">
            <h3 className="font-semibold">{org.label} עובדת לפי {fallback.label}</h3>
            <p className="text-sm text-muted-foreground">כשצריך אצלה מנהלים אחרים או שלב נוסף, יוצרים לה מסלול משלה. אפשר להתחיל מהמסלול הכללי או לשכפל מסלול של עמותה אחרת ולשנות רק את השמות.</p>
          </div>
        </div>
        {general ? (
          <>
            <p className="text-sm">אפשר לתת ל{org.label} תוקף קישור משלה לכל שלב, בלי מסלול נפרד: לחצו על &quot;תוקף הקישור&quot; בשורה.</p>
            <StepsEditor
              drafts={general.drafts}
              onChange={general.onChange}
              contacts={contacts}
              groups={groups}
              emailFields={emailFields}
              dateFields={dateFields}
              defaultExpiry={defaultExpiry}
              dirty={general.dirty}
              state={general.state}
              onSave={general.onSave}
              waitingForForm={general.waitingForForm}
              orgView={org}
            />
          </>
        ) : (
          <ol className="space-y-1 rounded-md bg-muted/40 p-3 text-sm">
            {fallback.drafts.map((d, i) => <li key={i}>{stepLabel(d, i, ctx)}</li>)}
          </ol>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <Button type="button" onClick={() => setMine(fresh(fallback.drafts, org.id))}>
            <GitBranch className="size-4" aria-hidden />מסלול נפרד ל{org.label} (מ{fallback.label})
          </Button>
          {withRoute.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="copy-from">או שכפול מהמסלול של</Label>
                <Select id="copy-from" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="min-w-44">
                  <option value="">בחרו עמותה…</option>
                  {withRoute.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </Select>
              </div>
              <Button type="button" variant="outline" disabled={!copyFrom} onClick={() => setMine(fresh(work[copyFrom]!.map(strip)))}>
                <Copy className="size-4" aria-hidden />שכפול
              </Button>
            </div>
          )}
        </div>
      </Card>
    );
  }

  const others = orgs.filter((o) => o.id !== org.id);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-card p-3">
        <div className="min-w-0">
          <p className="font-semibold">המסלול של {org.label}</p>
          <p className="text-sm text-muted-foreground">בקשות של {org.label} עוברות בשלבים האלה, במקום {fallback.label}.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="copy-to">שכפול לעמותה</Label>
            <Select id="copy-to" value={copyTo} onChange={(e) => setCopyTo(e.target.value)} className="min-w-40">
              <option value="">בחרו…</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.label}{work[o.id] ? " (תוחלף)" : ""}</option>)}
            </Select>
          </div>
          <Button type="button" variant="outline" disabled={!copyTo || dirty} title={dirty ? "שמרו קודם את המסלול" : undefined} onClick={async () => { const to = copyTo; await persist(fresh(mine.map(strip)), to); setCopied(orgs.find((o) => o.id === to)?.label ?? null); setCopyTo(""); }}>
            <Copy className="size-4" aria-hidden />שכפול
          </Button>
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm(`למחוק את המסלול של ${org.label}? הבקשות החדשות יעברו ב${fallback.label}.`)) void persist(null); }}>
            <Trash2 className="size-4" aria-hidden />חזרה ל{fallback.label}
          </Button>
        </div>
      </div>
      {copied && <p role="status" className="text-sm text-success">המסלול שוכפל ל{copied}. אפשר לעבור ללשונית שלה ולשנות שם את המנהלים.</p>}
      <StepsEditor
        drafts={mine}
        onChange={change}
        contacts={contacts}
        groups={groups}
        emailFields={emailFields}
        dateFields={dateFields}
        defaultExpiry={defaultExpiry}
        dirty={dirty}
        state={state[org.id] ?? { kind: "idle" }}
        onSave={() => void persist(mine)}
        waitingForForm={false}
      />
    </div>
  );
}

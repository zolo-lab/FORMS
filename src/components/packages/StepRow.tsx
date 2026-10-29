"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import { PERSON_ROLES, STEP_WHO, STEP_WHO_LABELS, stepFields, stepWhoOf, type StepWho } from "@/lib/workflow/step-who";
import type { StepRole, WorkflowStep } from "@/lib/workflow/types";

type Option = { id: string; label: string };

function SaveButton({ n }: { n: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="intent" value="save" size="sm" disabled={pending}>
      {pending ? "שומר…" : `שמירת שלב ${n}`}
    </Button>
  );
}

/** One step: who handles it, and only the one extra choice that "who" needs. */
export function StepRow({
  packageId, index, step, contacts, groups, fields, returnTo, action,
}: {
  packageId: string; index: number; step: WorkflowStep; contacts: Option[]; groups: Option[]; fields: Option[];
  returnTo?: string; action: (fd: FormData) => Promise<void>;
}) {
  const [who, setWho] = useState<StepWho>(stepWhoOf(step));
  const [role, setRole] = useState<StepRole>(step.role);
  const hidden = stepFields(who, role);
  const n = index + 1;
  const id = `s${index}`;
  const fieldOptions = step.assigneeFromFieldId && !fields.some((f) => f.id === step.assigneeFromFieldId)
    ? [...fields, { id: step.assigneeFromFieldId, label: step.assigneeFromFieldId }] : fields;

  return (
    <li className="rounded-lg border bg-card p-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={packageId} />
        <input type="hidden" name="index" value={index} />
        <input type="hidden" name="order" value={step.order} />
        <input type="hidden" name="action" value={hidden.action} />
        {hidden.assigneeKind && <input type="hidden" name="assigneeKind" value={hidden.assigneeKind} />}
        {who === "employee" || who === "requester" ? <input type="hidden" name="role" value={hidden.role} /> : null}
        {step.dueHours ? <input type="hidden" name="dueHours" value={step.dueHours} /> : null}
        {step.otpRequired || who === "email" ? <input type="hidden" name="otpRequired" value="1" /> : null}
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

        <span className="flex size-8 shrink-0 items-center justify-center self-center rounded-full bg-secondary text-sm font-semibold" aria-hidden>{n}</span>
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor={`${id}-who`}>מי בשלב {n}</Label>
          <Select id={`${id}-who`} value={who} onChange={(e) => setWho(e.target.value as StepWho)}>
            {STEP_WHO.map((w) => <option key={w} value={w}>{STEP_WHO_LABELS[w]}</option>)}
          </Select>
        </div>

        {who === "contact" && (
          <div className="min-w-48 flex-1 space-y-1">
            <Label htmlFor={`${id}-contact`}>המשתמש</Label>
            <Select id={`${id}-contact`} name="contactId" defaultValue={step.contactId ?? ""}>
              <option value="">בחרו…</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </div>
        )}
        {who === "group_all" && (
          <div className="min-w-48 flex-1 space-y-1">
            <Label htmlFor={`${id}-group`}>הקבוצה</Label>
            <Select id={`${id}-group`} name="groupId" defaultValue={step.groupId ?? ""}>
              <option value="">בחרו…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </Select>
          </div>
        )}
        {who === "email" && (
          <>
            <div className="min-w-48 flex-1 space-y-1">
              <Label htmlFor={`${id}-email`}>מייל</Label>
              <Input id={`${id}-email`} name="assigneeEmail" type="email" dir="ltr" required defaultValue={step.assignee?.email ?? ""} />
            </div>
            <div className="min-w-40 flex-1 space-y-1">
              <Label htmlFor={`${id}-name`}>שם (לא חובה)</Label>
              <Input id={`${id}-name`} name="assigneeName" defaultValue={step.assignee?.name && step.assignee.name !== step.assignee.email ? step.assignee.name : ""} />
            </div>
          </>
        )}
        {who === "from_field" && (
          <div className="min-w-48 flex-1 space-y-1">
            <Label htmlFor={`${id}-field`}>לפי השדה</Label>
            <Select id={`${id}-field`} name="assigneeFromFieldId" defaultValue={step.assigneeFromFieldId ?? ""}>
              <option value="">בחרו…</option>
              {fieldOptions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </Select>
          </div>
        )}
        {who !== "employee" && who !== "requester" && (
          <div className="w-40 space-y-1">
            <Label htmlFor={`${id}-role`}>תפקיד</Label>
            <Select id={`${id}-role`} name="role" value={hidden.role} onChange={(e) => setRole(e.target.value as StepRole)}>
              {PERSON_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </div>
        )}

        <div className="flex gap-1">
          <SaveButton n={n} />
          <Button type="submit" name="intent" value="delete" variant="ghost" size="sm" aria-label={`מחיקת שלב ${n}`}>מחיקה</Button>
        </div>
        {who === "email" && <p className="basis-full text-xs text-muted-foreground">יקבל קישור ותזכורות במייל, ונכנס עם קוד חד-פעמי שנשלח למייל שלו.</p>}
        {(who === "contact" || who === "group_all") && <p className="basis-full text-xs text-muted-foreground">משתמשים וקבוצות מגדירים ב<a href="/admin/settings/people" className="underline">משתמשים לשלבים</a>.</p>}
      </form>
    </li>
  );
}

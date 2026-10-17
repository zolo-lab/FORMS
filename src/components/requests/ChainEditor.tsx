"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ASSIGNEE_KIND_LABELS, assigneeKindOf } from "@/lib/workflow/assignee";
import { FIXED_ROLES, addApprover, removeStep } from "@/lib/workflow/chain";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import type { WorkflowStep } from "@/lib/workflow/types";

/** Who a step goes to, in words. */
function who(s: WorkflowStep, contacts: { id: string; name: string }[]): string {
  if (s.role === "requester") return "מי שפותח את הבקשה (ממלא עכשיו)";
  if (s.role === "employee") return "האדם שהבקשה עליו";
  switch (assigneeKindOf(s)) {
    case "requester":
      return "חוזר למי שפתח את הבקשה";
    case "contact":
      return contacts.find((c) => c.id === s.contactId)?.name ?? "איש קשר שמור";
    case "from_field":
      return "לפי שדה בטופס";
    case "group_all":
      return "כל חברי קבוצה";
    default:
      return [s.assignee?.name, s.assignee?.email, s.assignee?.phone].filter(Boolean).join(" · ") || "—";
  }
}

/**
 * Edit a copy of the package chain for one request: add a person, send the result back to whoever opened the request,
 * or remove a step. The package itself does not change.
 */
export function ChainEditor({ initial, contacts, onChange }: { initial: WorkflowStep[]; contacts: { id: string; name: string }[]; onChange: (steps: WorkflowStep[]) => void }) {
  const [steps, setSteps] = useState<WorkflowStep[]>([...initial].sort((a, b) => a.order - b.order));
  const [kind, setKind] = useState<"fixed" | "contact" | "requester">("fixed");
  const [person, setPerson] = useState({ name: "", email: "", phone: "" });
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const apply = (next: WorkflowStep[]) => {
    setSteps(next);
    onChange(next);
  };

  function add() {
    setError(null);
    if (kind === "requester") {
      const order = Math.max(0, ...steps.map((s) => s.order)) + 1;
      return apply([...steps, { order, role: "approver", action: "approve", assigneeKind: "requester" }]);
    }
    if (kind === "contact") {
      if (!contactId) return setError("בחרו איש קשר");
      const order = Math.max(0, ...steps.map((s) => s.order)) + 1;
      return apply([...steps, { order, role: "approver", action: "approve", assigneeKind: "contact", contactId }]);
    }
    if (!person.name.trim() || (!person.email.trim() && !person.phone.trim())) return setError("נדרשים שם ומייל או טלפון");
    apply(addApprover(steps, { name: person.name.trim(), ...(person.email.trim() ? { email: person.email.trim() } : {}), ...(person.phone.trim() ? { phone: person.phone.trim() } : {}) }));
    setPerson({ name: "", email: "", phone: "" });
  }

  return (
    <div className="space-y-3" data-testid="chain-editor">
      <ol className="list-decimal space-y-1 ps-5 text-sm">
        {steps.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span>
              {ROLE_LABELS[s.role]}: {who(s, contacts)}
            </span>
            {!FIXED_ROLES.includes(s.role) && (
              <Button type="button" variant="ghost" size="sm" onClick={() => apply(removeStep(steps, i))} aria-label={`הסרת השלב ${ROLE_LABELS[s.role]}`}>
                הסרה
              </Button>
            )}
          </li>
        ))}
      </ol>
      <div className="space-y-2 rounded-md border p-3">
        <p className="text-sm font-medium">הוספת מאשר בסוף המסלול</p>
        <div className="space-y-1">
          <Label htmlFor="chain-kind">מי</Label>
          <Select id="chain-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="fixed">{ASSIGNEE_KIND_LABELS.fixed}</option>
            <option value="contact">{ASSIGNEE_KIND_LABELS.contact}</option>
            <option value="requester">{ASSIGNEE_KIND_LABELS.requester}</option>
          </Select>
        </div>
        {kind === "fixed" && (
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="chain-name">שם</Label>
              <Input id="chain-name" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="chain-email">מייל</Label>
              <Input id="chain-email" type="email" dir="ltr" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="chain-phone">נייד</Label>
              <Input id="chain-phone" type="tel" dir="ltr" value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} />
            </div>
          </div>
        )}
        {kind === "contact" && (
          <div className="space-y-1">
            <Label htmlFor="chain-contact">איש קשר</Label>
            <Select id="chain-contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="button" variant="outline" size="sm" onClick={add}>
          הוספה למסלול
        </Button>
      </div>
    </div>
  );
}

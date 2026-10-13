"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { createRequestAction, type CreateResult, type ShareLink } from "@/app/admin/requests/actions";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Answers } from "@/lib/forms/conditions";
import type { FieldErrors } from "@/lib/forms/validate";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import type { WizardPackage } from "@/server/packages-store";
import { ShareLinks } from "./ShareLinks";

interface Org {
  id: string;
  name: string;
}

const STEPS = ["ערכה וארגון", "פרטי העובד", "שדות המבקש", "סיכום ושליחה"] as const;

export function NewRequestWizard({ packages, orgs }: { packages: WizardPackage[]; orgs: Org[] }) {
  const [step, setStep] = useState(0);
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [organizationId, setOrganizationId] = useState(orgs[0]?.id ?? "");
  const [subject, setSubject] = useState({ name: "", idNumber: "", email: "", phone: "" });
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState<{ requestId: string; sent: boolean; links: ShareLink[] } | null>(null);
  const [pending, start] = useTransition();

  const pkg = packages.find((p) => p.id === packageId);
  const availableOrgs = useMemo(() => orgs, [orgs]);
  const hasRequesterFields = (pkg?.requesterDefinition.pages.length ?? 0) > 0;

  function submit(send: boolean) {
    start(async () => {
      const res: CreateResult = await createRequestAction({ packageId, organizationId, subject, requesterAnswers: answers, send });
      if (res.ok) {
        setErrors({});
        setDone({ requestId: res.requestId, sent: res.sent, links: res.links });
        return;
      }
      setErrors(res.errors);
      // Send the user back to the step that holds the first error.
      const keys = Object.keys(res.errors);
      if (keys.some((k) => k === "packageId" || k === "organizationId")) setStep(0);
      else if (keys.some((k) => k.startsWith("subject."))) setStep(1);
      else setStep(2);
    });
  }

  if (done) {
    return (
      <Card className="space-y-4 p-4" data-testid="request-done">
        <h2 className="text-lg font-semibold">{done.sent ? "הבקשה נשלחה" : "הבקשה נשמרה כטיוטה"}</h2>
        {done.sent && (
          <>
            <p className="text-sm text-muted-foreground">אפשר להעתיק את הקישור או לשתף אותו בוואטסאפ. אם יש מייל, ההזמנה נשלחת אליו אוטומטית.</p>
            <ShareLinks links={done.links} />
          </>
        )}
        <Link href={`/admin/requests/${done.requestId}`} className="text-sm font-medium text-primary hover:underline">
          לעמוד הבקשה
        </Link>
      </Card>
    );
  }

  if (packages.length === 0) return <p className="text-muted-foreground">אין עדיין ערכות פעילות. יש להגדיר ערכה לפני יצירת בקשה.</p>;

  const err = (k: string) => errors[k];
  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="שלבי האשף">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "rounded-full bg-primary px-3 py-1 text-primary-foreground" : "rounded-full bg-muted px-3 py-1 text-muted-foreground"} aria-current={i === step ? "step" : undefined}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card className="space-y-4 p-4">
          <div className="space-y-1">
            <Label htmlFor="pkg">ערכת מסמכים</Label>
            <Select id="pkg" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            {pkg?.description && <p className="text-xs text-muted-foreground">{pkg.description}</p>}
            {err("packageId") && <p role="alert" className="text-sm text-destructive">{err("packageId")}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="org">ארגון</Label>
            <Select id="org" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
              {availableOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
            {err("organizationId") && <p role="alert" className="text-sm text-destructive">{err("organizationId")}</p>}
          </div>
          <Button onClick={() => setStep(1)} disabled={!packageId || !organizationId}>
            הבא
          </Button>
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-4 p-4">
          {(
            [
              ["name", "שם העובד", "text"],
              ["idNumber", "מספר זהות (לא חובה)", "text"],
              ["email", "מייל", "email"],
              ["phone", "טלפון נייד", "tel"],
            ] as const
          ).map(([key, label, type]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`s-${key}`}>{label}</Label>
              <Input
                id={`s-${key}`}
                type={type}
                dir={key === "email" || key === "phone" ? "ltr" : undefined}
                value={subject[key]}
                onChange={(e) => setSubject({ ...subject, [key]: e.target.value })}
                aria-invalid={!!err(`subject.${key}`)}
              />
              {err(`subject.${key}`) && <p role="alert" className="text-sm text-destructive">{err(`subject.${key}`)}</p>}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">לשליחה נדרש מייל או טלפון.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(0)}>
              חזרה
            </Button>
            <Button onClick={() => (subject.name.trim() ? (setErrors({}), setStep(2)) : setErrors({ "subject.name": "שדה חובה" }))}>הבא</Button>
          </div>
        </Card>
      )}

      {step === 2 && pkg && (
        <Card className="space-y-4 p-4">
          {hasRequesterFields ? (
            <FormRenderer
              definition={pkg.requesterDefinition}
              answers={answers}
              onChange={setAnswers}
              errors={errors}
              role="requester"
              onSubmit={(cleaned) => {
                setAnswers(cleaned);
                setStep(3);
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">בערכה הזו אין שדות שהמבקש ממלא.</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              חזרה
            </Button>
            {!hasRequesterFields && <Button onClick={() => setStep(3)}>הבא</Button>}
          </div>
        </Card>
      )}

      {step === 3 && pkg && (
        <Card className="space-y-4 p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">ערכה</dt>
            <dd>{pkg.name}</dd>
            <dt className="text-muted-foreground">ארגון</dt>
            <dd>{orgs.find((o) => o.id === organizationId)?.name}</dd>
            <dt className="text-muted-foreground">עובד</dt>
            <dd>{subject.name}</dd>
            <dt className="text-muted-foreground">מייל / טלפון</dt>
            <dd dir="ltr" className="text-start">{[subject.email, subject.phone].filter(Boolean).join(" · ") || "—"}</dd>
          </dl>
          <div>
            <p className="mb-1 text-sm font-medium">מסלול החתימות</p>
            <ol className="list-decimal space-y-1 ps-5 text-sm">
              {[...pkg.workflow.steps]
                .sort((a, b) => a.order - b.order)
                .map((s, i) => (
                  <li key={i}>
                    {ROLE_LABELS[s.role]}
                    {s.assignee?.name ? ` (${s.assignee.name})` : ""}
                  </li>
                ))}
            </ol>
          </div>
          {Object.values(errors).length > 0 && <p role="alert" className="text-sm text-destructive">{Object.values(errors)[0]}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(hasRequesterFields ? 2 : 1)}>
              חזרה
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => submit(false)}>
              שמירה כטיוטה
            </Button>
            <Button disabled={pending} onClick={() => submit(true)}>
              {pending ? "שולח…" : "שליחה"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

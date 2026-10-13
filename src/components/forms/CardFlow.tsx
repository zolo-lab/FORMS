"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Answers } from "@/lib/forms/conditions";
import { buildCards, reviewItems } from "@/lib/forms/cards";
import type { FillerRole, FormDefinition } from "@/lib/forms/schema";
import { validateAnswers, type FieldErrors } from "@/lib/forms/validate";
import { LayoutBlock } from "./fields/layout";
import { FieldRow } from "./fields/registry";
import type { RenderCtx } from "./fields/types";

/** One question per screen, then a review of all answers before sending. */
export function CardFlow({
  definition, answers, onField, ctx, role, today, serverErrors, onSubmit,
}: {
  definition: FormDefinition;
  answers: Answers;
  onField: (id: string, v: unknown) => void;
  ctx: RenderCtx;
  role?: FillerRole;
  today?: string;
  serverErrors: FieldErrors;
  onSubmit?: (cleaned: Answers) => void | Promise<void>;
}) {
  const cards = useMemo(() => buildCards(definition, answers, role), [definition, answers, role]);
  const [index, setIndex] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // `cards.length` is the review screen.
  const at = Math.min(index, cards.length);
  const review = at >= cards.length;
  const card = review ? null : cards[at]!;
  const allErrors = { ...serverErrors, ...errors };

  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: "start" });
  }, [at]);

  function errorsFor(id: string): FieldErrors {
    const all = validateAnswers(definition, answers, { role, today }).errors;
    return Object.fromEntries(Object.entries(all).filter(([k]) => k === id || k.startsWith(`${id}.`)));
  }

  function next() {
    if (card?.field) {
      const errs = errorsFor(card.field.id);
      if (Object.keys(errs).length) { setErrors(errs); return; }
    }
    setErrors({});
    setIndex(at + 1);
  }

  async function send() {
    const result = validateAnswers(definition, answers, { role, today });
    if (!result.ok) {
      setErrors(result.errors);
      // Jump back to the first card with a problem.
      const bad = cards.findIndex((c) => c.field && Object.keys(result.errors).some((k) => k === c.field!.id || k.startsWith(`${c.field!.id}.`)));
      if (bad >= 0) setIndex(bad);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit?.(result.cleaned);
    } finally {
      setSubmitting(false);
    }
  }

  const cardCtx: RenderCtx = { ...ctx, errors: allErrors };
  return (
    <div
      ref={rootRef}
      className="space-y-5"
      onKeyDown={(e) => {
        // Enter moves on, except inside multi-line inputs and buttons.
        const tag = (e.target as HTMLElement).tagName;
        if (e.key === "Enter" && tag !== "TEXTAREA" && tag !== "BUTTON" && !review) { e.preventDefault(); next(); }
      }}
    >
      <div aria-label={`שאלה ${Math.min(at + 1, cards.length)} מתוך ${cards.length}`}>
        <div className="mb-1 flex justify-between text-sm text-muted-foreground">
          <span>{review ? "סיכום לפני שליחה" : definition.pages[card!.pageIndex]?.title}</span>
          <span>{Math.min(at + 1, cards.length)} / {cards.length}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={cards.length} aria-valuenow={Math.min(at, cards.length)}>
          <div className="h-full bg-primary transition-all" style={{ width: `${cards.length ? (Math.min(at + 1, cards.length) / cards.length) * 100 : 100}%` }} />
        </div>
      </div>

      {review ? (
        <section aria-label="סיכום" className="space-y-3">
          <h2 className="text-xl font-semibold">בדקו את התשובות</h2>
          <dl className="divide-y rounded-lg border bg-card">
            {reviewItems(cards, answers).map((it) => (
              <div key={it.cardIndex} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{it.label}</dt>
                  <dd className="font-medium">{it.text}</dd>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setIndex(it.cardIndex)}>עריכה</Button>
              </div>
            ))}
          </dl>
          {Object.keys(allErrors).length > 0 && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">יש שדות שדורשים תיקון</p>}
        </section>
      ) : (
        <section aria-label={card!.field?.label ?? "הסבר"} className="space-y-4">
          {card!.blocks.map((b) => <LayoutBlock key={b.id} field={b} pipe={(t) => ctx.pipe(t, answers)} />)}
          {card!.field && (
            <div className="grid grid-cols-1 gap-4">
              <FieldRow field={{ ...card!.field, width: "full" }} scope={answers} rootAnswers={answers} onField={onField} prefix="" parentDisabled={false} ctx={cardCtx} />
            </div>
          )}
        </section>
      )}

      <div className="flex justify-between gap-2 border-t pt-4">
        {at > 0 ? <Button variant="outline" onClick={() => { setErrors({}); setIndex(at - 1); }}>הקודם</Button> : <span />}
        {review ? (
          onSubmit && <Button disabled={submitting} onClick={send}>{submitting ? "שולח…" : (definition.settings?.submitLabel ?? "שליחה")}</Button>
        ) : (
          <Button onClick={next}>{at === cards.length - 1 ? "לסיכום" : "הבא"}</Button>
        )}
      </div>
    </div>
  );
}

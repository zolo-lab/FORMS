"use client";
import { ChevronDown, Folder, Mail, Trash2, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { describeDestination, destinationProblems, itemLabel, type ProcessingContext } from "@/lib/processing/model";
import { COMPLETION_DESTINATION_ID, type Destination, type SendItem } from "@/lib/processing/types";
import { RecipientPicker } from "./RecipientPicker";

const ICON = { drive: Folder, email: Mail, webhook: Webhook } as const;
const KIND_LABEL = { drive: "תיקייה בדרייב", email: "מייל", webhook: "Webhook" } as const;

const sameItem = (a: SendItem, b: SendItem) => JSON.stringify(a) === JSON.stringify(b);

/** Everything this form can send, as checkboxes: the full document, each cut part, each uploaded file. */
function ItemPicker({ value, onChange, ctx, idPrefix }: { value: SendItem[]; onChange: (next: SendItem[]) => void; ctx: ProcessingContext; idPrefix: string }) {
  const choices: SendItem[] = [
    { kind: "full" },
    ...ctx.parts.map((p): SendItem => ({ kind: "part", partId: p.id })),
    ...((ctx.attachments ?? []).length > 0 ? [{ kind: "attachment", fieldId: "*" } as SendItem] : []),
    ...(ctx.attachments ?? []).map((a): SendItem => ({ kind: "attachment", fieldId: a.id })),
  ];
  const toggle = (item: SendItem, on: boolean) => onChange(on ? [...value.filter((v) => !sameItem(v, item)), item] : value.filter((v) => !sameItem(v, item)));
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">מה נשלח</legend>
      <div className="flex flex-wrap gap-x-4">
        {choices.map((item, i) => (
          <label key={`${idPrefix}-i${i}`} className="flex min-h-10 items-center gap-2 text-sm">
            <Checkbox checked={value.some((v) => sameItem(v, item))} onChange={(e) => toggle(item, e.target.checked)} />
            {itemLabel(item, ctx)}
          </label>
        ))}
      </div>
      {ctx.parts.length === 0 && <p className="text-xs text-muted-foreground">חלקים של המסמך יופיעו כאן אחרי שיוגדר חיתוך.</p>}
    </fieldset>
  );
}

/**
 * One destination: collapsed it is a single line ("101 → שכר שיבת ציון/2026"), open it is its settings.
 * The completion card (`COMPLETION_DESTINATION_ID`) is the package's "מקבלי המסמכים החתומים בסיום" and
 * cannot be deleted or re-pointed — it is the same value the send settings show.
 */
export function DestinationCard({
  destination, onChange, onRemove, ctx, open, onToggle,
}: {
  destination: Destination;
  onChange: (next: Destination) => void;
  onRemove: () => void;
  ctx: ProcessingContext;
  open: boolean;
  onToggle: () => void;
}) {
  const d = destination;
  const completion = d.id === COMPLETION_DESTINATION_ID;
  const problems = destinationProblems(d, ctx);
  const Icon = ICON[d.kind];
  const id = `dest-${d.id}`;

  return (
    <li className={cn("rounded-lg border bg-card", problems.length > 0 && "border-destructive/60")}>
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          className="flex w-full min-h-12 items-center gap-3 p-3 text-start"
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{completion ? "מקבלי המסמכים החתומים בסיום" : KIND_LABEL[d.kind]}</span>
            <span className="block truncate text-xs text-muted-foreground">{describeDestination(d, ctx)}</span>
          </span>
          {problems.length > 0 && <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">{problems.length === 1 ? "חסר פרט" : `חסרים ${problems.length} פרטים`}</span>}
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </h3>

      {open && (
        <div id={`${id}-body`} className="space-y-4 border-t p-4">
          {completion && (
            <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              אותן כתובות שמופיעות ב&quot;הגדרות שליחה&quot;. עריכה כאן משנה גם שם.
            </p>
          )}

          {!completion && <ItemPicker value={d.items} onChange={(items) => onChange({ ...d, items })} ctx={ctx} idPrefix={id} />}

          {d.kind === "email" && (
            <>
              <div className="space-y-1">
                <span className="text-sm font-medium">נמענים</span>
                <RecipientPicker value={d.to} onChange={(to) => onChange({ ...d, to })} ctx={ctx} fixedOnly={completion} idPrefix={`${id}-to`} />
              </div>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <Checkbox checked={d.attach} onChange={(e) => onChange({ ...d, attach: e.target.checked })} />
                לצרף את הקבצים למייל (בלי סימון – נשלח קישור בלבד)
              </label>
              {!completion && (
                <div className="space-y-1">
                  <Label htmlFor={`${id}-note`}>הערה במייל (לא חובה)</Label>
                  <Textarea id={`${id}-note`} rows={2} maxLength={300} value={d.note ?? ""} onChange={(e) => onChange({ ...d, note: e.target.value })} />
                </div>
              )}
            </>
          )}

          {d.kind === "drive" && (
            <div className="space-y-1">
              <Label htmlFor={`${id}-path`}>נתיב התיקייה</Label>
              <Input id={`${id}-path`} value={d.path ?? ""} onChange={(e) => onChange({ ...d, path: e.target.value })} placeholder="שכר {עמותה}/{שנה}/101_{שנה}" />
              <p className="text-xs text-muted-foreground">מתחת לתיקיית השורש של העמותה. בחירת תיקייה מהדרייב תתווסף בהמשך.</p>
            </div>
          )}

          {problems.length > 0 && (
            <ul role="alert" className="space-y-0.5 text-sm text-destructive">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}

          {!completion && (
            <div className="border-t pt-3">
              <Button type="button" variant="ghost" className="text-destructive" onClick={onRemove}>
                <Trash2 className="size-4" aria-hidden />מחיקת היעד
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

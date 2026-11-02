"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import type { LinkSuggestion } from "@/lib/forms/checkbox-links";

/**
 * Preview of the suggested "show only when the box is ticked" links: every suggestion is ticked, the admin unticks
 * what is wrong and applies the rest. Nothing changes before "החל".
 */
export function CheckboxLinksDialog({
  suggestions,
  onApply,
  onClose,
}: {
  suggestions: LinkSuggestion[] | null;
  onApply: (chosen: LinkSuggestion[]) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!suggestions} onClose={onClose} title="שדות שמופיעים רק כשמסמנים תיבה" className="w-[min(96vw,40rem)]" fullScreenOnMobile>
      {suggestions && <Body key={suggestions.map((s) => s.fieldId).join(",")} suggestions={suggestions} onApply={onApply} onClose={onClose} />}
    </Dialog>
  );
}

function Body({ suggestions, onApply, onClose }: { suggestions: LinkSuggestion[]; onApply: (c: LinkSuggestion[]) => void; onClose: () => void }) {
  const [on, setOn] = useState<boolean[]>(() => suggestions.map(() => true));
  const count = on.filter(Boolean).length;
  // Grouped by box, in document order, so "the box and its details" read together.
  const groups: { key: string; label: string; items: number[] }[] = [];
  suggestions.forEach((s, i) => {
    const key = JSON.stringify(s.source.condition);
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(i);
    else groups.push({ key, label: s.source.label, items: [i] });
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 text-sm">
      <p className="text-muted-foreground">
        לפי המקום במסמך, השדות האלה שייכים לתיבת סימון ויוצגו לממלא רק כשהוא מסמן אותה. בטלו סימון למה שלא שייך, והשאר יקבל תנאי הצגה (אפשר לשנות אחר כך בהגדרות השדה).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setOn(suggestions.map(() => true))}>סימון הכול</Button>
        <Button size="sm" variant="ghost" onClick={() => setOn(suggestions.map(() => false))}>ניקוי הכול</Button>
        <span className="ms-auto text-xs text-muted-foreground" aria-live="polite">{count} מסומנים מתוך {suggestions.length}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pe-1">
        {groups.map((g) => (
          <section key={g.key} className="rounded-md border bg-background p-2">
            <h3 className="pb-1 font-medium">כשמסמנים: <bdi>{g.label}</bdi></h3>
            <ul className="space-y-1" aria-label={`שדות שתלויים ב${g.label}`}>
              {g.items.map((i) => {
                const s = suggestions[i]!;
                return (
                  <li key={s.fieldId}>
                    <label className="flex min-h-11 items-center gap-3 rounded-md px-2 hover:bg-accent">
                      <Checkbox checked={on[i]} onChange={(e) => setOn((o) => o.map((x, k) => (k === i ? e.target.checked : x)))} />
                      <span className="flex-1"><bdi>{s.fieldLabel}</bdi></span>
                      <span className="text-xs text-muted-foreground">{s.sameLine ? "באותה שורה" : "בשורה שמתחת"}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button className="min-h-11" disabled={count === 0} onClick={() => onApply(suggestions.filter((_, i) => on[i]))}>החל על {count} שדות</Button>
        <Button variant="outline" className="min-h-11" onClick={onClose}>בטל</Button>
      </div>
    </div>
  );
}

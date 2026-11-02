"use client";
import { useState } from "react";
import { Eye, MousePointerClick, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDependent, dependentCandidates, dependentsOf, removeDependent, revealWord } from "@/lib/forms/dependents";
import type { FormDefinition, FormField } from "@/lib/forms/schema";
import { FieldPicker } from "./FieldPicker";

/**
 * From the source field: «כשהשדה הזה מסומן / מלא – הצג גם…» (as in iForms). Each chosen field gets a visibleIf on
 * this one; the list shows every field that already depends on it, wherever the rule was set.
 */
export function OpensFields({ def, field, onDefChange, onStartPick }: { def: FormDefinition; field: FormField; onDefChange: (d: FormDefinition) => void; onStartPick?: (sourceId: string) => void }) {
  const [error, setError] = useState<string>();
  const opens = dependentsOf(def, field.id);
  const candidates = dependentCandidates(def, field.id);
  const word = revealWord(field);
  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="text-sm font-medium">כשהשדה הזה {word} – הצג גם:</p>
      {opens.length === 0 ? (
        <p className="text-xs text-muted-foreground">עדיין אין שדות שנפתחים ממנו.</p>
      ) : (
        <ul className="space-y-1" aria-label="שדות שנפתחים מהשדה הזה">
          {opens.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <Eye aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <bdi className="min-w-0 flex-1 truncate">{f.label || f.id}</bdi>
              <Button variant="ghost" size="sm" className="min-h-9" aria-label={`הסרת ${f.label || f.id}`} onClick={() => onDefChange(removeDependent(def, field.id, f.id))}>
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {onStartPick && (
        <Button variant="outline" size="sm" className="min-h-11 w-full justify-start" onClick={() => onStartPick(field.id)}>
          <MousePointerClick className="size-4" aria-hidden />
          סימון בטופס או על המסמך
        </Button>
      )}
      {candidates.length > 0 && (
        <FieldPicker
          label="הוספת שדה שנפתח"
          placeholder="או הקלידו שם השדה שייפתח…"
          fields={candidates}
          clearOnPick
          onPick={(id) => {
            const r = addDependent(def, field.id, id);
            setError(r.error);
            if (r.def) onDefChange(r.def);
          }}
        />
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">שדה שנפתח מוסתר עד ש{word === "מלא" ? "ממלאים" : "מסמנים"} את השדה הזה, וכשהוא מוסתר הוא לא חובה ולא נשמר.</p>
    </div>
  );
}

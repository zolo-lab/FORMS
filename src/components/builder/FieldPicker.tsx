"use client";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { pickerText, resolvePicked } from "@/lib/forms/dependents";
import type { FormField } from "@/lib/forms/schema";

/**
 * Pick a field by typing its name or its id (Form 101 has well over a hundred fields, too many for a plain list).
 * The browser suggests matches while typing; a choice counts once it names exactly one field.
 */
export function FieldPicker({
  fields, value, onPick, label, placeholder = "הקלידו שם שדה או מזהה…", clearOnPick = false,
}: {
  fields: Pick<FormField, "id" | "label">[];
  value?: string;
  onPick: (id: string) => void;
  label: string;
  placeholder?: string;
  /** For "add" pickers: empty the box after a field was chosen. */
  clearOnPick?: boolean;
}) {
  const listId = useId();
  const current = fields.find((f) => f.id === value);
  const [text, setText] = useState(current ? pickerText(current) : "");
  const [miss, setMiss] = useState(false);
  const commit = (raw: string) => {
    const id = resolvePicked(fields, raw);
    setMiss(!!raw.trim() && !id);
    if (!id) return;
    onPick(id);
    setText(clearOnPick ? "" : pickerText(fields.find((f) => f.id === id)!));
  };
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <Input
        aria-label={label}
        list={listId}
        value={text}
        placeholder={placeholder}
        aria-invalid={miss}
        className="h-9"
        onChange={(e) => {
          setText(e.target.value);
          // Choosing from the suggestions fills the exact text: take it right away.
          if (resolvePicked(fields, e.target.value) && fields.some((f) => pickerText(f) === e.target.value)) commit(e.target.value);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(e.currentTarget.value);
          }
        }}
      />
      <datalist id={listId}>
        {fields.map((f) => <option key={f.id} value={pickerText(f)} />)}
      </datalist>
      {miss && <p className="text-xs text-destructive">לא נמצא שדה אחד בשם הזה. בחרו מההצעות או הקלידו את המזהה.</p>}
    </div>
  );
}

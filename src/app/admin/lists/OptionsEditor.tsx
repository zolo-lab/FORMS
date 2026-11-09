"use client";
import { useRef } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { splitPasted } from "@/lib/lists/kinds";

/**
 * The options of a choice field, edited in place: a line per option, Enter adds the next one, arrows reorder, ✕
 * removes. Controlled by the caller; empties are dropped on save, not here, so typing never loses a line.
 */
export function OptionsEditor({ value, onChange, label = "אפשרויות" }: { value: string[]; onChange: (next: string[]) => void; label?: string }) {
  const list = value.length ? value : [""];
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const set = (i: number, v: string) => onChange(list.map((o, j) => (j === i ? v : o)));
  const insertAfter = (i: number) => {
    const next = [...list.slice(0, i + 1), "", ...list.slice(i + 1)];
    onChange(next);
    requestAnimationFrame(() => refs.current[i + 1]?.focus());
  };
  /** Several lines pasted (a column copied from Excel or Sheets, a list from a document) become several options. */
  const paste = (i: number, text: string) => {
    const lines = splitPasted(text);
    if (lines.length < 2) return false;
    const before = list.slice(0, i);
    const after = list.slice(i + 1);
    // The line pasted into keeps what was typed in it if it was not empty.
    const here = list[i]?.trim() ? [list[i]!] : [];
    const seen = new Set([...before, ...here, ...after].map((o) => o.trim()));
    const fresh = lines.filter((l) => !seen.has(l) && (seen.add(l), true));
    onChange([...before, ...here, ...fresh, ...after]);
    requestAnimationFrame(() => refs.current[before.length + here.length + fresh.length - 1]?.focus());
    return true;
  };
  const remove = (i: number) => onChange(list.filter((_, j) => j !== i));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <ol className="space-y-1.5">
        {list.map((o, i) => (
          <li key={i} className="flex items-center gap-1">
            <span className="w-5 shrink-0 text-center text-xs text-muted-foreground" aria-hidden>{i + 1}</span>
            <Input
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={o}
              onChange={(e) => set(i, e.target.value)}
              onPaste={(e) => {
                if (paste(i, e.clipboardData.getData("text"))) e.preventDefault();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  insertAfter(i);
                }
                if (e.key === "Backspace" && !o && list.length > 1) {
                  e.preventDefault();
                  remove(i);
                  requestAnimationFrame(() => refs.current[Math.max(0, i - 1)]?.focus());
                }
              }}
              aria-label={`אפשרות ${i + 1}`}
              placeholder={i === 0 ? "למשל: פעיל" : ""}
              maxLength={120}
              className="h-10"
            />
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`העלאת אפשרות ${i + 1}`}>
              <ArrowUp className="size-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={`הורדת אפשרות ${i + 1}`}>
              <ArrowDown className="size-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => remove(i)} disabled={list.length === 1} aria-label={`מחיקת אפשרות ${i + 1}`}>
              <X className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
      <Button type="button" variant="ghost" size="sm" onClick={() => insertAfter(list.length - 1)}>
        <Plus className="size-4" aria-hidden /> אפשרות
      </Button>
      <p className="text-xs text-muted-foreground">אפשר להדביק עמודה מאקסל או כמה שורות – כל שורה תהיה אפשרות. Enter מוסיף שורה; Backspace בשורה ריקה מוחק אותה.</p>
    </fieldset>
  );
}


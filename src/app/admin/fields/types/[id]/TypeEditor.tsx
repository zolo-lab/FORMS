"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Radio } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DICTIONARY_TYPE_LABELS, type DictionaryType } from "@/lib/fields/types";
import { saveListTypeAction } from "../actions";
import { MAX_TYPE_FIELDS } from "@/lib/fields/list-type";

export type FieldOption = { key: string; label: string; type: DictionaryType };

/**
 * The fields of one list type, in order, picked from the general identifying fields, and the one that names a
 * record. One save button; nothing is written before it is pressed.
 */
export function TypeEditor({
  typeId,
  name: initialName,
  fields: initialFields,
  displayKey: initialDisplay,
  all,
}: {
  typeId: string;
  name: string;
  fields: string[];
  displayKey: string | null;
  all: FieldOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [fields, setFields] = useState<string[]>(initialFields);
  const [display, setDisplay] = useState<string | null>(initialDisplay ?? initialFields[0] ?? null);
  const [pick, setPick] = useState("");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "saved" } | { kind: "error"; text: string }>({ kind: "idle" });
  const [pending, start] = useTransition();
  const byKey = new Map(all.map((f) => [f.key, f]));
  const free = all.filter((f) => !fields.includes(f.key));
  const touch = () => { setDirty(true); setStatus({ kind: "idle" }); };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setFields(next);
    touch();
  };

  const save = () =>
    start(async () => {
      try {
        const r = await saveListTypeAction(typeId, { name, fields, displayKey: display });
        if (!r.ok) { setStatus({ kind: "error", text: r.error }); return; }
      } catch {
        setStatus({ kind: "error", text: "השמירה נכשלה. השינויים עדיין כאן – נסו שוב." });
        return;
      }
      setDirty(false);
      setStatus({ kind: "saved" });
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <div className="max-w-md space-y-1">
        <Label htmlFor="t-name">שם סוג הרשימה</Label>
        <Input id="t-name" value={name} onChange={(e) => { setName(e.target.value); touch(); }} maxLength={80} />
      </div>

      <section aria-labelledby="t-fields" className="space-y-3">
        <div>
          <h2 id="t-fields" className="font-semibold">השדות של הסוג</h2>
          <p className="text-sm text-muted-foreground">הסדר כאן הוא סדר העמודות ברשימות. השדה המסומן הוא מה שמופיע כשבוחרים רשומה (למשל שם הספק).</p>
        </div>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">עדיין אין שדות. הוסיפו מהשדות המזהים או צרו שדה חדש.</p>
        ) : (
          <ol className="divide-y rounded-lg border">
            {fields.map((k, i) => {
              const f = byKey.get(k);
              return (
                <li key={k} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="w-6 text-center text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{f?.label ?? k}</span>
                    <span className="ms-2 text-xs text-muted-foreground">{f ? DICTIONARY_TYPE_LABELS[f.type] : ""} · <bdi dir="ltr" className="font-mono">{k}</bdi></span>
                  </span>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <Radio name="display" checked={display === k} onChange={() => { setDisplay(k); touch(); }} />
                    מוצג בבחירה
                  </label>
                  <Button variant="ghost" size="icon" aria-label={`הזזת ${f?.label ?? k} למעלה`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" aria-hidden /></Button>
                  <Button variant="ghost" size="icon" aria-label={`הזזת ${f?.label ?? k} למטה`} disabled={i === fields.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" aria-hidden /></Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label={`הסרת ${f?.label ?? k} מהסוג`}
                    onClick={() => {
                      const next = fields.filter((x) => x !== k);
                      setFields(next);
                      if (display === k) setDisplay(next[0] ?? null);
                      touch();
                    }}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="t-pick">הוספת שדה מהשדות המזהים</Label>
            <Select id="t-pick" value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-64">
              <option value="">בחרו שדה…</option>
              {free.map((f) => <option key={f.key} value={f.key}>{f.label} ({DICTIONARY_TYPE_LABELS[f.type]})</option>)}
            </Select>
          </div>
          <Button
            variant="outline"
            disabled={!pick || fields.length >= MAX_TYPE_FIELDS}
            onClick={() => {
              const next = [...fields, pick];
              setFields(next);
              if (!display) setDisplay(pick);
              setPick("");
              touch();
            }}
          >
            <Plus className="size-4" aria-hidden />הוספה
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">שדה שאין ברשימה? יוצרים אותו בלשונית <Link href="/admin/fields" className="underline">שדות</Link>.</p>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <Button onClick={save} disabled={pending || !dirty}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          שמירה
        </Button>
        <p role="status" aria-live="polite" className="text-sm">
          {status.kind === "saved" && <span className="inline-flex items-center gap-1 text-success"><Check className="size-4" aria-hidden />נשמר</span>}
          {status.kind === "error" && <span className="text-destructive">{status.text}</span>}
          {status.kind === "idle" && dirty && <span className="text-muted-foreground">יש שינויים שלא נשמרו</span>}
        </p>
      </div>
    </div>
  );
}

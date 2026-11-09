"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KIND_LABELS, TEXT_KINDS } from "@/lib/lists/kinds";
import type { TypeSummary } from "@/server/lists-store";
import { cn } from "@/lib/utils";
import { createTypeAction } from "./actions";

/** The list types: a column on wide screens, a row of chips on phones. */
export function TypeNav({ types, current }: { types: TypeSummary[]; current: string }) {
  const [open, setOpen] = useState(false);
  return (
    <nav aria-label="סוגי רשימות" className="md:w-60 md:shrink-0">
      <ul className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:gap-1 md:overflow-visible md:pb-0">
        {types.map((t) => (
          <li key={t.id} className="shrink-0">
            <Link
              href={t.id === "org" ? "/admin/lists" : `/admin/lists?type=${t.id}`}
              aria-current={t.id === current ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 text-sm md:border-transparent",
                t.id === current ? "border-primary bg-primary/10 font-semibold text-foreground" : "hover:bg-muted",
              )}
            >
              <span>{t.name}</span>
              <span className="text-xs text-muted-foreground" aria-label={`${t.count} רשומות`}>{t.count}</span>
            </Link>
          </li>
        ))}
        <li className="shrink-0">
          <Button variant="outline" className="min-h-11 w-full justify-start gap-2 md:border-dashed" onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden /> סוג רשימה
          </Button>
        </li>
      </ul>
      <NewTypeDialog open={open} onClose={() => setOpen(false)} />
    </nav>
  );
}

type Draft = { label: string; kind: string };

function NewTypeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [fields, setFields] = useState<Draft[]>([{ label: "שם", kind: "short_text" }]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const close = () => {
    setName("");
    setFields([{ label: "שם", kind: "short_text" }]);
    setError("");
    onClose();
  };
  const submit = () =>
    start(async () => {
      const r = await createTypeAction(name, fields);
      if (!r.ok) return setError(r.error);
      close();
      router.push(`/admin/lists?type=${r.id}`);
    });
  return (
    <Dialog open={open} onClose={close} title="סוג רשימה חדש" fullScreenOnMobile>
      <form
        className="flex flex-1 flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="type-name">שם הסוג</Label>
          <Input id="type-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: ספקים, ערים, חנויות" autoFocus required maxLength={80} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">השדות הראשונים</legend>
          <p className="text-xs text-muted-foreground">אפשר להוסיף, לשנות ולמחוק שדות גם אחר כך. בחירה מרשימה ושיוך מוסיפים מתוך הטבלה.</p>
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label={`שם שדה ${i + 1}`} value={f.label} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="שם השדה" maxLength={80} />
              <Select aria-label={`סוג שדה ${i + 1}`} value={f.kind} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))} className="w-36 shrink-0">
                {TEXT_KINDS.map((k) => (
                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                ))}
              </Select>
              <Button variant="ghost" size="icon" aria-label={`הסרת שדה ${i + 1}`} onClick={() => setFields(fields.filter((_, j) => j !== i))}>
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          {fields.length < 20 && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setFields([...fields, { label: "", kind: "short_text" }])}>
              <Plus className="size-4" aria-hidden /> שדה
            </Button>
          )}
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="mt-auto flex justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={close}>ביטול</Button>
          <Button type="submit" disabled={pending}>{pending ? "יוצר…" : "יצירה"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

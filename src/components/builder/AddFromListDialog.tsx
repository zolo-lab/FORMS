"use client";
import { useState } from "react";
import { AlertTriangle, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { RecordPicker } from "@/components/forms/fields/RecordPicker";
import { addFromList, fieldTypeFor, fits, listSource, sameLabel, type BuilderRecord, type LinkSource } from "@/lib/forms/linked";
import { allFields, type FormDefinition } from "@/lib/forms/schema";
import { KIND_LABELS, isListFieldKind } from "@/lib/lists/kinds";
import { cn } from "@/lib/utils";
import { LinkedFieldsPanel, type LinkableType } from "./LinkedFieldsDialog";

/** A list the builder can add from: its fields and its records (the organizations' records are the organizations). */
export interface BuilderList extends LinkableType {
  records: BuilderRecord[];
}

type Mode = "add" | "links";

/**
 * "שדות מרשימה": add a list's fields to the form in three short steps – which list, which record, which fields.
 * A fixed record copies its values in (locked, unless opened for editing); no record links the fields to the list
 * and lets the filler pick (or, for the organizations, the request's organization decides). The second tab shows
 * every link the form has, to change or undo.
 */
export function AddFromListDialog({
  open,
  onClose,
  def,
  org,
  types,
  page,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  def: FormDefinition;
  /** The organizations' list, with the organizations as records. */
  org: BuilderList;
  /** The other list types. */
  types: BuilderList[];
  page: number;
  onChange: (next: FormDefinition) => void;
}) {
  const [mode, setMode] = useState<Mode>("add");
  const [source, setSource] = useState<LinkSource | null>(null);
  const [recordId, setRecordId] = useState<string>("");
  const [readOnly, setReadOnly] = useState(true);
  const [picked, setPicked] = useState<Set<string> | null>(null);

  const lists: { source: LinkSource; list: BuilderList }[] = [{ source: "org", list: org }, ...types.map((t) => ({ source: listSource(t.id), list: t }))];
  const current = lists.find((l) => l.source === source);
  const fields = current?.list.fields ?? [];
  const chosen = picked ?? new Set(fields.map((f) => f.key));
  const record = current?.list.records.find((r) => r.id === recordId) ?? null;
  const formFields = allFields(def).filter((f) => FIELD_TYPE_META[f.type].hasAnswer);
  // The filler's picker names a record by a text field the form links to; with none chosen it shows "רשומה 1, 2…".
  const nameless = !record && source !== "org" && fields.length > 0 && !fields.some((f) => (f.kind === "short_text" || f.kind === "long_text") && chosen.has(f.key));

  const reset = () => {
    setSource(null);
    setRecordId("");
    setReadOnly(true);
    setPicked(null);
  };
  const close = () => {
    reset();
    setMode("add");
    onClose();
  };
  const add = () => {
    if (!current) return;
    onChange(addFromList(def, current.source, current.list.name, fields.filter((f) => chosen.has(f.key)), page, { record, readOnly }));
    close();
  };

  return (
    <Dialog open={open} onClose={close} title="שדות מרשימה" className="w-[min(96vw,52rem)]" fullScreenOnMobile>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Tabs<Mode> value={mode} onChange={setMode} tabs={[{ id: "add", label: "הוספת שדות" }, { id: "links", label: "קישורים בטופס" }]} />

        {mode === "links" && <LinkedFieldsPanel def={def} listFields={org.fields} types={types} page={page} onChange={onChange} />}

        {mode === "add" && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {/* 1. Which list */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">1. מאיזו רשימה?</h3>
              <div className="flex flex-wrap gap-2">
                {lists.map(({ source: s, list }) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={source === s}
                    onClick={() => {
                      setSource(s);
                      setRecordId("");
                      setPicked(null);
                    }}
                    className={cn("inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm", source === s ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}
                  >
                    {list.name}
                    <span className={cn("text-xs", source === s ? "text-primary-foreground/80" : "text-muted-foreground")}>{list.fields.length} שדות</span>
                  </button>
                ))}
                {lists.length === 1 && <span className="self-center text-xs text-muted-foreground">סוגי רשימות נוספים מקימים במסך הרשימות.</span>}
              </div>
            </section>

            {current && (
              <>
                {/* 2. Which record */}
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">2. איזו רשומה?</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className={cn("flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm", !recordId && "border-primary bg-primary/5")}>
                      <Radio name="which" checked={!recordId} onChange={() => setRecordId("")} className="mt-0.5" />
                      <span>
                        <span className="font-medium">{source === "org" ? "לפי העמותה של הבקשה" : "הממלא יבחר בטופס"}</span>
                        <span className="block text-xs text-muted-foreground">
                          {source === "org" ? "השדות מתמלאים מהעמותה שאליה נשלח הטופס, ונעולים." : `נוסף לטופס שדה «${current.list.name}» לבחירה עם חיפוש; השדות מתמלאים מהרשומה שנבחרה.`}
                        </span>
                      </span>
                    </label>
                    <label className={cn("flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm", recordId && "border-primary bg-primary/5")}>
                      <Radio name="which" checked={!!recordId} onChange={() => setRecordId(current.list.records[0]?.id ?? "")} className="mt-0.5" disabled={current.list.records.length === 0} />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">רשומה קבועה</span>
                        <span className="block text-xs text-muted-foreground">הערכים של הרשומה נכנסים לטופס עכשיו, כברירת מחדל.</span>
                        {current.list.records.length > 0 ? (
                          <span className="mt-2 block" onClick={(e) => e.preventDefault()}>
                            <RecordPicker
                              id="fixed-record"
                              options={current.list.records.map((r) => ({ value: r.id, label: r.title, data: r.values }))}
                              value={recordId}
                              onChange={setRecordId}
                              placeholder="חיפוש רשומה…"
                            />
                          </span>
                        ) : (
                          <span className="block text-xs text-muted-foreground">
                            {current.list.fields.length === 0 ? "אין שדות ברשימה הזאת." : "אין רשומות לבחירה – או שהרשימה ריקה, או שההרשאה שלך לא כוללת את מסך הרשימות."}
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                  {record && (
                    <label className="flex min-h-10 items-center gap-2 text-sm">
                      <Checkbox checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} /> לקריאה בלבד – הממלא לא ישנה את הערכים
                    </label>
                  )}
                </section>

                {/* 3. Which fields */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">3. אילו שדות?</h3>
                    <div className="flex gap-2 text-xs">
                      <button type="button" className="text-primary underline" onClick={() => setPicked(new Set(fields.map((f) => f.key)))}>הכול</button>
                      <button type="button" className="text-primary underline" onClick={() => setPicked(new Set())}>כלום</button>
                    </div>
                  </div>
                  <ul className="divide-y rounded-md border">
                    {fields.map((lf) => {
                      const existing = formFields.find((f) => sameLabel(f.label, lf.label) && fits(f, lf));
                      const v = record?.values[lf.key];
                      return (
                        <li key={lf.key}>
                          <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm">
                            <Checkbox
                              checked={chosen.has(lf.key)}
                              onChange={(e) => {
                                const next = new Set(chosen);
                                if (e.target.checked) next.add(lf.key);
                                else next.delete(lf.key);
                                setPicked(next);
                              }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">{lf.label}</span>
                              <span className="ms-2 text-xs text-muted-foreground">{isListFieldKind(lf.kind) ? KIND_LABELS[lf.kind] : lf.kind}</span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {record ? (
                                <span dir="auto" className="text-foreground">{Array.isArray(v) ? v.join(", ") : v || "—"}</span>
                              ) : existing ? (
                                <span className="inline-flex items-center gap-1"><Check className="size-3.5 text-success" aria-hidden /> קיים – יקושר</span>
                              ) : (
                                <span className="inline-flex items-center gap-1"><Plus className="size-3.5" aria-hidden /> יתווסף כ{FIELD_TYPE_META[fieldTypeFor(lf)].label}</span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                    {fields.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">אין שדות ברשימה הזאת. מוסיפים אותם במסך הרשימות.</li>}
                  </ul>
                  {nameless && (
                    <p className="flex items-start gap-1.5 text-xs text-warning">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> בלי שדה טקסט (כמו «שם») הרשומות יופיעו לממלא כ«רשומה 1», «רשומה 2»… – הממלא רואה רק שדות שהטופס מקשר.
                    </p>
                  )}
                </section>
              </>
            )}

            <div className="mt-auto flex items-center justify-end gap-2 border-t pt-3">
              <Button variant="outline" onClick={close}>ביטול</Button>
              <Button onClick={add} disabled={!current || chosen.size === 0} className="gap-1">
                <Plus className="size-4" aria-hidden />
                {record ? `הוספת ${chosen.size} שדות עם הערכים של «${record.title}»` : `הוספת ${chosen.size} שדות מקושרים`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

"use client";
import { useState } from "react";
import { PREFILL_KEYS } from "@/lib/forms/prefill";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Switch } from "@/components/ui/checkbox";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { newField, parseOptionsText } from "@/lib/forms/builder";
import { FIELD_TYPES, FIELD_TYPE_META, type FieldType } from "@/lib/forms/field-types";
import { GRID_CELL_LABELS, GRID_CELL_TYPES, gridColumns, gridRows, type GridCellType, type GridColumn } from "@/lib/forms/grid";
import { fillerRoles, type FieldOption, type FieldValidation, type FormDefinition, type FormField } from "@/lib/forms/schema";
import { FIELD_STYLE_OPTIONS, cleanStyle, fieldStyleClass, type FieldStyle } from "@/lib/forms/field-style";
import { cn } from "@/lib/utils";
import { ConditionEditor } from "./ConditionEditor";
import { FormulaEditor } from "./FormulaEditor";

const ROLE_LABELS: Record<string, string> = { requester: "המנהל המבקש", employee: "העובד", approver: "מאשר", payroll: "חשבות שכר", hr: "משאבי אנוש" };
const TEXT_TYPES: FieldType[] = ["short_text", "long_text", "email", "phone", "id_number", "number", "currency", "percent", "dropdown"];

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t pt-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      {children}
    </section>
  );
}

/** Columns of a `grid` field: label, cell type, and options for dropdown cells. */
function GridColumnsEditor({ columns, onChange }: { columns: GridColumn[]; onChange: (c: GridColumn[]) => void }) {
  const patch = (i: number, p: Partial<GridColumn>) => onChange(columns.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <div className="space-y-2">
      {columns.map((c, i) => (
        <div key={c.value} className="space-y-1 rounded-md border p-2">
          <div className="flex gap-2">
            <Input aria-label={`תווית עמודה ${i + 1}`} className="h-9" value={c.label} onChange={(e) => patch(i, { label: e.target.value })} />
            <Select aria-label={`סוג עמודה ${i + 1}`} className="h-9 w-28" value={c.type ?? "text"} onChange={(e) => patch(i, { type: e.target.value as GridCellType })}>
              {GRID_CELL_TYPES.map((t) => <option key={t} value={t}>{GRID_CELL_LABELS[t]}</option>)}
            </Select>
            <Button variant="ghost" size="sm" aria-label={`מחיקת עמודה ${i + 1}`} onClick={() => onChange(columns.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
          {c.type === "dropdown" && (
            <Input
              aria-label={`אפשרויות עמודה ${i + 1}`}
              className="h-9"
              placeholder="אפשרויות מופרדות בפסיק"
              defaultValue={(c.options ?? []).map((o) => o.label).join(", ")}
              onBlur={(e) => patch(i, { options: parseOptionsText(e.target.value.split(",").map((x) => x.trim()).filter(Boolean).join("\n"), c.options ?? []) })}
            />
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...columns, { value: `c${Date.now().toString(36)}`, label: `עמודה ${columns.length + 1}`, type: "text" }])}><Plus className="size-4" />הוספת עמודה</Button>
    </div>
  );
}

function NumberInput({ value, onChange, ...rest }: { value: unknown; onChange: (n: number | undefined) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <Input
      {...rest}
      type="number"
      dir="ltr"
      className="text-start"
      value={value === undefined ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
    />
  );
}

/** Edits a list of {value,label} (options, grid rows/columns) as one line per item. */
export function ListTextarea({ items, onChange, rows = 5 }: { items: FieldOption[]; onChange: (items: FieldOption[]) => void; rows?: number }) {
  const [text, setText] = useState(items.map((o) => o.label).join("\n"));
  return (
    <Textarea
      rows={rows}
      value={text}
      onChange={(e) => { setText(e.target.value); onChange(parseOptionsText(e.target.value, items)); }}
      placeholder={"שורה לכל פריט.\nאפשר להדביק רשימה."}
    />
  );
}

/** Size / color / alignment / bold / highlight for one field, with a live sample line. */
function StyleControls({ style, sample, onChange }: { style: FieldStyle | undefined; sample: string; onChange: (s: FieldStyle | undefined) => void }) {
  const cur = style ?? {};
  const set = (patch: Partial<FieldStyle>) => onChange(cleanStyle({ ...cur, ...patch }));
  return (
    <div className="space-y-3">
      <p className={cn("rounded-md border border-dashed p-2 text-sm font-medium", fieldStyleClass(style))} aria-label="דוגמה לעיצוב">{sample}</p>
      <div className="grid grid-cols-1 gap-2">
        {FIELD_STYLE_OPTIONS.map((g) => (
          <Row key={g.key} label={g.label}>
            <Select aria-label={g.label} value={(cur[g.key as keyof FieldStyle] as string | undefined) ?? g.options[g.key === "size" ? 1 : 0].value} onChange={(e) => set({ [g.key]: e.target.value } as Partial<FieldStyle>)}>
              {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Row>
        ))}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={!!cur.bold} onCheckedChange={(c) => set({ bold: c })} label="בולד" />
        בולד
      </label>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={!!cur.highlight} onCheckedChange={(c) => set({ highlight: c })} label="הדגשת רקע" />
        הדגשת רקע
      </label>
      {style && <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>איפוס עיצוב</Button>}
    </div>
  );
}

export function FieldSettings({
  def, field, onPatch, onRename,
}: {
  def: FormDefinition;
  field: FormField;
  onPatch: (patch: Partial<FormField>) => void;
  onRename: (to: string) => string | undefined;
}) {
  const meta = FIELD_TYPE_META[field.type];
  const v: FieldValidation = field.validation ?? {};
  const setV = (patch: Partial<FieldValidation>) => {
    const next = { ...v, ...patch };
    for (const k of Object.keys(next) as (keyof FieldValidation)[]) if (next[k] === undefined || next[k] === "") delete next[k];
    onPatch({ validation: Object.keys(next).length ? next : undefined });
  };
  const s = field.settings ?? {};
  const setS = (patch: Record<string, unknown>) => onPatch({ settings: { ...s, ...patch } });
  const [idDraft, setIdDraft] = useState(field.id);
  const [idError, setIdError] = useState<string>();

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">סוג: {meta.label}</div>

      <Row label={field.type === "info_text" ? "הטקסט" : "תווית"}>
        {field.type === "info_text" ? (
          <>
            <Textarea rows={5} value={field.label} onChange={(e) => onPatch({ label: e.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground" dir="rtl">
              עיצוב: <code dir="ltr">**מודגש**</code> · <code dir="ltr">*נטוי*</code> · <code dir="ltr">[טקסט](https://…)</code> · שורות שמתחילות ב-<code dir="ltr">- </code> הן רשימה. תשובה קודמת: <code dir="ltr">{"{{fieldId}}"}</code>
            </p>
          </>
        ) : (
          <Input value={field.label} onChange={(e) => onPatch({ label: e.target.value })} />
        )}
      </Row>
      {field.type !== "divider" && field.type !== "info_text" && (
        <Row label="הסבר (אופציונלי)"><Input value={field.description ?? ""} onChange={(e) => onPatch({ description: e.target.value || undefined })} /></Row>
      )}
      {TEXT_TYPES.includes(field.type) && (
        <Row label="טקסט רמז (placeholder)"><Input value={field.placeholder ?? ""} onChange={(e) => onPatch({ placeholder: e.target.value || undefined })} /></Row>
      )}

      {meta.hasAnswer && (
        <>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={!!field.required} onCheckedChange={(c) => onPatch({ required: c || undefined })} label="שדה חובה" />
            שדה חובה
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={!!field.readOnly} onCheckedChange={(c) => onPatch({ readOnly: c || undefined })} label="לקריאה בלבד" />
            לקריאה בלבד (מולא מראש)
          </label>
        </>
      )}

      {field.type !== "divider" && field.type !== "image" && field.type !== "hidden" && (
        <Section title="עיצוב">
          <StyleControls
            style={field.style}
            sample={field.label || "תווית לדוגמה"}
            onChange={(style) => onPatch({ style })}
          />
        </Section>
      )}

      {meta.hasOptions && (
        <Section title="אפשרויות">
          <Row label="מקור הרשימה">
            <Select value={field.optionsSource ?? ""} onChange={(e) => onPatch({ optionsSource: e.target.value || undefined })}>
              <option value="">רשימה ידנית</option>
              <option value="banks">בנקים</option>
              <option value="cities">יישובים (יתחבר בשלב 3)</option>
              <option value="costCenters:1">מרכזי רווח – רמה 1 (יתחבר בשלב 3)</option>
              <option value="costCenters:2">מרכזי רווח – רמה 2 (יתחבר בשלב 3)</option>
              <option value="costCenters:3">מרכזי רווח – רמה 3 (יתחבר בשלב 3)</option>
            </Select>
          </Row>
          {!field.optionsSource && (
            <Row label="פריטים (שורה לכל אפשרות)">
              <ListTextarea key={field.id} items={field.options ?? []} onChange={(options) => onPatch({ options })} />
            </Row>
          )}
          {(field.type === "radio" || field.type === "checkboxes") && (
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={!!field.allowOther} onChange={(e) => onPatch({ allowOther: e.target.checked || undefined })} />
              הוספת אפשרות &quot;אחר&quot;
            </label>
          )}
        </Section>
      )}

      {(field.type === "linear_scale" || field.type === "rating" || field.type === "long_text" || field.type === "image" || field.type === "hidden") && (
        <Section title="הגדרות הסוג">
          {field.type === "linear_scale" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Row label="מ-"><NumberInput value={s.min} onChange={(n) => setS({ min: n ?? 1 })} /></Row>
                <Row label="עד"><NumberInput value={s.max} onChange={(n) => setS({ max: n ?? 5 })} /></Row>
              </div>
              <Row label="תווית לקצה הנמוך"><Input value={String(s.minLabel ?? "")} onChange={(e) => setS({ minLabel: e.target.value })} /></Row>
              <Row label="תווית לקצה הגבוה"><Input value={String(s.maxLabel ?? "")} onChange={(e) => setS({ maxLabel: e.target.value })} /></Row>
            </>
          )}
          {field.type === "rating" && <Row label="מספר כוכבים"><NumberInput value={s.max} min={3} max={10} onChange={(n) => setS({ max: n ?? 5 })} /></Row>}
          {field.type === "long_text" && <Row label="מספר שורות"><NumberInput value={s.rows} min={2} max={20} onChange={(n) => setS({ rows: n ?? 4 })} /></Row>}
          {field.type === "image" && (
            <>
              <Row label="כתובת התמונה (URL)"><Input dir="ltr" value={String(s.src ?? "")} onChange={(e) => setS({ src: e.target.value })} /></Row>
              <Row label="טקסט חלופי"><Input value={String(s.alt ?? "")} onChange={(e) => setS({ alt: e.target.value })} /></Row>
            </>
          )}
          {field.type === "hidden" && <Row label="ערך ברירת מחדל"><Input value={String(field.defaultValue ?? "")} onChange={(e) => onPatch({ defaultValue: e.target.value || undefined })} /></Row>}
        </Section>
      )}

      {(field.type === "radio_grid" || field.type === "checkbox_grid") && (
        <Section title="שורות ועמודות">
          <Row label="שורות (שורה לכל פריט)"><ListTextarea key={`${field.id}-r`} rows={4} items={(s.rows as FieldOption[]) ?? []} onChange={(rows) => setS({ rows })} /></Row>
          <Row label="עמודות (שורה לכל פריט)"><ListTextarea key={`${field.id}-c`} rows={4} items={(s.columns as FieldOption[]) ?? []} onChange={(columns) => setS({ columns })} /></Row>
        </Section>
      )}

      {field.type === "grid" && (
        <Section title="שורות ועמודות">
          <Row label="שורות (שורה לכל פריט)"><ListTextarea key={`${field.id}-gr`} rows={4} items={gridRows(field)} onChange={(rows) => setS({ rows })} /></Row>
          <Row label="עמודות">
            <GridColumnsEditor key={`${field.id}-gc`} columns={gridColumns(field)} onChange={(columns) => setS({ columns })} />
          </Row>
        </Section>
      )}

      {field.type === "repeating_table" && (
        <Section title="טבלה חוזרת">
          <div className="grid grid-cols-2 gap-2">
            <Row label="מינימום שורות"><NumberInput value={s.minRows} min={0} onChange={(n) => setS({ minRows: n ?? 0 })} /></Row>
            <Row label="מקסימום שורות"><NumberInput value={s.maxRows} min={1} onChange={(n) => setS({ maxRows: n })} /></Row>
          </div>
          <Row label="טקסט כפתור ההוספה"><Input value={String(s.addLabel ?? "")} onChange={(e) => setS({ addLabel: e.target.value })} /></Row>
          <TableColumns columns={field.fields ?? []} onChange={(fields) => onPatch({ fields })} />
        </Section>
      )}

      {meta.hasAnswer && <ValidationSection field={field} v={v} setV={setV} />}

      {field.type === "short_text" && (
        <Section title="מסכת קלט וייחודיות">
          <Row label="מסכה" hint='9 = ספרה, a = אות, * = אות או ספרה. למשל 999-9999999'>
            <Input dir="ltr" aria-label="מסכה" value={field.mask ?? ""} onChange={(e) => onPatch({ mask: e.target.value || undefined })} />
          </Row>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={!!field.unique} onCheckedChange={(c) => onPatch({ unique: c || undefined })} label="ערך ייחודי" />
            ערך ייחודי (לא יתקבל ערך שכבר הוגש בבקשה אחרת)
          </label>
        </Section>
      )}

      {meta.hasAnswer && !["signature", "file_upload", "repeating_table", "consent"].includes(field.type) && (
        <Section title="נוסחה (שדה מחושב)">
          <FormulaEditor def={def} field={field} onChange={(formula) => onPatch({ formula })} />
        </Section>
      )}

      {meta.hasAnswer && (
        <Section title="מי ממלא ומיקום">
          <Row label="ממלא בשרשרת החתימות">
            <Select value={field.filledBy ?? "employee"} onChange={(e) => onPatch({ filledBy: e.target.value === "employee" ? undefined : (e.target.value as FormField["filledBy"]) })}>
              {fillerRoles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </Row>
          <Row label="רוחב בדסקטופ">
            <Select value={field.width ?? ""} onChange={(e) => onPatch({ width: (e.target.value || undefined) as FormField["width"] })}>
              <option value="">אוטומטי</option><option value="full">מלא</option><option value="half">חצי</option><option value="third">שליש</option>
            </Select>
          </Row>
          <Row label="מילוי אוטומטי מנתוני העובד/הבקשה">
            <Select aria-label="מילוי אוטומטי מנתוני העובד/הבקשה" value={field.prefill ?? ""} onChange={(e) => onPatch({ prefill: e.target.value || undefined })}>
              <option value="">ללא</option>
              {PREFILL_KEYS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              {field.prefill && !PREFILL_KEYS.some((k) => k.key === field.prefill) && <option value={field.prefill}>{field.prefill}</option>}
            </Select>
          </Row>
        </Section>
      )}

      <Section title="תנאים">
        <ConditionEditor def={def} selfId={field.id} value={field.visibleIf} onChange={(c) => onPatch({ visibleIf: c })} lead="הצג שדה זה אם" />
        <ConditionEditor def={def} selfId={field.id} value={field.disabledIf} onChange={(c) => onPatch({ disabledIf: c })} lead="נעל שדה אם" />
        {meta.hasAnswer && !field.required && (
          <ConditionEditor def={def} selfId={field.id} value={field.requiredIf} onChange={(c) => onPatch({ requiredIf: c })} lead="שדה חובה אם" />
        )}
      </Section>

      <Section title="מתקדם">
        <Row label="מזהה השדה (לא משנים אחרי שמגישים טפסים)" hint={idError}>
          <Input
            dir="ltr"
            value={idDraft}
            aria-invalid={!!idError}
            onChange={(e) => setIdDraft(e.target.value)}
            onBlur={() => { const err = onRename(idDraft); setIdError(err); if (err) setIdDraft(field.id); }}
          />
        </Row>
        {meta.hasAnswer && <Row label="מפתח ייצוא (Priority/CSV)"><Input dir="ltr" value={field.exportKey ?? ""} onChange={(e) => onPatch({ exportKey: e.target.value || undefined })} /></Row>}
      </Section>
    </div>
  );
}

function ValidationSection({ field, v, setV }: { field: FormField; v: FieldValidation; setV: (p: Partial<FieldValidation>) => void }) {
  const t = field.type;
  const rows: React.ReactNode[] = [];
  if (t === "short_text" || t === "long_text") {
    rows.push(
      <div key="len" className="grid grid-cols-2 gap-2">
        <Row label="אורך מינימלי"><NumberInput value={v.minLength} min={0} onChange={(n) => setV({ minLength: n })} /></Row>
        <Row label="אורך מקסימלי"><NumberInput value={v.maxLength} min={1} onChange={(n) => setV({ maxLength: n })} /></Row>
      </div>,
      <Row key="pat" label="תבנית (Regex)"><Input dir="ltr" value={v.pattern ?? ""} onChange={(e) => setV({ pattern: e.target.value || undefined })} /></Row>,
      <Row key="patm" label="הודעת שגיאה לתבנית"><Input value={v.patternMessage ?? ""} onChange={(e) => setV({ patternMessage: e.target.value || undefined })} /></Row>,
    );
  }
  if (t === "number" || t === "currency" || t === "percent") {
    rows.push(
      <div key="mm" className="grid grid-cols-2 gap-2">
        <Row label="מינימום"><NumberInput value={v.min} onChange={(n) => setV({ min: n })} /></Row>
        <Row label="מקסימום"><NumberInput value={v.max} onChange={(n) => setV({ max: n })} /></Row>
      </div>,
    );
  }
  if (t === "date") {
    rows.push(
      <Row key="d1" label="תאריך מינימלי" hint='yyyy-mm-dd או "today"'><Input dir="ltr" value={v.minDate ?? ""} onChange={(e) => setV({ minDate: e.target.value || undefined })} /></Row>,
      <Row key="d2" label="תאריך מקסימלי"><Input dir="ltr" value={v.maxDate ?? ""} onChange={(e) => setV({ maxDate: e.target.value || undefined })} /></Row>,
    );
  }
  if (t === "checkboxes") {
    rows.push(
      <div key="sel" className="grid grid-cols-2 gap-2">
        <Row label="מינימום נבחרים"><NumberInput value={v.minSelected} min={0} onChange={(n) => setV({ minSelected: n })} /></Row>
        <Row label="מקסימום נבחרים"><NumberInput value={v.maxSelected} min={1} onChange={(n) => setV({ maxSelected: n })} /></Row>
      </div>,
    );
  }
  if (t === "file_upload") {
    rows.push(
      <div key="f" className="grid grid-cols-2 gap-2">
        <Row label="מספר קבצים מקסימלי"><NumberInput value={v.maxFiles} min={1} onChange={(n) => setV({ maxFiles: n })} /></Row>
        <Row label="גודל מקסימלי (MB)"><NumberInput value={v.maxSizeMb} min={1} onChange={(n) => setV({ maxSizeMb: n })} /></Row>
      </div>,
      <Row key="acc" label="סוגי קבצים מותרים" hint="למשל: .pdf,.jpg,image/*"><Input dir="ltr" value={(v.accept ?? []).join(",")} onChange={(e) => setV({ accept: e.target.value ? e.target.value.split(",").map((x) => x.trim()).filter(Boolean) : undefined })} /></Row>,
    );
  }
  if (!rows.length) return null;
  return <Section title="בדיקות תקינות">{rows}</Section>;
}

const TABLE_COLUMN_TYPES = FIELD_TYPES.filter((t) => FIELD_TYPE_META[t].hasAnswer && !["repeating_table", "radio_grid", "checkbox_grid", "signature", "file_upload", "hidden", "bank_account", "full_name"].includes(t));

function TableColumns({ columns, onChange }: { columns: FormField[]; onChange: (cols: FormField[]) => void }) {
  const patch = (i: number, p: Partial<FormField>) => onChange(columns.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">עמודות הטבלה</Label>
      {columns.map((c, i) => (
        <div key={c.id} className="space-y-1.5 rounded-md border p-2">
          <div className="flex gap-2">
            <Input aria-label="שם העמודה" value={c.label} onChange={(e) => patch(i, { label: e.target.value })} className="h-9" />
            <Button variant="ghost" size="sm" aria-label="מחיקת עמודה" disabled={columns.length <= 1} onClick={() => onChange(columns.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
          <div className="flex items-center gap-2">
            <Select aria-label="סוג העמודה" value={c.type} className="h-9" onChange={(e) => {
              const type = e.target.value as FieldType;
              const fresh = newField(type, new Set(columns.map((x) => x.id).filter((id) => id !== c.id)));
              patch(i, { type, options: fresh.options, settings: fresh.settings });
            }}>
              {TABLE_COLUMN_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_META[t].label}</option>)}
            </Select>
            <label className="flex shrink-0 items-center gap-2 text-sm"><Checkbox checked={!!c.required} onChange={(e) => patch(i, { required: e.target.checked || undefined })} />חובה</label>
          </div>
          {FIELD_TYPE_META[c.type].hasOptions && (
            <ListTextarea key={`${c.id}-${c.type}`} rows={3} items={c.options ?? []} onChange={(options) => patch(i, { options })} />
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => {
        const f = newField("short_text", new Set(columns.map((x) => x.id)));
        onChange([...columns, { ...f, label: `עמודה ${columns.length + 1}` }]);
      }}><Plus className="size-4" />עמודה חדשה</Button>
    </div>
  );
}

export function PageSettings({
  def, index, onPatch,
}: {
  def: FormDefinition;
  index: number;
  onPatch: (patch: Partial<FormDefinition["pages"][number]>) => void;
}) {
  const page = def.pages[index]!;
  return (
    <div className="space-y-4">
      <Row label="כותרת העמוד"><Input value={page.title} onChange={(e) => onPatch({ title: e.target.value })} /></Row>
      <Row label="הסבר (אופציונלי)"><Textarea rows={2} value={page.description ?? ""} onChange={(e) => onPatch({ description: e.target.value || undefined })} /></Row>
      <Section title="תנאי הצגת העמוד">
        <ConditionEditor def={def} value={page.visibleIf} onChange={(c) => onPatch({ visibleIf: c })} lead="הצג עמוד זה אם" />
      </Section>
      <Section title="דילוג בטופס">
        <p className="text-xs text-muted-foreground">אחרי העמוד הזה עוברים לעמוד הבא, אלא אם אחד התנאים כאן מתקיים (הראשון שמתקיים קובע).</p>
        {(page.nextPage ?? []).map((rule, i) => (
          <div key={i} className="space-y-2 rounded-md border p-2">
            <ConditionEditor
              def={def}
              value={rule.if}
              onChange={(c) => onPatch({ nextPage: (page.nextPage ?? []).map((r, j) => (j === i ? { ...r, if: c ?? r.if } : r)) })}
              lead="אם"
            />
            <div className="flex items-center gap-2">
              <Select
                aria-label="לדלג אל"
                value={rule.goTo}
                onChange={(e) => onPatch({ nextPage: (page.nextPage ?? []).map((r, j) => (j === i ? { ...r, goTo: e.target.value } : r)) })}
              >
                {def.pages.slice(index + 1).map((p) => <option key={p.id} value={p.id}>{p.title || p.id}</option>)}
                <option value="end">סיום (שליחה)</option>
              </Select>
              <Button variant="ghost" size="sm" aria-label="הסרת כלל" onClick={() => onPatch({ nextPage: (page.nextPage ?? []).filter((_, j) => j !== i).length ? (page.nextPage ?? []).filter((_, j) => j !== i) : undefined })}><Trash2 className="size-4" /></Button>
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const firstField = def.pages.flatMap((p) => p.fields).find((f) => FIELD_TYPE_META[f.type].hasAnswer);
            const target = def.pages[index + 1]?.id ?? "end";
            onPatch({ nextPage: [...(page.nextPage ?? []), { if: firstField ? { field: firstField.id, op: "eq" as const, value: "" } : { all: [] }, goTo: target }] });
          }}
        >
          <Plus className="size-4" />כלל דילוג
        </Button>
      </Section>
    </div>
  );
}

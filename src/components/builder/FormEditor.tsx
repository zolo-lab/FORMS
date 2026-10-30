"use client";
import { StepsEditor, type EditorDraft, type StepsSaveState } from "@/components/packages/StepsEditor";
import type { SaveStepsResult } from "@/app/admin/packages/actions";
import { assignRoles, type StepDraft } from "@/lib/workflow/step-who";
import { answerFields, emailFieldsOf, fieldRole, stepViews, unassignedFields, type StepView } from "@/lib/workflow/step-fields";
import type { FillerRole } from "@/lib/forms/schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, Redo2, Undo2, Sparkles } from "lucide-react";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { publishAction, saveDraftAction } from "@/app/admin/forms/actions";
import {
  addField, addPage, duplicateField, findLocation, moveField, movePage, publishIssues, removeField, removePage,
  renameFieldId, updateField, updatePage,
} from "@/lib/forms/builder";
import { fieldsLeftWithoutStamps, pruneStamps } from "@/lib/forms/pdf-items";
import { orderByPdf } from "@/lib/forms/pdf-draw";
import { fieldDictionary, renameStamps, suggestFieldIds } from "@/lib/forms/field-dictionary";
import { buildXlsx } from "@/lib/export/xlsx";
import type { Answers } from "@/lib/forms/conditions";
import type { FieldType } from "@/lib/forms/field-types";
import { parseFormDefinition, type FormDefinition, type FormField } from "@/lib/forms/schema";
import { Canvas, type Selection } from "./Canvas";
import { FormSettings } from "./FormSettings";
import { Palette } from "./Palette";
import { FieldSettings, PageSettings } from "./SettingsPanel";
import { FormTestFill } from "@/components/forms/FormTestFill";
import { PdfTab, type PdfState } from "./PdfTab";

type TabId = "edit" | "preview" | "pdf" | "steps" | "json";
type HistoryEntry = { def: FormDefinition; pdf?: PdfState | null };
type SaveState = "saved" | "saving" | "dirty" | "error";

export interface FormEditorProps {
  templateId: string;
  initial: FormDefinition;
  initialVersion: number;
  initiallyPublished: boolean;
  initialPdf: PdfState | null;
  initialTab?: TabId;
  /** A form that was never published and has no document yet: publishing needs one. */
  needsPdf?: boolean;
  /** Saved groups, offered as an option source for dropdowns ("the requester picks the approver"). */
  groups?: { id: string; name: string }[];
  /** The form's steps ("שלבי הטופס"), edited in their own tab; each field belongs to one of them. */
  flow?: {
    packageId: string;
    drafts: StepDraft[];
    contacts: { id: string; label: string }[];
    groups: { id: string; label: string }[];
    save: (packageId: string, drafts: StepDraft[]) => Promise<SaveStepsResult>;
    /** Sending settings (recipients, reminders…), rendered on the server. */
    sendSettings?: React.ReactNode;
  };
}

/** A draft as the server takes it (without the editor's own keys). */
const stripDraft = (e: EditorDraft): StepDraft => { const d: Partial<EditorDraft> = { ...e }; delete d.key; delete d.origRole; return d as StepDraft; };

export function FormEditor({ templateId, initial, initialVersion, initiallyPublished, initialPdf, initialTab = "edit", needsPdf = false, groups = [], flow }: FormEditorProps) {
  const [def, setDef] = useState(initial);
  // The steps being edited (kept here so switching tabs never loses them) and the ones last saved.
  const [stepWork, setStepWork] = useState<EditorDraft[]>(() => (flow?.drafts ?? []).map((d) => ({ ...d, key: crypto.randomUUID(), origRole: d.role })));
  const [stepSaved, setStepSaved] = useState(stepWork);
  const [stepState, setStepState] = useState<StepsSaveState>({ kind: "idle" });
  const stepsDirty = JSON.stringify(stepWork.map(stripDraft)) !== JSON.stringify(stepSaved.map(stripDraft));
  const ctx = { contacts: flow?.contacts, groups: flow?.groups, fields: emailFieldsOf(def) };
  const views: StepView[] | undefined = flow ? stepViews(stepWork, ctx) : undefined;
  const stepRoles = (views ?? []).map((v) => v.role);
  const unassigned = flow ? unassignedFields(def, stepRoles) : [];
  // "סימון שדות לשלב": the fields of one step are marked, in the responsive form and on the PDF.
  const [focusRole, setFocusRole] = useState<FillerRole | "">("");
  // One history for the form and its boxes on the PDF: undoing a delete brings back the field and its boxes together.
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const [selection, setSelection] = useState<Selection | null>({ kind: "page", index: 0 });
  const [tab, setTab] = useState<TabId>(initialTab);
  const [save, setSave] = useState<SaveState>("saved");
  const [version, setVersion] = useState(initialVersion);
  const [published, setPublished] = useState(initiallyPublished);
  const [pdf, setPdfState] = useState<PdfState | null>(() => initialPdf && { ...initialPdf, mapping: { ...initialPdf.mapping, stamps: pruneStamps(initial, initialPdf.mapping.stamps) } });
  // The latest boxes, for handlers that run before React re-renders (kept in step with every write below).
  const pdfRef = useRef(pdf);
  const setPdf = useCallback((next: PdfState | null) => { pdfRef.current = next; setPdfState(next); }, []);
  const [issues, setIssues] = useState<string[]>([]);
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const first = useRef(true);
  /** Runs once after the next successful autosave (e.g. saving the steps that follow a renamed field). */
  const afterSave = useRef<(() => void) | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** Published once: answers are stored under the field ids, so ids stay and only the export keys are filled. */
  const everPublished = initiallyPublished || initialVersion > 1;

  function autoIds() {
    const pairs = suggestFieldIds(def);
    if (!pairs.length) { setNote("לכל השדות כבר יש שמות מזהים."); return; }
    if (everPublished) {
      let next = def;
      let n = 0;
      for (const [from, to] of pairs) {
        const loc = findLocation(next, from);
        const f = loc ? next.pages[loc.page]!.fields[loc.index]! : null;
        if (f && !f.exportKey?.trim()) { next = updateField(next, from, { exportKey: to }); n++; }
      }
      commit(next);
      setNote(n ? `נוספו ${n} מפתחות ייצוא. המזהים עצמם לא השתנו כי הטופס כבר פורסם.` : "לכל השדות כבר יש מפתח ייצוא.");
      return;
    }
    let next = def;
    let stamps = pdf?.mapping.stamps ?? [];
    for (const [from, to] of pairs) {
      const r = renameFieldId(next, from, to);
      if (r.error) continue;
      next = r.def;
      stamps = renameStamps(stamps, from, to);
    }
    commit(next, pdf && { ...pdf, mapping: { ...pdf.mapping, stamps } });
    followRename(pairs);
    setNote(`${pairs.length} שדות קיבלו שם מזהה.`);
  }

  function downloadDictionary() {
    const bytes = buildXlsx(fieldDictionary(def, pdf?.mapping.stamps ?? []), "שדות");
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(def.title || "טופס").replace(/[\\/:*?"<>|]/g, "_")} - שדות.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * All edits go through here so undo/redo and autosave see them. The PDF boxes follow the form: a field that is
   * gone takes its boxes along (`nextPdf` when the caller already changed them).
   */
  const commit = useCallback((next: FormDefinition, nextPdf?: PdfState | null) => {
    const cur = pdfRef.current;
    const target = nextPdf !== undefined ? nextPdf : cur;
    const synced = target && { ...target, mapping: { ...target.mapping, stamps: pruneStamps(next, target.mapping.stamps) } };
    const stampsChanged = !!cur && !!synced && synced.mapping.stamps !== cur.mapping.stamps;
    setPast((p) => [...p.slice(-49), { def, pdf: stampsChanged ? cur : undefined }]);
    setFuture([]);
    setDef(next);
    if (stampsChanged || nextPdf !== undefined) setPdf(synced);
  }, [def, setPdf]);

  /** Box edits on the PDF. Deleting the last box of a field deletes the field (one undo step for both). */
  const changePdf = (next: PdfState | null) => {
    const cur = pdfRef.current;
    const lost = cur && next && cur.file.id === next.file.id ? fieldsLeftWithoutStamps(cur.mapping.stamps, next.mapping.stamps) : [];
    if (!lost.length) { setPdf(next); return; }
    commit(lost.reduce((d, id) => removeField(d, id), def), next);
    setSelection(null);
  };

  const step = (from: HistoryEntry[], to: (f: (h: HistoryEntry[]) => HistoryEntry[]) => void, take: "last" | "first") => {
    if (!from.length) return from;
    const entry = take === "last" ? from.at(-1)! : from[0]!;
    const cur = pdfRef.current;
    to((h) => (take === "last" ? [{ def, pdf: entry.pdf ? cur : undefined }, ...h] : [...h, { def, pdf: entry.pdf ? cur : undefined }]));
    setDef(entry.def);
    if (entry.pdf !== undefined) setPdf(entry.pdf);
    return take === "last" ? from.slice(0, -1) : from.slice(1);
  };
  const undo = () => setPast((p) => step(p, setFuture, "last"));
  const redo = () => setFuture((f) => step(f, setPast, "first"));

  // Debounced autosave of the draft.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSave("dirty");
    const t = setTimeout(async () => {
      setSave("saving");
      const r = await saveDraftAction(templateId, def, { pdfFileId: pdf?.file.id ?? null, pdfMapping: pdf?.mapping ?? null });
      if ("error" in r) { setSave("error"); return; }
      setVersion(r.version);
      setPublished(false);
      setSave("saved");
      const then = afterSave.current;
      afterSave.current = null;
      then?.();
    }, 1200);
    return () => clearTimeout(t);
  }, [def, pdf, templateId]);

  const selectedField: FormField | null = useMemo(() => {
    if (selection?.kind !== "field") return null;
    const loc = findLocation(def, selection.id);
    return loc ? def.pages[loc.page]!.fields[loc.index]! : null;
  }, [def, selection]);

  const addAt = (type: FieldType, page: number, index: number) => {
    const r = addField(def, type, { page, index });
    commit(r.def);
    setSelection({ kind: "field", id: r.id });
  };
  const addToEnd = (type: FieldType) => {
    const page = selection?.kind === "page" ? selection.index : selectedField ? findLocation(def, selectedField.id)!.page : def.pages.length - 1;
    addAt(type, page, def.pages[page]!.fields.length);
  };

  const stepField = (id: string, dir: -1 | 1) => {
    const loc = findLocation(def, id)!;
    const page = def.pages[loc.page]!;
    if (dir === -1) {
      if (loc.index > 0) commit(moveField(def, id, { page: loc.page, index: loc.index - 1 }));
      else if (loc.page > 0) commit(moveField(def, id, { page: loc.page - 1, index: def.pages[loc.page - 1]!.fields.length }));
    } else if (loc.index < page.fields.length - 1) commit(moveField(def, id, { page: loc.page, index: loc.index + 2 }));
    else if (loc.page < def.pages.length - 1) commit(moveField(def, id, { page: loc.page + 1, index: 0 }));
  };

  /** Steps edits: every step that goes to a person keeps its own role; roles still held by fields are not reused. */
  function changeSteps(next: EditorDraft[]) {
    const held = answerFields(def).map(fieldRole).filter((r) => !next.some((d) => d.role === r));
    setStepWork(assignRoles(next, held));
    setStepState({ kind: "idle" });
  }

  async function saveSteps(work = stepWork) {
    if (!flow) return;
    setStepState({ kind: "saving" });
    const r = await flow.save(flow.packageId, work.map(stripDraft));
    if (!r.ok) { setStepState({ kind: "error", errors: r.errors }); return; }
    // A step whose role changed (e.g. a person step became "the employee") takes its fields along.
    const moved = new Map(work.filter((d) => d.origRole && d.origRole !== d.role).map((d) => [d.origRole!, d.role]));
    if (moved.size) {
      let next = def;
      for (const f of answerFields(def)) { const to = moved.get(fieldRole(f)); if (to) next = updateField(next, f.id, { filledBy: to }); }
      if (next !== def) commit(next);
    }
    const now = work.map((d) => ({ ...d, origRole: d.role }));
    setStepWork(now);
    setStepSaved(now);
    setStepState({ kind: "saved" });
  }

  /** A field renamed: a step sent to its email follows, saved right after the form itself is saved. */
  function followRename(pairs: [string, string][]) {
    const map = new Map(pairs);
    if (!stepWork.some((d) => d.fieldId && map.has(d.fieldId))) return;
    const next = stepWork.map((d) => (d.fieldId && map.has(d.fieldId) ? { ...d, fieldId: map.get(d.fieldId) } : d));
    setStepWork(next);
    afterSave.current = () => void saveSteps(next);
  }

  async function onPublish() {
    if (unassigned.length) {
      setIssues([`${unassigned.length} שדות לא משויכים לאף שלב (${unassigned.slice(0, 3).map((f) => f.label || f.id).join(", ")}${unassigned.length > 3 ? "…" : ""}). בחרו "סימון שדות לשלב" כדי לשייך אותם.`]);
      return;
    }
    const problems = publishIssues(def);
    if (problems.length) { setIssues(problems.map((p) => p.message)); return; }
    setSave("saving");
    const saved = await saveDraftAction(templateId, def, { pdfFileId: pdf?.file.id ?? null, pdfMapping: pdf?.mapping ?? null });
    if ("error" in saved) { setSave("error"); setIssues([saved.error]); return; }
    const r = await publishAction(templateId);
    if (!r.ok) { setSave("error"); setIssues(r.issues); return; }
    setIssues([]);
    setVersion(r.version);
    setPublished(true);
    setSave("saved");
  }

  const SAVE_LABEL: Record<SaveState, string> = { saved: "נשמר", saving: "שומר…", dirty: "יש שינויים…", error: "השמירה נכשלה" };
  const exportJson = JSON.stringify(def, null, 2);

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-2">
        <Link href="/admin/forms" className="text-sm text-muted-foreground hover:text-foreground">← טפסים</Link>
        <Input
          aria-label="שם הטופס"
          value={def.title}
          onChange={(e) => commit({ ...def, title: e.target.value })}
          className="h-9 max-w-xs font-semibold"
        />
        <Badge tone={published ? "success" : "warning"}>{published ? `גרסה ${version} פורסמה` : `טיוטה (גרסה ${version})`}</Badge>
        <span role="status" className="text-xs text-muted-foreground">{SAVE_LABEL[save]}</span>
        <Button variant="outline" size="sm" onClick={() => { setTab("edit"); setSelection(null); }}>הגדרות הטופס</Button>
        <a
          href={`/preview/form/${templateId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline"
        >
          צפייה בטופס (בחלון חדש)
        </a>
        <div className="ms-auto flex flex-wrap items-center gap-1">
          <details className="relative">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1 rounded-md border px-3 text-sm hover:bg-accent">כלים<ChevronDown className="size-4" aria-hidden /></summary>
            <div className="absolute end-0 z-20 mt-1 flex w-60 flex-col gap-1 rounded-md border bg-card p-1 shadow-md">
              <Button variant="ghost" size="sm" className="justify-start" onClick={autoIds} title="שם באנגלית לכל שדה לפי התווית, לשדות שעדיין אין להם">
                <Sparkles className="size-4" />שמות מזהים לשדות
              </Button>
              <Button variant="ghost" size="sm" className="justify-start" onClick={downloadDictionary}>
                <Download className="size-4" />רשימת השדות (Excel)
              </Button>
              {pdf && pdf.mapping.stamps.length > 0 && (
                <Button variant="ghost" size="sm" className="justify-start" onClick={() => commit(orderByPdf(def, pdf.mapping.stamps))} title="מסדר את השדות בכל עמוד לפי המקום שלהם במסמך">סידור השדות לפי ה-PDF</Button>
              )}
              <Button variant="ghost" size="sm" className="justify-start" onClick={() => { setTab("json"); setJsonText(exportJson); setJsonError(null); }}>JSON (גיבוי והעברה)</Button>
            </div>
          </details>
          <Button variant="ghost" size="icon" aria-label="ביטול" disabled={!past.length} onClick={undo}><Undo2 className="size-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="שחזור" disabled={!future.length} onClick={redo}><Redo2 className="size-4" /></Button>
          <Button onClick={onPublish} disabled={published || save === "saving"}>{published ? "פורסם" : "פרסום"}</Button>
        </div>
      </div>

      {note && (
        <div role="status" className="flex items-center gap-2 border-b bg-muted px-4 py-2 text-sm">
          <span>{note}</span>
          <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setNote(null)}>סגירה</Button>
        </div>
      )}
      {issues.length > 0 && (
        <div role="alert" className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <p className="font-medium">אי אפשר לפרסם עדיין:</p>
          <ul className="list-disc ps-5">{issues.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
      {needsPdf && !pdf && tab !== "pdf" && (
        <p role="status" className="flex flex-wrap items-center gap-2 border-b bg-muted px-4 py-1.5 text-sm">
          הטופס עדיין בלי מסמך, ואי אפשר לפרסם אותו עד שמעלים PDF.
          <Button variant="outline" size="sm" onClick={() => setTab("pdf")}>להעלאת המסמך</Button>
        </p>
      )}
      {published && (
        <p className="border-b bg-muted px-4 py-1.5 text-xs text-muted-foreground">גרסה {version} נעולה. כל שינוי ייצור אוטומטית גרסה {version + 1} כטיוטה.</p>
      )}

      <div className="flex flex-wrap items-end gap-x-4 px-4 pt-2">
        <Tabs<TabId>
          value={tab}
          onChange={(t) => { setTab(t); if (t === "json") { setJsonText(exportJson); setJsonError(null); } }}
          tabs={[
            { id: "pdf", label: "מסמך PDF" },
            { id: "edit", label: "עריכה (רספונסיבי)" },
            ...(flow ? [{ id: "steps" as const, label: stepsDirty ? "שלבי הטופס •" : "שלבי הטופס" }] : []),
            { id: "preview", label: "תצוגה מקדימה" },
            ...(tab === "json" ? [{ id: "json" as const, label: "JSON" }] : []),
          ]}
        />
      </div>
      {views && (tab === "edit" || tab === "pdf") && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/40 px-4 py-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="font-medium">סימון שדות לשלב</span>
            <Select className="h-9 w-64" aria-label="סימון שדות לשלב" value={focusRole} onChange={(e) => setFocusRole(e.target.value as FillerRole | "")}>
              <option value="">— בחרו שלב —</option>
              {views.map((v) => <option key={v.index} value={v.role}>{v.label}</option>)}
              {unassigned.length > 0 && <option value="unassigned">שדות שלא משויכים לשלב ({unassigned.length})</option>}
            </Select>
          </label>
          {focusRole && focusRole !== "unassigned" && (
            <span className="text-muted-foreground">
              <strong className="text-foreground">{answerFields(def).filter((f) => fieldRole(f) === focusRole).length}</strong> שדות בשלב הזה. {tab === "edit" ? "סמנו שדה כדי להוסיף אותו לשלב, או בטלו סימון כדי להוציא." : "סמנו תיבות (Shift+לחיצה לכמה) ובחרו להן שלב בחלונית."}
            </span>
          )}
          {focusRole === "unassigned" && <span className="text-destructive">השדות המודגשים לא שייכים לאף שלב: אף אחד לא ימלא אותם.</span>}
          {focusRole && <Button variant="ghost" size="sm" onClick={() => setFocusRole("")}>סיום</Button>}
          {!focusRole && unassigned.length > 0 && (
            <span className="flex flex-wrap items-center gap-2 text-destructive">
              {unassigned.length} שדות לא משויכים לאף שלב.
              <Button variant="outline" size="sm" onClick={() => setFocusRole("unassigned")}>הצגה</Button>
              <Button variant="outline" size="sm" onClick={() => { commit(unassigned.reduce((d, f) => updateField(d, f.id, { filledBy: views[0]!.role }), def)); setIssues([]); }}>שיוך כולם לשלב 1</Button>
            </span>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "edit" && (
          <div className="grid h-full grid-cols-1 gap-4 p-4 lg:grid-cols-[14rem_1fr_20rem]">
            {/* On phones the canvas comes first and the palette folds into a drawer under it (builder-plan 2.2). */}
            <aside className="order-2 lg:order-none lg:overflow-auto">
              <details className="rounded-lg border bg-card p-3 lg:hidden">
                <summary className="cursor-pointer text-sm font-medium">הוספת שדה</summary>
                <div className="mt-3"><Palette onAdd={addToEnd} /></div>
              </details>
              <div className="hidden lg:block"><Palette onAdd={addToEnd} /></div>
            </aside>
            <div className="order-1 lg:order-none lg:overflow-auto">
              <Canvas
                def={def}
                focusRole={focusRole || undefined}
                stepNames={views ? Object.fromEntries(views.map((v) => [v.role, v.label])) : undefined}
                selection={selection}
                onSelect={setSelection}
                onPatchField={(id, patch) => commit(updateField(def, id, patch))}
                onDropAt={(page, index, data) => {
                  if (data.type) addAt(data.type, page, index);
                  else if (data.fieldId) commit(moveField(def, data.fieldId, { page, index }));
                }}
                onMoveField={stepField}
                onDuplicate={(id) => { const r = duplicateField(def, id); commit(r.def); setSelection({ kind: "field", id: r.id }); }}
                onRemove={(id) => { commit(removeField(def, id)); setSelection(null); }}
                onAddPage={() => { commit(addPage(def)); setSelection({ kind: "page", index: def.pages.length }); }}
                onRemovePage={(i) => { commit(removePage(def, i)); setSelection({ kind: "page", index: 0 }); }}
                onMovePage={(i, dir) => { commit(movePage(def, i, i + dir)); setSelection({ kind: "page", index: i + dir }); }}
              />
            </div>
            <aside className="order-3 rounded-lg border bg-card p-3 lg:order-none lg:overflow-auto" aria-label="הגדרות">
              {selectedField ? (
                <FieldSettings
                  key={selectedField.id}
                  def={def}
                  field={selectedField}
                  groups={groups}
                  steps={views}
                  onPatch={(patch) => commit(updateField(def, selectedField.id, patch))}
                  onMoveToPage={(pi) => commit(moveField(def, selectedField.id, { page: pi, index: def.pages[pi]!.fields.length }))}
                  onRename={(to) => {
                    const r = renameFieldId(def, selectedField.id, to);
                    if (r.error) return r.error;
                    // The places on the document follow the new id.
                    commit(r.def, pdf && { ...pdf, mapping: { ...pdf.mapping, stamps: renameStamps(pdf.mapping.stamps, selectedField.id, to) } });
                    followRename([[selectedField.id, to]]);
                    setSelection({ kind: "field", id: to });
                  }}
                />
              ) : selection?.kind === "page" && def.pages[selection.index] ? (
                <PageSettings def={def} index={selection.index} onPatch={(patch) => commit(updatePage(def, (selection as { index: number }).index, patch))} />
              ) : (
                <FormSettings def={def} onPatch={(patch) => commit({ ...def, ...patch })} />
              )}
            </aside>
          </div>
        )}

        {tab === "preview" && (
          <div className={pdf ? "mx-auto max-w-5xl p-4" : "mx-auto max-w-3xl p-4"}>
            <p className="mb-4 rounded-md bg-muted p-2 text-xs text-muted-foreground">תצוגה מקדימה חיה. המילוי כאן לא נשמר.</p>
            {pdf ? (
              <FormTestFill key={`${pdf.file.id}-${pdf.mapping.stamps.length}`} definition={def} pdf={{ fileId: pdf.file.id, url: pdf.file.url, mapping: pdf.mapping }} />
            ) : (
              <FormRenderer definition={def} answers={previewAnswers} onChange={setPreviewAnswers} onUpload={async (f) => ({ url: URL.createObjectURL(f), name: f.name, size: f.size, mime: f.type })} />
            )}
          </div>
        )}

        {tab === "steps" && flow && (
          <div className="mx-auto max-w-3xl space-y-6 p-4">
            <section className="space-y-3" aria-labelledby="steps-h">
              <div>
                <h2 id="steps-h" className="text-lg font-semibold">שלבי הטופס</h2>
                <p className="text-sm text-muted-foreground">הטופס עובר בין השלבים לפי הסדר. אילו שדות ממלאים בכל שלב בוחרים ב&quot;סימון שדות לשלב&quot; בלשוניות העריכה וה-PDF, או בהגדרות השדה.</p>
              </div>
              <StepsEditor
                drafts={stepWork}
                onChange={changeSteps}
                contacts={flow.contacts}
                groups={flow.groups}
                emailFields={emailFieldsOf(def)}
                dirty={stepsDirty}
                state={stepState}
                onSave={() => void saveSteps()}
                waitingForForm={save !== "saved"}
              />
            </section>
            {flow.sendSettings && (
              <details className="rounded-lg border bg-card p-4">
                <summary className="cursor-pointer font-semibold">הגדרות שליחה: מקבלי המסמכים, תזכורות ותוקף הקישורים</summary>
                <div className="mt-4">{flow.sendSettings}</div>
              </details>
            )}
          </div>
        )}
        {tab === "pdf" && <div className="p-4"><PdfTab templateId={templateId} steps={views} focusRole={focusRole} definition={def} pdf={pdf} onChange={changePdf} onDefinitionChange={(d) => commit(d)} /></div>}

        {tab === "json" && (
          <div className="mx-auto max-w-4xl space-y-3 p-4">
            <p className="text-sm text-muted-foreground">גיבוי והעברה של הגדרת הטופס. אפשר לערוך ולהחיל, או להעתיק לשמירה.</p>
            <Textarea dir="ltr" rows={22} value={jsonText} onChange={(e) => setJsonText(e.target.value)} className="font-mono text-xs" />
            {jsonError && <p role="alert" className="text-sm text-destructive">{jsonError}</p>}
            <div className="flex gap-2">
              <Button onClick={() => {
                try {
                  const parsed = parseFormDefinition(JSON.parse(jsonText));
                  if (!parsed.success) { setJsonError(`הגדרה לא תקינה: ${parsed.error.issues[0]?.message ?? ""}`); return; }
                  setJsonError(null);
                  commit(parsed.data);
                  setSelection({ kind: "page", index: 0 });
                } catch { setJsonError("JSON לא תקין"); }
              }}>החלה</Button>
              <Button variant="outline" onClick={() => navigator.clipboard?.writeText(exportJson)}>העתקה</Button>
              <Button variant="outline" onClick={() => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([exportJson], { type: "application/json" }));
                a.download = `${def.title || "form"}.json`;
                a.click();
              }}>הורדה</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

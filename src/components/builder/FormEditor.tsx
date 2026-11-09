"use client";
import type { PickMode } from "@/lib/forms/pick-mode";
import { dependentsOf, revealWord, setDependents } from "@/lib/forms/dependents";
import { cn } from "@/lib/utils";
import { StepsEditor, type EditorDraft, type StepsSaveState } from "@/components/packages/StepsEditor";
import { OrgRoutes } from "@/components/packages/OrgRoutes";
import type { SaveStepsResult } from "@/app/admin/packages/actions";
import { assignRoles, type StepDraft } from "@/lib/workflow/step-who";
import { answerFields, comboPatch, emailFieldsOf, fieldRole, stepComboOptions, stepViews, unassignedFields, type StepView } from "@/lib/workflow/step-fields";
import type { FillerRole } from "@/lib/forms/schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, History, Link2, Pencil, Redo2, Settings2, Undo2, Sparkles } from "lucide-react";
import { VersionsDialog } from "./VersionsDialog";
import { LinkedFieldsDialog } from "./LinkedFieldsDialog";
import type { OrgListField } from "@/lib/forms/linked";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { Button } from "@/components/ui/button";
import { FormLinks } from "@/components/forms/FormLinks";
import { Badge } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { publishAction, saveDraftAction } from "@/app/admin/forms/actions";
import {
  addField, addPage, duplicateField, findLocation, moveField, movePage, publishIssues, removeField, removePage,
  renameFieldId, updateField, updatePage,
} from "@/lib/forms/builder";
import { fieldsLeftWithoutStamps, pruneStamps } from "@/lib/forms/pdf-items";
import { orderByPdf, splitStepAt } from "@/lib/forms/pdf-draw";
import { applyCheckboxLinks, suggestCheckboxLinks, type LinkSuggestion } from "@/lib/forms/checkbox-links";
import { CheckboxLinksDialog } from "./CheckboxLinksDialog";
import { fieldDictionary, renameStamps, suggestFieldIds } from "@/lib/forms/field-dictionary";
import { buildXlsx } from "@/lib/export/xlsx";
import type { Answers } from "@/lib/forms/conditions";
import type { FieldType } from "@/lib/forms/field-types";
import { fillsIn, findField, parseFormDefinition, type FormDefinition, type FormField } from "@/lib/forms/schema";
import { Canvas, type Selection } from "./Canvas";
import { FormSettings } from "./FormSettings";
import { Palette } from "./Palette";
import { FieldSettings, PageSettings } from "./SettingsPanel";
import { FormTestFill } from "@/components/forms/FormTestFill";
import { PdfTab, type PdfState } from "./PdfTab";
import { ProcessingTab } from "@/components/processing/ProcessingTab";
import { viewProcessing } from "@/lib/processing/model";
import type { Processing } from "@/lib/processing/types";
import type { Recipient } from "@/lib/requests/recipients";

type TabId = "edit" | "preview" | "pdf" | "steps" | "process" | "json";
/** The tabs above: "עריכה" stands for both the PDF and the responsive form (switched just below it). */
type TopTab = Exclude<TabId, "edit" | "pdf"> | "build";
type HistoryEntry = { def: FormDefinition; pdf?: PdfState | null };
type SaveState = "saved" | "saving" | "dirty" | "error";

export interface FormEditorProps {
  templateId: string;
  /** The organizations the form's link opens for (a link per organization). */
  linkOrgs?: { slug: string; name: string; projects?: { slug: string; name: string }[] }[];
  initial: FormDefinition;
  initialVersion: number;
  initiallyPublished: boolean;
  initialPdf: PdfState | null;
  initialTab?: TabId;
  /** A form that was never published and has no document yet: publishing needs one. */
  needsPdf?: boolean;
  /** Saved groups, offered as an option source for dropdowns ("the requester picks the approver"). */
  groups?: { id: string; name: string }[];
  /** The organizations' own fields, offered in "מילוי אוטומטי" (filled from the request's organization). */
  orgFields?: { key: string; label: string }[];
  /** The organizations' list (name, number and their own fields): the "שדות מקושרים" dialog links form fields to it. */
  orgList?: OrgListField[];
  /** The form's steps ("שלבי הטופס"), edited in their own tab; each field belongs to one of them. */
  flow?: {
    packageId: string;
    drafts: StepDraft[];
    contacts: { id: string; label: string }[];
    /** Active organizations and their active projects: each can have a route of its own. */
    orgs?: { id: string; label: string; projects?: { id: string; label: string }[] }[];
    /** Saved routes of organizations (organization id → steps). */
    orgRoutes?: Record<string, StepDraft[]>;
    saveOrgRoute?: (packageId: string, organizationId: string, drafts: StepDraft[] | null) => Promise<SaveStepsResult>;
    groups: { id: string; label: string }[];
    save: (packageId: string, drafts: StepDraft[]) => Promise<SaveStepsResult>;
    /** "עיבוד טופס": what is stored in `packages.processing`, and the completion recipients it mirrors. */
    processing?: unknown;
    completionRecipients?: Recipient[];
    saveProcessing?: (packageId: string, view: Processing) => Promise<SaveStepsResult>;
    /** Sending settings (recipients, reminders…), rendered on the server. */
    sendSettings?: React.ReactNode;
    /** Open the sending settings (they were just saved, or failed). */
    sendSettingsOpen?: boolean;
  };
}

/** A draft as the server takes it (without the editor's own keys). */
/** The form's date fields, for a step's "the Nth of the month after…" link expiry. */
const dateFieldsOf = (def: FormDefinition) => answerFields(def).filter((f) => f.type === "date").map((f) => ({ id: f.id, label: f.label || f.id }));
const stripDraft = (e: EditorDraft): StepDraft => { const d: Partial<EditorDraft> = { ...e }; delete d.key; delete d.origRole; return d as StepDraft; };

export function FormEditor({ templateId, initial, initialVersion, initiallyPublished, initialPdf, initialTab = "edit", needsPdf = false, groups = [], orgFields = [], orgList = [], flow, linkOrgs = [] }: FormEditorProps) {
  // Form pages used to be titled "שלב N", which reads like a step of the form: they are "עמוד N".
  const [def, setDef] = useState(() => ({ ...initial, pages: initial.pages.map((p) => (/^שלב \d+$/.test(p.title?.trim() ?? "") ? { ...p, title: p.title!.trim().replace(/^שלב/, "עמוד") } : p)) }));
  // The steps being edited (kept here so switching tabs never loses them) and the ones last saved.
  const [stepWork, setStepWork] = useState<EditorDraft[]>(() => (flow?.drafts ?? []).map((d) => ({ ...d, key: crypto.randomUUID(), origRole: d.role })));
  const [stepSaved, setStepSaved] = useState(stepWork);
  const [stepState, setStepState] = useState<StepsSaveState>({ kind: "idle" });
  // "עיבוד טופס" — the completion destination is folded in from `completionRecipients`, so both screens show one value.
  const [procWork, setProcWork] = useState<Processing>(() => viewProcessing(flow?.processing, flow?.completionRecipients));
  const [procSaved, setProcSaved] = useState(procWork);
  const [procState, setProcState] = useState<StepsSaveState>({ kind: "idle" });
  /** "שלבי הטופס" shows the general route ("") or one organization's. */
  const [routeOrg, setRouteOrg] = useState("");
  const [orgRoutes, setOrgRoutes] = useState<Record<string, StepDraft[]>>(flow?.orgRoutes ?? {});
  /** Route tabs: each organization, and each of its projects right after it. */
  const routeTargets = (flow?.orgs?.length ?? 0) > 1 || flow?.orgs?.some((o) => o.projects?.length)
    ? flow!.orgs!.flatMap((o) => [{ id: o.id, label: o.label, sub: false }, ...(o.projects ?? []).map((p) => ({ id: p.id, label: `${o.label} › ${p.label}`, sub: true }))])
    : [];
  /** What a target without a route of its own follows: a project its organization's route, else the general one. */
  const fallbackOf = (id: string): { label: string; drafts: StepDraft[] } => {
    const parent = flow?.orgs?.find((o) => o.projects?.some((p) => p.id === id));
    if (parent && orgRoutes[parent.id]) return { label: `המסלול של ${parent.label}`, drafts: orgRoutes[parent.id]! };
    return { label: "המסלול הכללי", drafts: stepWork.map(stripDraft) };
  };
  const stepsDirty = JSON.stringify(stepWork.map(stripDraft)) !== JSON.stringify(stepSaved.map(stripDraft));
  const procDirty = JSON.stringify(procWork) !== JSON.stringify(procSaved);
  const ctx = { contacts: flow?.contacts, groups: flow?.groups, fields: emailFieldsOf(def) };
  const views: StepView[] | undefined = flow ? stepViews(stepWork, ctx) : undefined;
  const stepRoles = (views ?? []).map((v) => v.role);
  const unassigned = flow ? unassignedFields(def, stepRoles) : [];
  // "הצגת שלב": the fields of one step stand out, in the responsive form and on the PDF. Only shows; changes nothing.
  const [focusRole, setFocusRole] = useState<FillerRole | "">("");
  // "עריכת שלבים": fields are marked by clicking them, then a step chosen above becomes theirs.
  const [stepEdit, setStepEdit] = useState<Set<string> | null>(null);
  // "סימון בטופס": the fields a source field opens, marked by clicking them in the form or on the PDF, then saved.
  const [picking, setPicking] = useState<{ sourceId: string; ids: Set<string> } | null>(null);
  const pick: PickMode | undefined = picking
    ? {
        sourceId: picking.sourceId,
        ids: picking.ids,
        onToggle: (id) => setPicking((cur) => {
          if (!cur || id === cur.sourceId) return cur;
          const ids = new Set(cur.ids);
          if (ids.has(id)) ids.delete(id);
          else ids.add(id);
          return { ...cur, ids };
        }),
      }
    : stepEdit
      ? {
          ids: stepEdit,
          checkLabel: "מסומן להעברה לשלב",
          answersOnly: true,
          onToggle: (id) => setStepEdit((cur) => {
            if (!cur || !answerFields(def).some((f) => f.id === id)) return cur;
            const ids = new Set(cur);
            if (ids.has(id)) ids.delete(id);
            else ids.add(id);
            return ids;
          }),
        }
      : undefined;
  /** "עריכת שלבים": the marked fields get exactly the chosen step(s); the marks clear and that step is shown. */
  function moveMarkedToStep(key: string) {
    if (!stepEdit || !key) return;
    const ids = answerFields(def).map((f) => f.id).filter((id) => stepEdit.has(id));
    if (!ids.length) return;
    commit(ids.reduce((d, id) => updateField(d, id, comboPatch(key)), def));
    setIssues([]);
    const label = stepComboOptions(def, views ?? []).find((o) => o.key === key)?.label ?? key;
    setNote(`${ids.length} שדות הועברו ל${label}.`);
    setStepEdit(new Set());
  }
  const pickSource = picking ? findField(def, picking.sourceId) : undefined;
  function savePick() {
    if (!picking) return;
    const r = setDependents(def, picking.sourceId, [...picking.ids]);
    if (r.added || r.removed) commit(r.def);
    setIssues(r.errors);
    setNote(`נשמר: ${r.added} שדות נוספו${r.removed ? `, ${r.removed} הוסרו` : ""}.`);
    setSelection({ kind: "field", id: picking.sourceId });
    setPicking(null);
  }
  // One history for the form and its boxes on the PDF: undoing a delete brings back the field and its boxes together.
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const [selection, setSelection] = useState<Selection | null>({ kind: "page", index: 0 });
  const [tab, setTabState] = useState<TabId>(initialTab);
  // "עריכה" holds two views of the same fields, the PDF and the responsive form; it reopens on the one used last.
  const building = tab === "pdf" || tab === "edit";
  const [lastBuild, setLastBuild] = useState<"pdf" | "edit">(initialTab === "edit" ? "edit" : "pdf");
  const setTab = (t: TabId) => { if (t === "pdf" || t === "edit") setLastBuild(t); setTabState(t); };
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  // The "כלים" menu closes on a click anywhere outside it.
  const toolsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      const menu = toolsRef.current;
      if (menu?.open && !menu.contains(e.target as Node)) menu.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const [linkedOpen, setLinkedOpen] = useState(false);
  const [save, setSave] = useState<SaveState>("saved");
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
  /** Suggested "show only when the box is ticked" links, waiting for the admin's approval. */
  const [links, setLinks] = useState<LinkSuggestion[] | null>(null);
  const suggestLinks = () => {
    const found = suggestCheckboxLinks(def, pdf?.mapping.stamps ?? []);
    if (found.length === 0) { setNote("לא מצאנו במסמך שדות שיושבים ליד תיבת סימון ועדיין אין להם תנאי הצגה."); return; }
    setLinks(found);
  };
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

  // A step whose role is about to change takes its fields along on save: check the steps as if it already had.
  const pendingMoves = new Map(stepWork.filter((d) => d.origRole && d.origRole !== d.role).map((d) => [d.origRole!, d.role] as const));
  // Leaving the page with unsaved steps asks first.
  useEffect(() => {
    if (!stepsDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stepsDirty]);

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

  async function saveProcessing() {
    if (!flow?.saveProcessing) return;
    setProcState({ kind: "saving" });
    const r = await flow.saveProcessing(flow.packageId, procWork);
    if (!r.ok) { setProcState({ kind: "error", errors: r.errors }); return; }
    setProcSaved(procWork);
    setProcState({ kind: "saved" });
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
    setPublished(true);
    setSave("saved");
  }

  const SAVE_LABEL: Record<SaveState, string> = { saved: "נשמר", saving: "שומר…", dirty: "יש שינויים…", error: "השמירה נכשלה" };
  const exportJson = JSON.stringify(def, null, 2);

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-2">
        <Link href="/admin/forms" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">← טפסים</Link>
        {/* The name is the page's heading; the pencil next to it turns it into a field to edit (Enter or leaving ends). */}
        {editingTitle ? (
          <Input
            aria-label="שם הטופס"
            autoFocus
            value={def.title}
            onChange={(e) => commit({ ...def, title: e.target.value })}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => {
              // Enter that confirms an input-method composition is not "done".
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); setEditingTitle(false); }
            }}
            className="h-9 max-w-xs font-semibold"
          />
        ) : (
          <div className="flex min-w-0 items-center gap-1">
            <h1 className="truncate text-base font-semibold">{def.title || "ללא שם"}</h1>
            <Button variant="ghost" size="icon" className="size-11 shrink-0 sm:size-8" aria-label="עריכת שם הטופס" title="עריכת שם הטופס" onClick={() => setEditingTitle(true)}>
              <Pencil className="size-4" aria-hidden />
            </Button>
          </div>
        )}
        {!published && <Badge tone="warning">טיוטה</Badge>}
        <span role="status" className="text-xs text-muted-foreground">{SAVE_LABEL[save]}</span>
        {published && <FormLinks formId={templateId} title={initial.title} orgs={linkOrgs} />}
        <Tabs<TopTab>
          // The strip scrolls sideways on a phone instead of overflowing the header, which on a 390px screen pushed
          // the builder's layout out from under the pointer.
          className="-mb-2 max-w-full self-end overflow-x-auto overflow-y-hidden border-b-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>button]:mb-0 [&>button]:shrink-0"
          value={building ? "build" : (tab as TopTab)}
          onChange={(t) => {
            if (t === "build") { setTab(lastBuild); return; }
            setTab(t);
            if (t === "json") { setJsonText(exportJson); setJsonError(null); }
          }}
          tabs={[
            { id: "build", label: "עריכה" },
            ...(flow ? [{ id: "steps" as const, label: stepsDirty ? "שלבים •" : "שלבים" }] : []),
            ...(flow?.saveProcessing ? [{ id: "process" as const, label: procDirty ? "עיבוד •" : "עיבוד" }] : []),
            { id: "preview", label: "תצוגה מקדימה" },
            ...(tab === "json" ? [{ id: "json" as const, label: "JSON" }] : []),
          ]}
        />
        <div className="ms-auto flex flex-wrap items-center gap-1">
          <details
            ref={toolsRef}
            className="relative"
            // Choosing an item closes the menu (a click outside it closes it too, see the effect above).
            onClick={(e) => { if ((e.target as HTMLElement).closest("button, a")) toolsRef.current?.removeAttribute("open"); }}
          >
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1 rounded-md border px-3 text-sm hover:bg-accent">כלים<ChevronDown className="size-4" aria-hidden /></summary>
            <div className="absolute end-0 z-20 mt-1 flex w-60 flex-col gap-1 rounded-md border bg-card p-1 shadow-md">
              <Button variant="ghost" size="sm" className="justify-start" onClick={() => setLinkedOpen(true)} title="שדות שמתמלאים מהעמותה של הבקשה, ושדות בחירה שמציגים את האפשרויות שלה">
                <Link2 className="size-4" />שדות מקושרים
              </Button>
              <Button variant="ghost" size="sm" className="justify-start" onClick={autoIds} title="שם באנגלית לכל שדה לפי התווית, לשדות שעדיין אין להם">
                <Sparkles className="size-4" />שמות מזהים לשדות
              </Button>
              <Button variant="ghost" size="sm" className="justify-start" onClick={downloadDictionary}>
                <Download className="size-4" />רשימת השדות (Excel)
              </Button>
              {pdf && pdf.mapping.stamps.length > 0 && (
                <Button variant="ghost" size="sm" className="justify-start" onClick={() => commit(orderByPdf(def, pdf.mapping.stamps))} title="מסדר את השדות בכל עמוד לפי המקום שלהם במסמך">סידור השדות לפי ה-PDF</Button>
              )}
              {pdf && pdf.mapping.stamps.some((st) => st.kind === "check") && (
                <Button variant="ghost" size="sm" className="justify-start" onClick={suggestLinks} title="שדות שיושבים ליד תיבת סימון במסמך יוצגו רק כשמסמנים אותה">שדות לפי תיבות סימון</Button>
              )}
              <Button variant="ghost" size="sm" className="justify-start" onClick={() => setVersionsOpen(true)}>
                <History className="size-4" />גרסאות קודמות
              </Button>
              <Button variant="ghost" size="sm" className="justify-start" onClick={() => { setTab("json"); setJsonText(exportJson); setJsonError(null); }}>JSON (גיבוי והעברה)</Button>
            </div>
          </details>
          <Button variant="ghost" size="icon" aria-label="ביטול" disabled={!past.length} onClick={undo}><Undo2 className="size-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="שחזור" disabled={!future.length} onClick={redo}><Redo2 className="size-4" /></Button>
          <Button onClick={onPublish} disabled={published || save === "saving"}>{published ? "פורסם" : "פרסום"}</Button>
        </div>
      </div>

      <VersionsDialog templateId={templateId} open={versionsOpen} onClose={() => setVersionsOpen(false)} />
      <LinkedFieldsDialog
        open={linkedOpen}
        onClose={() => setLinkedOpen(false)}
        def={def}
        listFields={orgList}
        page={selection?.kind === "page" ? selection.index : selection?.kind === "field" ? (findLocation(def, selection.id)?.page ?? 0) : 0}
        onChange={(d) => commit(d)}
      />
      <CheckboxLinksDialog
        suggestions={links}
        onClose={() => setLinks(null)}
        onApply={(chosen) => {
          commit(applyCheckboxLinks(def, chosen));
          setLinks(null);
          setNote(`${chosen.length} שדות יוצגו רק כשמסמנים את התיבה שלהם. אפשר לבדוק בלשונית התצוגה המקדימה.`);
        }}
      />
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

      {picking && pickSource && (tab === "edit" || tab === "pdf") && (
        <div role="region" aria-label="סימון שדות שנפתחים" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-primary/10 px-4 py-2 text-sm">
          <span>
            סמנו את השדות שנפתחים כש<bdi className="font-semibold">{pickSource.label || pickSource.id}</bdi> {revealWord(pickSource)}: {tab === "pdf" ? "לחצו על התיבות במסמך" : "סמנו את השדות ברשימה"}.
            {" "}<strong>{picking.ids.size}</strong> מסומנים.
          </span>
          <Button size="sm" onClick={savePick}>שמירה</Button>
          <Button variant="ghost" size="sm" onClick={() => setPicking(null)}>ביטול</Button>
        </div>
      )}
      {building && (
        <div className="flex items-center gap-3 border-b bg-card px-4">
          <Tabs<"pdf" | "edit">
            aria-label="תצוגת העריכה"
            className="border-b-0 [&>button]:min-h-11"
            value={tab as "pdf" | "edit"}
            onChange={setTab}
            tabs={[{ id: "pdf", label: "PDF" }, { id: "edit", label: "רספונסיבי" }]}
          />
        </div>
      )}
      {!picking && views && (tab === "edit" || tab === "pdf") && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/40 px-4 py-2 text-sm">
          {stepEdit ? (
            <>
              <span className="font-medium">עריכת שלבים:</span>
              <span>
                {tab === "pdf" ? "לחצו על התיבות במסמך" : "סמנו שדות ברשימה"} ובחרו לאיזה שלב הם עוברים.
                {" "}<strong>{stepEdit.size}</strong> מסומנים.
              </span>
              <Select className="h-9 w-64" aria-label="העברת השדות המסומנים לשלב" value="" disabled={stepEdit.size === 0} onChange={(e) => moveMarkedToStep(e.target.value)}>
                <option value="">{stepEdit.size === 0 ? "קודם סמנו שדות" : "העברה לשלב…"}</option>
                {stepComboOptions(def, views).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </Select>
              {stepEdit.size > 0 && <Button variant="ghost" size="sm" onClick={() => setStepEdit(new Set())}>ניקוי הסימון</Button>}
              <Button size="sm" onClick={() => setStepEdit(null)}>סיום עריכה</Button>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2">
                <span className="font-medium">הצגת שלב</span>
                <Select className="h-9 w-64" aria-label="הצגת שלב" value={focusRole} onChange={(e) => setFocusRole(e.target.value as FillerRole | "")}>
                  <option value="">— כל השלבים —</option>
                  {views.map((v) => <option key={v.index} value={v.role}>{v.label}{v.index > 0 && !answerFields(def).some((f) => fillsIn(f, v.role)) ? " (רק אישור)" : ""}</option>)}
                  {unassigned.length > 0 && <option value="unassigned">שדות שלא משויכים לשלב ({unassigned.length})</option>}
                </Select>
              </label>
              <Button variant="outline" size="sm" onClick={() => { setStepEdit(new Set()); setFocusRole(""); }} title="מסמנים שדות ובוחרים לאיזה שלב הם עוברים">
                <Pencil className="size-4" />עריכת שלבים
              </Button>
            </>
          )}
          {!stepEdit && focusRole && focusRole !== "unassigned" && (
            <span className="text-muted-foreground">
              <strong className="text-foreground">{answerFields(def).filter((f) => fillsIn(f, focusRole)).length}</strong> שדות בשלב הזה, מודגשים{tab === "pdf" ? " בירוק" : ""}. כדי לשנות, לחצו על &quot;עריכת שלבים&quot;.
            </span>
          )}
          {!stepEdit && focusRole === "unassigned" && (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-destructive">השדות המודגשים לא שייכים לאף שלב.</span>
              <label className="flex items-center gap-2">
                העברת כולם ל
                <Select className="h-9 w-56" aria-label="העברת השדות שלא משויכים לשלב" value="" onChange={(e) => { const r = e.target.value as FillerRole; if (!r) return; commit(unassigned.reduce((d, f) => updateField(d, f.id, { filledBy: r }), def)); setIssues([]); setFocusRole(r); }}>
                  <option value="">בחרו שלב…</option>
                  {views.map((v) => <option key={v.index} value={v.role}>{v.label}</option>)}
                </Select>
              </label>
            </span>
          )}
          {!stepEdit && focusRole && <Button variant="ghost" size="sm" onClick={() => setFocusRole("")}>ניקוי</Button>}
          {!stepEdit && !focusRole && unassigned.length > 0 && (
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
                pick={pick}
                stepNames={views ? Object.fromEntries([...views].reverse().map((v) => [v.role, v.label])) : undefined}
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
                onSplitPage={(id) => {
                  const r = splitStepAt(def, id);
                  if (!r) return;
                  commit(r.definition);
                  setNote(`נוצר עמוד חדש (${r.definition.pages[r.step]!.title}) שמתחיל בשדה הזה.`);
                }}
                onRemovePage={(i) => { commit(removePage(def, i)); setSelection({ kind: "page", index: 0 }); }}
                onMovePage={(i, dir) => { commit(movePage(def, i, i + dir)); setSelection({ kind: "page", index: i + dir }); }}
              />
            </div>
            <aside className="order-3 rounded-lg border bg-card p-3 lg:order-none lg:overflow-auto" aria-label="הגדרות">
              {selection && (
                // A field or a page is shown; the form's own settings are one click away.
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-2 min-h-11 justify-start sm:min-h-9"
                  onClick={(e) => {
                    // The button goes away with the switch: keyboard focus moves to the first setting, not to nowhere.
                    const panel = e.currentTarget.closest("aside");
                    setSelection(null);
                    requestAnimationFrame(() => panel?.querySelector<HTMLElement>("input, textarea, select")?.focus());
                  }}
                >
                  <Settings2 className="size-4" aria-hidden />הגדרות הטופס
                </Button>
              )}
              {selectedField ? (
                <FieldSettings
                  key={selectedField.id}
                  def={def}
                  field={selectedField}
                  stamps={pdf?.mapping.stamps}
                  groups={groups}
                  orgFields={orgFields}
                  orgChoices={orgList.filter((f) => f.kind === "select")}
                  steps={views}
                  onPatch={(patch) => commit(updateField(def, selectedField.id, patch))}
                  onDefChange={(d) => commit(d)}
                  onStartPick={(sourceId) => {
                    setFocusRole("");
                    setPicking({ sourceId, ids: new Set(dependentsOf(def, sourceId).map((f) => f.id)) });
                  }}
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
              {routeTargets.length > 0 && (
                <div role="tablist" aria-label="מסלול" className="flex flex-wrap items-center gap-1.5">
                  {[{ id: "", label: "מסלול כללי", sub: false }, ...routeTargets].map((o) => {
                    const own = !!o.id && !!orgRoutes[o.id];
                    return (
                      <button
                        key={o.id || "general"}
                        type="button"
                        role="tab"
                        aria-selected={routeOrg === o.id}
                        onClick={() => setRouteOrg(o.id)}
                        className={cn(
                          "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                          o.sub && "border-dashed",
                          routeOrg === o.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                        )}
                      >
                        {o.label}
                        {o.id && <span className={cn("rounded-full px-1.5 text-[11px]", routeOrg === o.id ? "bg-primary-foreground/20" : own ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{own ? "מסלול משלה" : o.sub ? "כמו העמותה" : "כללי"}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {routeOrg && flow.saveOrgRoute ? (
                <OrgRoutes
                  org={routeTargets.find((o) => o.id === routeOrg)!}
                  orgs={routeTargets}
                  routes={orgRoutes}
                  fallback={fallbackOf(routeOrg)}
                  contacts={flow.contacts}
                  groups={flow.groups}
                  emailFields={emailFieldsOf(def)}
                  dateFields={dateFieldsOf(def)}
                  heldRoles={[...new Set([...answerFields(def).map(fieldRole), ...stepWork.map((d) => d.role)])]}
                  save={(org, drafts) => flow.saveOrgRoute!(flow.packageId, org, drafts)}
                  onRoutesChange={setOrgRoutes}
                />
              ) : (
              <StepsEditor
                drafts={stepWork}
                onChange={changeSteps}
                contacts={flow.contacts}
                groups={flow.groups}
                emailFields={emailFieldsOf(def).map((f) => ({ ...f, role: pendingMoves.get(f.role) ?? f.role }))}
                dateFields={dateFieldsOf(def)}
                orgs={flow.orgs?.map((o) => ({ id: o.id, label: o.label }))}
                dirty={stepsDirty}
                state={stepState}
                onSave={() => void saveSteps()}
                waitingForForm={save !== "saved"}
                fieldCounts={Object.fromEntries(stepWork.map((d) => [d.role, answerFields(def).filter((f) => fillsIn(f, d.role)).length]))}
              />
              )}
            </section>
            {flow.sendSettings && (
              <details className="rounded-lg border bg-card p-4" open={flow.sendSettingsOpen}>
                <summary className="cursor-pointer font-semibold">הגדרות שליחה: מקבלי המסמכים, תזכורות ותוקף הקישורים</summary>
                <div className="mt-4">{flow.sendSettings}</div>
              </details>
            )}
          </div>
        )}
        {tab === "process" && flow?.saveProcessing && (
          <ProcessingTab
            value={procWork}
            onChange={setProcWork}
            ctx={{
              parts: procWork.parts,
              attachments: answerFields(def).filter((f) => f.type === "file_upload").map((f) => ({ id: f.id, label: f.label || f.id })),
              steps: views ?? [],
              emailFields: emailFieldsOf(def).map((f) => ({ id: f.id, label: f.label || f.id })),
              users: flow.contacts,
            }}
            dirty={procDirty}
            state={procState}
            onSave={() => void saveProcessing()}
            waitingForForm={save !== "saved"}
            onEditSteps={() => setTab("steps")}
            pageCount={typeof pdf?.file.pages === "number" ? pdf.file.pages : (pdf?.file.pages?.length ?? 0)}
          />
        )}
        {tab === "pdf" && <div className="p-4"><PdfTab templateId={templateId} orgFields={orgFields} steps={views} focusRole={focusRole} pick={pick} definition={def} pdf={pdf} onChange={changePdf} onDefinitionChange={(d) => commit(d)} onDefinitionAndPdf={(d, p) => commit(d, p)} /></div>}

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

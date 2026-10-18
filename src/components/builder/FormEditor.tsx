"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Redo2, Undo2, Sparkles } from "lucide-react";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { publishAction, saveDraftAction } from "@/app/admin/forms/actions";
import {
  addField, addPage, duplicateField, findLocation, moveField, movePage, publishIssues, removeField, removePage,
  renameFieldId, updateField, updatePage,
} from "@/lib/forms/builder";
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

type TabId = "edit" | "preview" | "pdf" | "json";
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
}

export function FormEditor({ templateId, initial, initialVersion, initiallyPublished, initialPdf, initialTab = "edit", needsPdf = false, groups = [] }: FormEditorProps) {
  const [def, setDef] = useState(initial);
  const [past, setPast] = useState<FormDefinition[]>([]);
  const [future, setFuture] = useState<FormDefinition[]>([]);
  const [selection, setSelection] = useState<Selection | null>({ kind: "page", index: 0 });
  const [tab, setTab] = useState<TabId>(initialTab);
  const [save, setSave] = useState<SaveState>("saved");
  const [version, setVersion] = useState(initialVersion);
  const [published, setPublished] = useState(initiallyPublished);
  const [pdf, setPdf] = useState<PdfState | null>(initialPdf);
  const [issues, setIssues] = useState<string[]>([]);
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const first = useRef(true);
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
    commit(next);
    if (pdf) setPdf({ ...pdf, mapping: { ...pdf.mapping, stamps } });
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

  /** All edits go through here so undo/redo and autosave see them. */
  const commit = useCallback((next: FormDefinition) => {
    setPast((p) => [...p.slice(-49), def]);
    setFuture([]);
    setDef(next);
  }, [def]);

  const undo = () => setPast((p) => {
    if (!p.length) return p;
    setFuture((f) => [def, ...f]);
    setDef(p.at(-1)!);
    return p.slice(0, -1);
  });
  const redo = () => setFuture((f) => {
    if (!f.length) return f;
    setPast((p) => [...p, def]);
    setDef(f[0]!);
    return f.slice(1);
  });

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

  async function onPublish() {
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
          <Button variant="outline" size="sm" onClick={autoIds} title="שם באנגלית לכל שדה לפי התווית והשלב, לשדות שעדיין אין להם">
            <Sparkles className="size-4" />שמות מזהים
          </Button>
          <Button variant="outline" size="sm" onClick={downloadDictionary} title="קובץ Excel עם כל השדות: מזהה, שם, סוג, שלב וממלא">
            <Download className="size-4" />רשימת השדות (Excel)
          </Button>
          {pdf && pdf.mapping.stamps.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => commit(orderByPdf(def, pdf.mapping.stamps))} title="מסדר את השדות בכל שלב לפי המקום שלהם במסמך">סידור לפי ה-PDF</Button>
          )}
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

      <div className="px-4 pt-2">
        <Tabs<TabId>
          value={tab}
          onChange={(t) => { setTab(t); if (t === "json") { setJsonText(exportJson); setJsonError(null); } }}
          tabs={[{ id: "pdf", label: "מסמך PDF" }, { id: "edit", label: "עריכה (רספונסיבי)" }, { id: "preview", label: "תצוגה מקדימה" }, { id: "json", label: "JSON" }]}
        />
      </div>

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
                  onPatch={(patch) => commit(updateField(def, selectedField.id, patch))}
                  onMoveToPage={(pi) => commit(moveField(def, selectedField.id, { page: pi, index: def.pages[pi]!.fields.length }))}
                  onRename={(to) => {
                    const r = renameFieldId(def, selectedField.id, to);
                    if (r.error) return r.error;
                    commit(r.def);
                    // The places on the document follow the new id.
                    if (pdf) setPdf({ ...pdf, mapping: { ...pdf.mapping, stamps: renameStamps(pdf.mapping.stamps, selectedField.id, to) } });
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

        {tab === "pdf" && <div className="p-4"><PdfTab templateId={templateId} definition={def} pdf={pdf} onChange={setPdf} onDefinitionChange={commit} /></div>}

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

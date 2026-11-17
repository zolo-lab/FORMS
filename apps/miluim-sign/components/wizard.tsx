"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, FileUp, ImagePlus, RotateCcw, RotateCw } from "lucide-react";
import { AdjustStage } from "@/components/adjust-stage";
import { FieldStage, type StageMode } from "@/components/field-stage";
import { Banner, Button, TextField, controlClass } from "@/components/ui";
import { fileToRaster, pdfToPages, rasterToBlob, urlToRaster } from "@/lib/browser-image";
import { isValidIsraeliId } from "@/lib/id";
import { parseRecipients } from "@/lib/recipients";
import { signMessage, toWaDigits, waLink } from "@/lib/phone";
import { KIND_LABEL, makeField, todayIL, type EditorField, type Field, type FieldKind, type TemplateRow } from "@/lib/types";
import { detectFields, enhance, fullQuad, prepareScan, profileShift, resize, rotate90, rotateDeg, shiftFields, suggestQuad, type Quad, type Raster } from "@/lib/vision";

type Step = "source" | "camera" | "adjust" | "fields" | "send" | "links";
interface LocalPage { url: string; width: number; height: number; raster: Raster }
interface LinkRow { id: string; token: string; name: string; phone: string }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function uploadBlob(blob: Blob): Promise<string> {
  const form = new FormData();
  form.set("file", new File([blob], "page.jpg", { type: "image/jpeg" }));
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "ההעלאה נכשלה");
  return body.url as string;
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const minA = Math.min(a.w * a.h, b.w * b.h);
  return minA > 0 && inter / minA > 0.4;
}

export function Wizard() {
  const router = useRouter();
  const params = useSearchParams();
  const templateId = params.get("template");
  const [step, setStep] = useState<Step>("source");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [base, setBase] = useState<Raster | null>(null);
  const [quarter, setQuarter] = useState(0);
  const [fine, setFine] = useState(0);
  const [shown, setShown] = useState<Raster | null>(null);
  const [shownUrl, setShownUrl] = useState<string | null>(null);
  const [corners, setCorners] = useState<Quad | null>(null);
  const [pages, setPages] = useState<LocalPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [fields, setFields] = useState<EditorField[]>([]);
  const [mode, setMode] = useState<StageMode>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [aligned, setAligned] = useState(false);
  const [origin, setOrigin] = useState<"photo" | "pdf" | "template">("photo");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [oneSignature, setOneSignature] = useState(true);
  const [templateName, setTemplateName] = useState("");
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [cameraOn, setCameraOn] = useState(false);

  useEffect(() => {
    if (!templateId) return;
    let cancel = false;
    (async () => {
      const res = await fetch(`/api/templates/${templateId}`);
      const body = await res.json().catch(() => ({}));
      if (!cancel && res.ok) {
        setTemplate(body.template);
        setTemplateName(body.template.name);
      }
    })();
    return () => { cancel = true; };
  }, [templateId]);

  useEffect(() => {
    if (!base) return;
    let cancel = false;
    (async () => {
      setBusy("מזהים את דף הטופס…");
      await wait(20);
      const turned = rotateDeg(rotate90(base, quarter), fine);
      if (cancel) return;
      const url = URL.createObjectURL(await rasterToBlob(turned, "image/jpeg", 0.72));
      setShown(turned);
      setShownUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      setCorners(suggestQuad(turned));
      setBusy(null);
    })();
    return () => { cancel = true; };
  }, [base, quarter, fine]);

  const previewUrl = shownUrl;
  const selectedField = fields.find((field) => field.id === selected) ?? null;
  const parsed = useMemo(() => bulk ? parseRecipients(bulkText) : [], [bulk, bulkText]);

  const useTemplateImage = async () => {
    if (!template?.pages[0]) return;
    setBusy("טוענים את התבנית…");
    setError(null);
    try {
      const local: LocalPage[] = [];
      for (const page of template.pages) {
        const raster = await urlToRaster(`/api/file?url=${encodeURIComponent(page.path)}`);
        const blob = await rasterToBlob(raster);
        local.push({ url: URL.createObjectURL(blob), width: raster.width, height: raster.height, raster });
      }
      setPages(local);
      setFields(template.fields.map((field) => ({ ...field, source: "template", proposed: false })));
      setOrigin("template");
      setStep("fields");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "לא ניתן לטעון את התבנית");
    } finally {
      setBusy(null);
    }
  };

  const onPhoto = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setBusy("קוראים את הצילום…");
    try {
      setBase(await fileToRaster(file));
      setQuarter(0);
      setFine(0);
      setOrigin(template ? "photo" : "photo");
      setStep("adjust");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "לא ניתן לקרוא את הקובץ");
    } finally {
      setBusy(null);
    }
  };

  const onPdf = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setBusy("קוראים את ה-PDF…");
    try {
      const loaded = await pdfToPages(file);
      const local: LocalPage[] = [];
      const next: EditorField[] = [];
      for (let i = 0; i < loaded.length; i++) {
        const prepared = enhance(loaded[i]!.raster);
        const blob = await rasterToBlob(prepared);
        local.push({ url: URL.createObjectURL(blob), width: prepared.width, height: prepared.height, raster: prepared });
        const found = [...detectFields(prepared)];
        for (const extra of loaded[i]!.fields) {
          if (found.some((field) => overlaps(field, extra))) continue;
          found.push(extra);
        }
        for (const field of found) next.push(makeField(field.kind, i, field.x, field.y, field.w, field.h, "auto", true));
      }
      setPages(local);
      setFields(next);
      setOrigin("pdf");
      setStep("fields");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "לא ניתן לקרוא את ה-PDF");
    } finally {
      setBusy(null);
    }
  };

  const straighten = async () => {
    if (!shown || !corners) return;
    if (template && template.pages.length > 1) {
      setError("תבנית של כמה עמודים נשלחת מהתמונה השמורה. צילום חדש מתאים לתבנית של עמוד אחד.");
      return;
    }
    setBusy("מיישרים את הצילום ומזהים חתימות…");
    setError(null);
    await wait(30);
    try {
      const aspect = template?.pages[0] ? template.pages[0].width / template.pages[0].height : undefined;
      const prepared = prepareScan(shown, corners, template ? aspect : undefined);
      let next = template
        ? template.fields.filter((field) => field.page === 0).map((field) => ({ ...field, id: crypto.randomUUID(), source: "template" as const, proposed: false }))
        : detectFields(prepared).map((field) => makeField(field.kind, 0, field.x, field.y, field.w, field.h, "auto", true));
      let didAlign = false;
      if (template?.pages[0]) {
        const reference = await urlToRaster(`/api/file?url=${encodeURIComponent(template.pages[0].path)}`);
        const shift = profileShift(reference, prepared);
        didAlign = Math.abs(shift.dx) + Math.abs(shift.dy) > 0.004;
        next = shiftFields(next, shift.dx, shift.dy);
      }
      const blob = await rasterToBlob(prepared);
      setPages([{ url: URL.createObjectURL(blob), width: prepared.width, height: prepared.height, raster: prepared }]);
      setFields(next);
      setAligned(didAlign);
      setPageIndex(0);
      setStep("fields");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "היישור נכשל");
    } finally {
      setBusy(null);
    }
  };

  const acceptProposed = () => setFields((current) => current.map((field) => ({ ...field, proposed: false })));
  const clearAuto = () => setFields((current) => current.filter((field) => field.source !== "auto"));

  const saveTemplate = async (uploaded: { path: string; width: number; height: number }[], clean: Field[]) => {
    const nameToSave = templateName.trim();
    if (!nameToSave) throw new Error("תנו שם לתבנית");
    const thumb = await rasterToBlob(resize(pages[0]!.raster, 360), "image/jpeg", 0.7);
    const thumbPath = await uploadBlob(thumb);
    if (template && origin === "template") {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nameToSave, fields: clean }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "שמירת התבנית נכשלה");
      return template.id as string;
    }
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nameToSave, pages: uploaded, fields: clean, thumbPath }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "שמירת התבנית נכשלה");
    return body.id as string;
  };

  const send = async (alsoTemplate: boolean) => {
    if (!fields.some((field) => field.kind === "signature")) {
      setError("צריך לפחות שדה חתימה אחד");
      return;
    }
    const recipients = bulk
      ? parsed.filter((row) => !row.error).map(({ name: person, phone: mobile, idNumber: id }) => ({ name: person, phone: mobile, idNumber: id }))
      : [{ name: name.trim(), phone: phone.trim(), idNumber: idNumber.trim() }];
    if (!recipients.length || recipients.some((row) => !toWaDigits(row.phone))) {
      setError("צריך טלפון ישראלי תקין");
      return;
    }
    if (recipients.some((row) => row.idNumber && !isValidIsraeliId(row.idNumber))) {
      setError("ת\"ז לא תקינה");
      return;
    }
    setBusy("שולחים…");
    setError(null);
    try {
      const clean: Field[] = fields.map(({ source: _source, proposed: _proposed, ...field }) => ({ ...field, proposed: undefined, label: KIND_LABEL[field.kind] })) as Field[];
      const uploaded = [];
      for (const page of pages) uploaded.push({ path: await uploadBlob(await rasterToBlob(page.raster)), width: page.width, height: page.height });
      let savedTemplate: string | null = template?.id ?? null;
      if (alsoTemplate || templateName.trim()) savedTemplate = await saveTemplate(uploaded, clean);
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: templateName.trim() || template?.name || "כתב הסכמה",
          pages: uploaded,
          fields: clean,
          recipients,
          oneSignature,
          templateId: savedTemplate,
          date: todayIL(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "השליחה נכשלה");
      setLinks(body.documents);
      setStep("links");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "השליחה נכשלה");
    } finally {
      setBusy(null);
    }
  };

  const shareRow = async (row: LinkRow) => {
    const link = `${window.location.origin}/s/${row.token}`;
    const text = signMessage(row.name, link);
    const image = pages[0] ? new File([await (await fetch(pages[0].url)).blob()], "form.jpg", { type: "image/jpeg" }) : null;
    if (image && navigator.canShare?.({ files: [image] })) {
      await navigator.share({ files: [image], text, title: "כתב הסכמה" });
      return;
    }
    if (navigator.share) {
      await navigator.share({ text, url: link, title: "כתב הסכמה" });
      return;
    }
    const href = waLink(row.phone, text);
    if (href) window.open(href, "_blank", "noopener");
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{template ? `שליחה מתבנית: ${template.name}` : "טופס חדש"}</h1>
      {busy ? <Banner>{busy}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      {step === "source" && (
        <div className="space-y-3">
          {template ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Button onClick={() => setStep("camera")}>צילום חדש של אותו טופס</Button>
              <Button variant="quiet" onClick={() => document.getElementById("gallery")?.click()}>בחירה מהגלריה</Button>
              <Button variant="quiet" onClick={useTemplateImage}>שליחה על תמונת התבנית</Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Button onClick={() => setStep("camera")}><Camera aria-hidden="true" className="size-5" /> צילום</Button>
              <Button variant="quiet" onClick={() => document.getElementById("gallery")?.click()}><ImagePlus aria-hidden="true" className="size-5" /> גלריה</Button>
              <Button variant="quiet" onClick={() => document.getElementById("pdf")?.click()}><FileUp aria-hidden="true" className="size-5" /> PDF</Button>
            </div>
          )}
          <input id="gallery" className="sr-only" type="file" accept="image/*" onChange={(event) => onPhoto(event.target.files?.[0] ?? null)} />
          <input id="pdf" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => onPdf(event.target.files?.[0] ?? null)} />
          {!template ? <p className="text-sm text-muted-foreground">אפשר גם <a className="font-medium text-primary underline" href="/templates">להתחיל מתבנית שמורה</a>.</p> : null}
        </div>
      )}

      {step === "camera" && <CameraCapture onShot={(raster) => { setBase(raster); setQuarter(0); setFine(0); setStep("adjust"); }} onClose={() => setStep("source")} live={cameraOn} setLive={setCameraOn} />}

      {step === "adjust" && previewUrl && shown && corners && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">גררו את הפינות אל שולי הדף. אחר כך ניישר את הצילום ונגביר את הניגודיות.</p>
          <AdjustStage src={previewUrl} width={shown.width} height={shown.height} corners={corners} onChange={setCorners} />
          <div className="flex flex-wrap gap-2">
            <Button variant="quiet" onClick={() => setQuarter((value) => (value + 3) % 4)} aria-label="סיבוב שמאלה"><RotateCcw aria-hidden="true" className="size-5" /> שמאלה</Button>
            <Button variant="quiet" onClick={() => setQuarter((value) => (value + 1) % 4)} aria-label="סיבוב ימינה"><RotateCw aria-hidden="true" className="size-5" /> ימינה</Button>
            <Button variant="quiet" onClick={() => setFine((value) => value - 1)}>הטיה −</Button>
            <Button variant="quiet" onClick={() => setFine((value) => value + 1)}>הטיה +</Button>
            <Button variant="ghost" onClick={() => shown && setCorners(fullQuad(shown))}>כל התמונה</Button>
            <Button variant="ghost" onClick={() => shown && setCorners(suggestQuad(shown))}>זיהוי דף</Button>
          </div>
          <Button variant="accent" onClick={straighten} disabled={!!busy}>המשך לסימון</Button>
        </div>
      )}

      {step === "fields" && pages[pageIndex] && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-3">
            {pages.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto">
                {pages.map((page, index) => (
                  <Button key={page.url} variant={index === pageIndex ? "primary" : "quiet"} onClick={() => setPageIndex(index)}>עמוד {index + 1}</Button>
                ))}
              </div>
            ) : null}
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {fields.filter((field) => field.source === "auto").length
                ? `זוהו ${fields.filter((field) => field.kind === "signature" && field.source === "auto").length} מקומות לחתימה. גררו, שנו גודל, או מחקו.`
                : "סמנו על הטופס, או הוסיפו שדה בלחיצה."}
              {aligned ? " בוצעה התאמה קלה לתבנית." : ""}
            </p>
            <FieldStage src={pages[pageIndex]!.url} page={pageIndex} fields={fields} mode={mode} selectedId={selected} onSelect={setSelected} onChange={setFields} />
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button variant={mode === "select" ? "primary" : "quiet"} aria-pressed={mode === "select"} onClick={() => setMode("select")}>הזזה</Button>
              <Button variant={mode === "marker" ? "primary" : "quiet"} aria-pressed={mode === "marker"} onClick={() => setMode("marker")}>סימון</Button>
              {(["signature", "name", "id", "date"] as FieldKind[]).map((kind) => (
                <Button key={kind} variant={mode === kind ? "primary" : "quiet"} aria-pressed={mode === kind} onClick={() => setMode(kind)}>הוספת {KIND_LABEL[kind]}</Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="quiet" onClick={() => {
                const page = pages[pageIndex]!;
                const found = detectFields(page.raster).map((field) => makeField(field.kind, pageIndex, field.x, field.y, field.w, field.h, "auto", true));
                setFields((current) => [...current.filter((field) => !(field.page === pageIndex && field.source === "auto")), ...found.filter((field) => !current.some((have) => have.page === pageIndex && overlaps(have, field)))]);
              }}>זיהוי מחדש</Button>
              <Button variant="quiet" onClick={acceptProposed}>אישור ההצעות</Button>
              <Button variant="ghost" onClick={clearAuto}>מחיקת הזיהוי</Button>
            </div>
            {selectedField ? (
              <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                <TextField label="סוג השדה">
                  <select className={controlClass} value={selectedField.kind} onChange={(event) => {
                    const kind = event.target.value as FieldKind;
                    setFields((current) => current.map((field) => field.id === selectedField.id ? { ...field, kind, label: KIND_LABEL[kind] } : field));
                  }}>
                    {(["signature", "name", "id", "date"] as FieldKind[]).map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
                  </select>
                </TextField>
                <Button variant="danger" onClick={() => { setFields((current) => current.filter((field) => field.id !== selectedField.id)); setSelected(null); }}>מחיקת השדה</Button>
              </div>
            ) : null}
            <ul className="max-h-64 space-y-2 overflow-auto">
              {fields.filter((field) => field.page === pageIndex).map((field, index) => (
                <li key={field.id} className="flex items-center gap-2">
                  <button type="button" className="min-h-11 flex-1 cursor-pointer rounded-lg bg-secondary px-3 text-start" onClick={() => { setSelected(field.id); setMode("select"); }}>
                    {index + 1}. {KIND_LABEL[field.kind]}{field.proposed ? " · הצעה" : ""}
                  </button>
                  <Button variant="ghost" onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))}>הסרה</Button>
                </li>
              ))}
            </ul>
            <TextField label="שם תבנית" hint="לא חובה. עם שם, השדות נשמרים לשימוש חוזר.">
              <input className={controlClass} value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="למשל כתב הסכמה 2400" />
            </TextField>
            <Button variant="accent" onClick={() => { acceptProposed(); setStep("send"); }}>המשך לשליחה</Button>
          </div>
        </div>
      )}

      {step === "send" && (
        <div className="mx-auto max-w-lg space-y-4">
          <div className="flex gap-2">
            <Button variant={!bulk ? "primary" : "quiet"} aria-pressed={!bulk} onClick={() => setBulk(false)}>חייל אחד</Button>
            <Button variant={bulk ? "primary" : "quiet"} aria-pressed={bulk} onClick={() => setBulk(true)}>רשימה</Button>
          </div>
          {bulk ? (
            <TextField label="רשימת חיילים" hint="שורה לכל חייל: שם, טלפון, ואפשר גם ת&quot;ז">
              <textarea className={`${controlClass} min-h-40 py-2`} value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={"ישראל ישראלי, 0501234567\nדנה כהן, 0527654321"} />
            </TextField>
          ) : (
            <div className="space-y-3">
              <TextField label="שם"><input className={controlClass} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></TextField>
              <TextField label="טלפון" hint={toWaDigits(phone) ? `יישלח אל ${toWaDigits(phone)}` : "05X הופך ל־9725X"}>
                <input className={controlClass} dir="ltr" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="050-0000000" />
              </TextField>
              <TextField label="ת&quot;ז (רשות)" hint="9 ספרות, כולל ספרת ביקורת">
                <input className={controlClass} dir="ltr" inputMode="numeric" value={idNumber} onChange={(event) => setIdNumber(event.target.value)} />
              </TextField>
            </div>
          )}
          {bulk && parsed.length ? (
            <ul className="space-y-1 text-sm">
              {parsed.map((row, index) => (
                <li key={index} className={row.error ? "text-destructive" : ""}>{row.name || "ללא שם"} · <span dir="ltr">{row.phone}</span>{row.error ? ` · ${row.error}` : ""}</li>
              ))}
            </ul>
          ) : null}
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-5" checked={oneSignature} onChange={(event) => setOneSignature(event.target.checked)} />
            חתימה אחת לכל מקומות החתימה
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" onClick={() => send(false)} disabled={!!busy}>יצירת קישורים</Button>
            <Button variant="quiet" onClick={() => send(true)} disabled={!!busy || !templateName.trim()}>שמירה כתבנית ושליחה</Button>
            <Button variant="ghost" onClick={() => setStep("fields")}>חזרה לשדות</Button>
          </div>
        </div>
      )}

      {step === "links" && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">הקישורים מוכנים</h2>
          <ul className="space-y-3">
            {links.map((row) => {
              const link = typeof window === "undefined" ? "" : `${window.location.origin}/s/${row.token}`;
              const href = waLink(row.phone, signMessage(row.name, link));
              return (
                <li key={row.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
                  <p className="font-medium">{row.name || row.phone}</p>
                  <p dir="ltr" className="text-sm text-muted-foreground">{toWaDigits(row.phone)}</p>
                  <div className="flex flex-wrap gap-2">
                    {href ? <a className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-medium text-accent-foreground" href={href} target="_blank" rel="noreferrer">וואטסאפ</a> : null}
                    <Button variant="quiet" onClick={() => shareRow(row)}>שיתוף איש קשר</Button>
                    <Button variant="ghost" onClick={() => navigator.clipboard.writeText(link)}>העתקת קישור</Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Button onClick={() => router.push("/")}>אל רשימת הטפסים</Button>
        </div>
      )}
    </div>
  );
}

function CameraCapture({ onShot, onClose }: { onShot: (raster: Raster) => void; onClose: () => void; live: boolean; setLive: (value: boolean) => void }) {
  const [node, setNode] = useState<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!node) return;
    let stream: MediaStream | null = null;
    let cancel = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancel) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        node.srcObject = stream;
        await node.play();
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancel = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [node]);
  return (
    <div className="space-y-3">
      {failed ? <Banner tone="error">אין גישה למצלמה. אפשר לבחור צילום מהגלריה.</Banner> : (
        <video ref={setNode} playsInline muted autoPlay className="aspect-[3/4] w-full rounded-lg bg-black object-cover" />
      )}
      <div className="flex gap-2">
        <Button variant="accent" onClick={() => {
          if (!node?.videoWidth) return;
          const canvas = document.createElement("canvas");
          canvas.width = node.videoWidth;
          canvas.height = node.videoHeight;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(node, 0, 0);
          const image = ctx?.getImageData(0, 0, canvas.width, canvas.height);
          if (!image) return;
          const scale = Math.min(1, 1800 / Math.max(canvas.width, canvas.height));
          const raster = scale === 1
            ? { width: canvas.width, height: canvas.height, data: image.data }
            : resize({ width: canvas.width, height: canvas.height, data: image.data }, Math.round(canvas.width * scale));
          onShot(raster);
        }}>צילום</Button>
        <Button variant="quiet" onClick={onClose}>ביטול</Button>
      </div>
    </div>
  );
}

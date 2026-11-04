"use client";

import { useState } from "react";
import { ExternalLink, FileText, Paperclip } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ViewerDoc {
  id: string;
  title: string;
  hasPdf: boolean;
  final: boolean;
  pages: { title: string; fields: { label: string; text: string | null; role: string }[] }[];
}

export interface ViewerFile {
  name: string;
  url: string;
}

type Tab = "form" | "pdf" | "files";

const IMAGE = /\.(png|jpe?g|webp|gif|heic)$/i;

/**
 * The request's documents as they stand: the responsive form (what was filled and what still waits, and for which
 * step), the PDF with the answers drawn on it, and the files that came with it (ID card…).
 */
export function DocumentViewer({ requestId, docs, files, stepOf }: { requestId: string; docs: ViewerDoc[]; files: ViewerFile[]; stepOf: Record<string, string> }) {
  const [docId, setDocId] = useState(docs[0]?.id ?? "");
  const doc = docs.find((d) => d.id === docId) ?? docs[0];
  const [tab, setTab] = useState<Tab>("form");
  const filled = doc ? doc.pages.reduce((n, p) => n + p.fields.filter((f) => f.text !== null).length, 0) : 0;
  const total = doc ? doc.pages.reduce((n, p) => n + p.fields.length, 0) : 0;
  const pdfUrl = doc ? `/api/admin/requests/${requestId}/documents/${doc.id}${doc.final ? "" : "?current=1"}` : "";

  return (
    <section className="space-y-3" aria-labelledby="doc-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="doc-title" className="font-semibold">המסמך</h2>
        {docs.length > 1 && (
          <Select className="h-9 w-64" aria-label="בחירת מסמך" value={doc?.id} onChange={(e) => setDocId(e.target.value)}>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </Select>
        )}
        {doc && total > 0 && <span className="text-sm text-muted-foreground">מולאו {filled} מתוך {total} שדות</span>}
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "form", label: "רספונסיבי" },
          ...(doc?.hasPdf ? [{ id: "pdf" as const, label: "PDF" }] : []),
          { id: "files", label: files.length ? `מסמכים נלווים (${files.length})` : "מסמכים נלווים" },
        ]}
      />

      {tab === "form" && doc && (
        <div className="space-y-3">
          {doc.pages.length === 0 && <p className="text-sm text-muted-foreground">אין בטופס שדות למילוי.</p>}
          {doc.pages.map((p, i) => (
            <Card key={i} className="overflow-hidden">
              {doc.pages.length > 1 && <h3 className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold">{p.title}</h3>}
              <dl className="divide-y text-sm">
                {p.fields.map((f, j) => (
                  <div key={j} className="grid gap-x-4 gap-y-0.5 px-3 py-2 sm:grid-cols-[minmax(8rem,14rem)_1fr]">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className={cn("whitespace-pre-line break-words", f.text === null && "text-muted-foreground")}>
                      {f.text ?? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-dashed px-2 py-0.5 text-xs">טרם מולא</span>
                          {stepOf[f.role] && <span className="text-xs">{stepOf[f.role]}</span>}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      )}

      {tab === "pdf" && doc?.hasPdf && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">{doc.final ? "המסמך החתום הסופי." : "המסמך כפי שהוא עכשיו, עם כל מה שמולא עד כה."}</span>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              <ExternalLink className="size-4" aria-hidden /> פתיחה בחלון חדש
            </a>
          </div>
          <iframe key={pdfUrl} src={pdfUrl} title={`${doc.title} – PDF`} className="h-[80vh] w-full rounded-lg border bg-muted" />
        </div>
      )}

      {tab === "files" && (
        files.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">עוד לא הועלו מסמכים נלווים (תעודת זהות, אישורים…).</Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((f, i) => (
              <li key={i}>
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-lg border bg-card hover:border-primary">
                  {IMAGE.test(f.name) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.url} alt={f.name} className="h-40 w-full bg-muted object-contain" loading="lazy" />
                  ) : (
                    <span className="flex h-40 items-center justify-center bg-muted">
                      {/\.pdf$/i.test(f.name) ? <FileText className="size-10 text-muted-foreground" aria-hidden /> : <Paperclip className="size-10 text-muted-foreground" aria-hidden />}
                    </span>
                  )}
                  <span className="block truncate px-3 py-2 text-sm group-hover:text-primary">{f.name}</span>
                </a>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}

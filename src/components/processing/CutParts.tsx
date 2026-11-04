"use client";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatPages, overlappingParts, parsePages, uncoveredPages } from "@/lib/processing/pages";
import type { CutPart } from "@/lib/processing/types";

const newId = () => `p${Math.random().toString(36).slice(2, 10)}`;

/** Click the pages of one part on a strip of page numbers — faster and safer than typing a range by hand. */
function PageStrip({ spec, pageCount, onChange, label }: { spec: string; pageCount: number; onChange: (next: string) => void; label: string }) {
  const chosen = new Set(parsePages(spec, pageCount).pages);
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => {
          const on = chosen.has(p);
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              aria-label={`עמוד ${p}`}
              onClick={() => {
                const next = new Set(chosen);
                if (on) next.delete(p);
                else next.add(p);
                onChange(formatPages([...next]));
              }}
              className={cn(
                "size-10 rounded-md border text-sm transition-colors",
                on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
              )}
            >
              {p}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * "חיתוך המסמך": the parts a signed document is cut into when the request finishes. Each part becomes a PDF of
 * its own that destinations can be pointed at. Pages are 1-based and may be clicked or typed.
 */
export function CutParts({
  parts, onChange, pageCount, documents, types,
}: {
  parts: CutPart[];
  onChange: (next: CutPart[]) => void;
  /** Pages of the form's document; 0 when the form has no PDF (then only typing a range is offered). */
  pageCount: number;
  /** Documents of the package, when it holds more than one. */
  documents?: { id: string; title: string }[];
  types?: { id: string; name: string }[];
}) {
  const patch = (i: number, p: Partial<CutPart>) => onChange(parts.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const overlaps = overlappingParts(parts.map((p) => p.pages), pageCount || undefined);
  const uncovered = pageCount ? uncoveredPages(parts.map((p) => p.pages), pageCount) : [];

  return (
    <section className="space-y-3" aria-labelledby="cut-h">
      <div>
        <h3 id="cut-h" className="text-base font-semibold">חיתוך המסמך</h3>
        <p className="text-sm text-muted-foreground">
          כל חלק הופך לקובץ PDF נפרד בסיום התהליך, ואפשר לשלוח אותו ליעד משלו. המסמך המלא נשמר תמיד, עם עמוד האסמכתא.
        </p>
      </div>

      {parts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">אין חיתוך: המסמך נשלח בשלמותו.</p>
      ) : (
        <ul className="space-y-3">
          {parts.map((part, i) => {
            const id = `part-${part.id}`;
            const check = parsePages(part.pages, pageCount || undefined);
            return (
              <li key={part.id} className={cn("space-y-3 rounded-lg border bg-card p-4", check.errors.length > 0 && "border-destructive/60")}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-name`}>שם החלק</Label>
                    <Input id={`${id}-name`} value={part.name} placeholder="101" onChange={(e) => patch(i, { name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-pages`}>עמודים</Label>
                    <Input id={`${id}-pages`} dir="ltr" value={part.pages} placeholder="1-2,5" onChange={(e) => patch(i, { pages: e.target.value })} />
                  </div>
                  {documents && documents.length > 1 && (
                    <div className="space-y-1">
                      <Label htmlFor={`${id}-doc`}>מאיזה מסמך</Label>
                      <Select id={`${id}-doc`} value={part.documentId ?? ""} onChange={(e) => patch(i, { documentId: e.target.value || undefined })}>
                        <option value="">בחרו…</option>
                        {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                      </Select>
                    </div>
                  )}
                  {types && types.length > 0 && (
                    <div className="space-y-1">
                      <Label htmlFor={`${id}-type`}>סוג מסמך (לא חובה)</Label>
                      <Select id={`${id}-type`} value={part.typeId ?? ""} onChange={(e) => patch(i, { typeId: e.target.value || undefined })}>
                        <option value="">ללא</option>
                        {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </Select>
                    </div>
                  )}
                </div>

                {pageCount > 0 && (
                  <PageStrip spec={part.pages} pageCount={pageCount} label="לחיצה על מספר עמוד מוסיפה או מורידה אותו" onChange={(pages) => patch(i, { pages })} />
                )}

                {check.errors.length > 0 && (
                  <ul role="alert" className="space-y-0.5 text-sm text-destructive">
                    {check.errors.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                )}
                {check.warnings.map((w) => <p key={w} className="text-xs text-muted-foreground">{w}</p>)}
                {documents && documents.length > 1 && !part.documentId && (
                  <p role="alert" className="text-sm text-destructive">יש לבחור מאיזה מסמך נחתך החלק</p>
                )}

                <div className="border-t pt-2">
                  <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => onChange(parts.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" aria-hidden />מחיקת החלק
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {overlaps.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {overlaps.map(([a, b]) => `"${parts[a]?.name || a + 1}" ו"${parts[b]?.name || b + 1}"`).join(", ")} חולקים עמודים. זה מותר – אותו עמוד פשוט יופיע בשני הקבצים.
        </p>
      )}
      {uncovered.length > 0 && parts.length > 0 && (
        <p className="text-xs text-muted-foreground">
          עמודים שלא נכללו באף חלק: {formatPages(uncovered)}. הם נשארים במסמך המלא.
        </p>
      )}

      <Button type="button" variant="outline" onClick={() => onChange([...parts, { id: newId(), name: "", pages: "" }])}>
        <Plus className="size-4" aria-hidden />הוספת חלק
      </Button>
    </section>
  );
}

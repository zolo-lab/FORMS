"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio } from "@/components/ui/checkbox";
import { columnsProblem, MAX_COLUMNS, MAX_ROWS, type StoreColumn } from "@/lib/stores/model";
import { saveStoreAction } from "../actions";

type Col = { uid: string; key?: string; label: string };
type Row = { uid: string; id?: string; values: Record<string, string> };

const PAGE = 50;
let seq = 0;
const uid = () => `u${++seq}`;

/**
 * Columns and rows of one store, edited in place with ONE save button (nothing is written until it is pressed).
 * A column keeps its key when renamed, so forms that point at it keep working; new columns get a key on save.
 */
export function StoreEditor({ storeId, columns, displayColumn, rows }: { storeId: string; columns: StoreColumn[]; displayColumn: string | null; rows: { id: string; values: Record<string, string> }[] }) {
  const router = useRouter();
  const [cols, setCols] = useState<Col[]>(() => columns.map((c) => ({ uid: c.key, key: c.key, label: c.label })));
  const [display, setDisplay] = useState<string>(displayColumn ?? columns[0]?.key ?? "");
  const [data, setData] = useState<Row[]>(() => rows.map((r) => ({ uid: r.id, id: r.id, values: r.values })));
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "saved" } | { kind: "error"; text: string }>({ kind: "idle" });
  const [pending, start] = useTransition();

  // Leaving with unsaved changes asks first: closing the tab, a link inside the app, or another form on the page
  // (an import reloads the table from the database).
  useEffect(() => {
    if (!dirty) return;
    const message = "יש שינויים במאגר שלא נשמרו. לצאת בלי לשמור?";
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const click = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      // A download (the export) or a link opened in a new tab leaves this page as it is: no question.
      if (!a || a.hasAttribute("download") || a.target === "_blank" || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
      if (!confirm(message)) { e.preventDefault(); e.stopPropagation(); }
    };
    const submit = (e: SubmitEvent) => {
      if ((e.target as HTMLFormElement).dataset.storeForm === "import" && !confirm(message)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
    };
  }, [dirty]);

  const touch = () => { setDirty(true); setStatus({ kind: "idle" }); };
  // A column without a key yet (added in this session) is addressed by its uid until it is saved.
  const colId = (c: Col) => c.key ?? c.uid;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? data.filter((r) => Object.values(r.values).some((v) => v.toLowerCase().includes(q))) : data;
  }, [data, query]);

  const setCell = (rowUid: string, col: string, value: string) => {
    setData((d) => d.map((r) => (r.uid === rowUid ? { ...r, values: { ...r.values, [col]: value } } : r)));
    touch();
  };

  const problem = columnsProblem(cols);
  const save = () =>
    start(async () => {
      if (problem) { setStatus({ kind: "error", text: problem }); return; }
      // New columns are sent without a key: the server gives them one. They have no values yet (the table shows
      // them after the save).
      const sentCols = cols.map((c) => ({ key: c.key, label: c.label }));
      const shownCol = cols.find((c) => colId(c) === display);
      let res: Awaited<ReturnType<typeof saveStoreAction>>;
      try {
        res = await saveStoreAction(storeId, {
          columns: sentCols,
          displayColumn: shownCol?.key ?? null,
          displayLabel: shownCol?.label ?? null,
          rows: data.map((r) => ({ id: r.id, values: Object.fromEntries(cols.filter((c) => c.key).map((c) => [c.key!, r.values[c.key!] ?? ""])) })),
        });
      } catch {
        // The edits stay in the editor: nothing is lost, the person can try again.
        setStatus({ kind: "error", text: "השמירה נכשלה. השינויים עדיין כאן – נסו שוב." });
        return;
      }
      if (!res.ok) { setStatus({ kind: "error", text: res.error }); return; }
      setDirty(false);
      setStatus({ kind: "saved" });
      router.refresh();
    });

  const newCols = cols.filter((c) => !c.key && c.label.trim());

  return (
    <div className="space-y-6">
      <section aria-labelledby="cols-title" className="space-y-3">
        <div>
          <h2 id="cols-title" className="font-semibold">עמודות</h2>
          <p className="text-sm text-muted-foreground">שינוי שם של עמודה לא שובר טפסים שמשתמשים בה. מחיקת עמודה מוחקת את הערכים שלה מכל השורות.</p>
        </div>
        <ul className="space-y-2">
          {cols.map((c, i) => (
            <li key={c.uid} className="flex flex-wrap items-center gap-2">
              <Input
                value={c.label}
                onChange={(e) => { const label = e.target.value; setCols((cs) => cs.map((x) => (x.uid === c.uid ? { ...x, label } : x))); touch(); }}
                maxLength={80}
                aria-label={`שם העמודה ${i + 1}`}
                className="max-w-xs"
              />
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <Radio name="display" checked={display === colId(c)} onChange={() => { setDisplay(colId(c)); touch(); }} />
                מוצג ברשימה הנפתחת
              </label>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                aria-label={`מחיקת העמודה ${c.label || i + 1}`}
                disabled={cols.length <= 1}
                onClick={() => {
                  if (c.key && data.some((r) => r.values[c.key!]) && !confirm(`למחוק את העמודה "${c.label}" ואת כל הערכים שלה?`)) return;
                  setCols((cs) => cs.filter((x) => x.uid !== c.uid));
                  if (display === colId(c)) setDisplay(cols.find((x) => x.uid !== c.uid) ? colId(cols.find((x) => x.uid !== c.uid)!) : "");
                  touch();
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="outline" disabled={cols.length >= MAX_COLUMNS} onClick={() => { setCols((cs) => [...cs, { uid: uid(), label: "" }]); touch(); }}>
          <Plus className="size-4" aria-hidden />הוספת עמודה
        </Button>
        {newCols.length > 0 && <p className="text-xs text-muted-foreground">עמודה חדשה תופיע בטבלה אחרי השמירה.</p>}
      </section>

      <section aria-labelledby="rows-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="rows-title" className="font-semibold">שורות</h2>
            <p className="text-sm text-muted-foreground">{data.length} שורות{query && ` · ${filtered.length} תואמות לחיפוש`}</p>
          </div>
          <div className="relative w-full max-w-xs">
            <Label htmlFor="rows-search" className="sr-only">חיפוש בשורות</Label>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="rows-search" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder="חיפוש" className="ps-9" />
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                {cols.filter((c) => c.key).map((c) => (
                  <th key={c.uid} scope="col" className="px-2 py-2 text-start font-medium">{c.label || "—"}</th>
                ))}
                <th scope="col" className="w-12 px-2 py-2"><span className="sr-only">מחיקה</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, shown).map((r) => (
                <tr key={r.uid} className="border-t">
                  {cols.filter((c) => c.key).map((c) => (
                    <td key={c.uid} className="px-2 py-1">
                      <Input value={r.values[c.key!] ?? ""} onChange={(e) => setCell(r.uid, c.key!, e.target.value)} maxLength={500} aria-label={c.label} className="h-9 min-w-36" />
                    </td>
                  ))}
                  <td className="px-2 py-1">
                    <Button variant="ghost" size="icon" className="text-destructive" aria-label="מחיקת השורה" onClick={() => { setData((d) => d.filter((x) => x.uid !== r.uid)); touch(); }}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={cols.filter((c) => c.key).length + 1} className="px-3 py-6 text-center text-muted-foreground">{query ? "אין שורות שתואמות לחיפוש" : "אין עדיין שורות. הוסיפו שורה או ייבאו מאקסל."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={data.length >= MAX_ROWS}
            onClick={() => { const row = { uid: uid(), values: {} }; setData((d) => [...d, row]); setQuery(""); setShown(Math.max(shown, data.length + 1)); touch(); }}
          >
            <Plus className="size-4" aria-hidden />הוספת שורה
          </Button>
          {filtered.length > shown && <Button variant="ghost" onClick={() => setShown((n) => n + PAGE)}>הצגת עוד {Math.min(PAGE, filtered.length - shown)}</Button>}
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <Button onClick={save} disabled={pending || !dirty}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
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

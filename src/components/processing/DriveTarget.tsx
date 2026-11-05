"use client";
import { ChevronLeft, Folder, FolderOpen, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { checkDrivePathAction, listDriveFoldersAction } from "@/app/admin/forms/drive-actions";
import { PATH_VARIABLES } from "@/lib/processing/path";

type Crumb = { id?: string; name: string };

/**
 * Where a Drive destination files its documents: either a folder picked out of the connected Drive, or a
 * path typed with variables. Both are offered, as agreed — the picker for "this exact folder", the path for
 * "a folder per organization and year", which cannot be picked in advance because it does not exist yet.
 */
export function DriveTarget({
  folderId, path, fileName, onChange, idPrefix,
}: {
  folderId?: string;
  path?: string;
  fileName?: string;
  onChange: (patch: { folderId?: string; path?: string; fileName?: string }) => void;
  idPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ name: "תיקיית השורש" }]);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [check, setCheck] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const browse = (crumb: Crumb, trail: Crumb[]) =>
    start(async () => {
      const r = await listDriveFoldersAction(crumb.id);
      setNote(r.ok ? (r.folders.length ? null : "אין תיקיות משנה כאן.") : (r.message ?? "הקריאה נכשלה"));
      setFolders(r.folders);
      setCrumbs(trail);
    });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-path`}>נתיב התיקייה</Label>
        <Input
          id={`${idPrefix}-path`}
          value={path ?? ""}
          onChange={(e) => onChange({ path: e.target.value, folderId: undefined })}
          placeholder="שכר {עמותה}/{שנה}/101_{שנה}"
        />
        <p className="text-xs text-muted-foreground">
          מתחת לתיקיית השורש של העמותה. משתנים: {PATH_VARIABLES.map((v) => `{${v}}`).join(" ")} וגם {"{שדה:מזהה_שדה}"}.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !path?.trim()}
            onClick={() =>
              start(async () => {
                const r = await checkDrivePathAction(path ?? "", { organization: "העמותה", form: "הטופס", type: "101", subject: "דנה כהן", idNumber: "123456782" });
                if (!r.ok) { setCheck(r.message ?? "הבדיקה נכשלה"); return; }
                const made = r.segments.length - r.existing;
                setCheck(
                  `${r.segments.join(" / ") || "הנתיב ריק"} · ${made > 0 ? `${made} תיקיות ייווצרו` : "כל התיקיות כבר קיימות"}` +
                    (r.missing.length ? ` · חסר ערך ל-${r.missing.map((m) => `{${m}}`).join(", ")}` : ""),
                );
              })
            }
          >
            {pending ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : null}בדיקת נתיב
          </Button>
          {check && <span role="status" className="text-xs text-muted-foreground">{check}</span>}
        </div>
      </div>

      <div className="rounded-md border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { const next = !open; setOpen(next); if (next && !folders.length) browse({ name: "תיקיית השורש" }, [{ name: "תיקיית השורש" }]); }}
            aria-expanded={open}
          >
            <FolderOpen className="size-4" aria-hidden />בחירת תיקייה קיימת מהדרייב
          </Button>
          {folderId && <span className="text-xs text-success">נבחרה תיקייה מהדרייב (הנתיב מעליה לא בשימוש)</span>}
        </div>

        {open && (
          <div className="mt-3 space-y-2">
            <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="נתיב">
              {crumbs.map((c, i) => (
                <span key={`${c.id ?? "root"}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <ChevronLeft className="size-3" aria-hidden />}
                  <button type="button" className="underline hover:text-foreground" onClick={() => browse(c, crumbs.slice(0, i + 1))}>{c.name}</button>
                </span>
              ))}
            </nav>
            {pending && <p className="text-xs text-muted-foreground">טוען…</p>}
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
            <ul className="max-h-56 space-y-1 overflow-auto">
              {folders.map((f) => (
                <li key={f.id} className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => browse({ id: f.id, name: f.name }, [...crumbs, { id: f.id, name: f.name }])}>
                    <Folder className="size-4" aria-hidden />{f.name}
                  </Button>
                  <Button
                    type="button"
                    variant={folderId === f.id ? "default" : "outline"}
                    size="sm"
                    className={cn("ms-auto")}
                    onClick={() => { onChange({ folderId: f.id, path: undefined }); setOpen(false); }}
                  >
                    {folderId === f.id ? "נבחרה" : "בחירה"}
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">מוצגות רק תיקיות ששותפו עם חשבון השירות של המערכת.</p>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-filename`}>שם הקובץ (לא חובה)</Label>
        <Input id={`${idPrefix}-filename`} value={fileName ?? ""} onChange={(e) => onChange({ fileName: e.target.value })} placeholder={`{סוג} - {עובד} {ת"ז}.pdf`} />
      </div>
    </div>
  );
}

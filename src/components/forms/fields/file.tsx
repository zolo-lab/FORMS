"use client";
import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FieldProps, UploadedFile } from "./types";

export function FileUploadInput({ field, domId, value, onChange, disabled, onUpload }: FieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const files = Array.isArray(value) ? (value as UploadedFile[]) : [];
  const maxFiles = field.validation?.maxFiles ?? 1;
  const maxMb = field.validation?.maxSizeMb;

  async function pick(list: FileList | null) {
    if (!list || !onUpload) return;
    setError(null);
    setBusy(true);
    try {
      const next = [...files];
      for (const f of Array.from(list)) {
        if (next.length >= maxFiles) { setError(`ניתן להעלות עד ${maxFiles} קבצים`); break; }
        if (maxMb && f.size > maxMb * 1024 * 1024) { setError(`גודל קובץ מקסימלי ${maxMb}MB`); continue; }
        next.push(await onUpload(f));
      }
      onChange(next);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "ההעלאה נכשלה, נסו שוב");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div id={domId} className="space-y-2">
      <ul className="space-y-1">
        {files.map((f, i) => (
          <li key={f.url + i} className="flex items-center gap-2 text-sm">
            <Paperclip className="size-4 text-muted-foreground" />
            <a href={f.url} target="_blank" rel="noreferrer" className="underline">{f.name}</a>
            {!disabled && (
              <button type="button" aria-label={`הסרת ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                <X className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && files.length < maxFiles && (
        <>
          <input
            ref={inputRef}
            type="file"
            hidden
            multiple={maxFiles > 1}
            accept={field.validation?.accept?.join(",")}
            onChange={(e) => pick(e.target.files)}
          />
          <Button variant="outline" disabled={busy || !onUpload} onClick={() => inputRef.current?.click()}>
            {busy ? "מעלה…" : "בחירת קובץ"}
          </Button>
          {!onUpload && <p className="text-sm text-muted-foreground">העלאת קבצים אינה זמינה בתצוגה זו</p>}
        </>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

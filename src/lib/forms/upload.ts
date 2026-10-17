/** Limits for files a signer uploads (residence certificate, ID photo…). Pure, so it is unit tested. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_UPLOAD_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"] as const;

export type UploadCheck = { ok: true } | { ok: false; error: "too_big" | "bad_type" | "empty" };

export function checkUpload(f: { size: number; mime: string }): UploadCheck {
  if (f.size <= 0) return { ok: false, error: "empty" };
  if (f.size > MAX_UPLOAD_BYTES) return { ok: false, error: "too_big" };
  if (!(ALLOWED_UPLOAD_MIME as readonly string[]).includes(f.mime)) return { ok: false, error: "bad_type" };
  return { ok: true };
}

export const UPLOAD_ERRORS: Record<string, string> = {
  too_big: "הקובץ גדול מדי (עד 10MB)",
  bad_type: "סוג קובץ לא נתמך (PDF או תמונה בלבד)",
  empty: "הקובץ ריק",
};

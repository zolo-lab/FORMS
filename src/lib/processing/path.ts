/**
 * Drive paths and file names with variables: "שכר {עמותה}/{שנה}/101_{שנה}" → real folder names.
 * Pure and unit tested, because a wrong segment here files a signed document in the wrong place —
 * and because the builder has to be able to show what a path will become before anything is sent.
 */
import { safeSegment } from "@/lib/drive/archive-path";

/** What a path may be built from. Everything is optional: a missing value is reported, never guessed. */
export interface PathContext {
  organization?: string;
  project?: string;
  /** The form (package) name. */
  form?: string;
  /** The document type of the part, or the part's own name. */
  type?: string;
  subject?: string;
  idNumber?: string;
  /** When the request was signed; the year, month and date come from it, in Israel time. */
  signedAt?: Date;
  requestId?: string;
  /** Answers, for `{שדה:field_id}`. */
  answers?: Record<string, unknown>;
}

export const PATH_VARIABLES = ["עמותה", "פרויקט", "שנה", "חודש", "סוג", "טופס", "עובד", 'ת"ז', "תאריך", "מספר בקשה"] as const;

const he = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", ...opts }).format(d);

function valueOf(name: string, ctx: PathContext): string | undefined {
  const at = ctx.signedAt ?? new Date();
  switch (name) {
    case "עמותה": return ctx.organization;
    case "פרויקט": return ctx.project;
    case "שנה": return he(at, { year: "numeric" });
    case "חודש": return he(at, { month: "2-digit" });
    case "סוג": return ctx.type;
    case "טופס": return ctx.form;
    case "עובד": return ctx.subject;
    case 'ת"ז': return ctx.idNumber?.replace(/\D/g, "") || undefined;
    case "תאריך": return he(at, { year: "numeric", month: "2-digit", day: "2-digit" });
    case "מספר בקשה": return ctx.requestId?.replace(/-/g, "").slice(0, 8);
    default: {
      const field = /^שדה:(.+)$/.exec(name);
      if (!field) return undefined;
      const v = ctx.answers?.[field[1]!.trim()];
      return v === undefined || v === null || v === "" ? undefined : String(v);
    }
  }
}

export interface ResolvedPath {
  /** Folder names below the root, each one safe to create in Drive. */
  segments: string[];
  /** Variables the template used that this system does not know. */
  unknown: string[];
  /** Variables it knows but that have no value for this request. */
  missing: string[];
}

/**
 * Turns a template into folder segments. A variable with no value becomes nothing and is reported in
 * `missing`, so a path never silently collapses into a folder called "undefined"; empty segments are dropped.
 */
export function resolvePath(template: string, ctx: PathContext): ResolvedPath {
  const unknown: string[] = [];
  const missing: string[] = [];
  const text = (template ?? "").replace(/\{([^}]*)\}/g, (_, raw: string) => {
    const name = raw.trim();
    const known = PATH_VARIABLES.includes(name as (typeof PATH_VARIABLES)[number]) || /^שדה:/.test(name);
    if (!known) { unknown.push(name); return ""; }
    const v = valueOf(name, ctx);
    if (v === undefined || v === "") { missing.push(name); return ""; }
    return v;
  });
  const segments = text
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => safeSegment(s));
  return { segments, unknown: [...new Set(unknown)], missing: [...new Set(missing)] };
}

/** The file name a destination writes, with the same variables. Always ends in .pdf. */
export function resolveFileName(template: string | undefined, ctx: PathContext): string {
  const fallback = `{סוג} - {עובד} {ת"ז}`;
  const { segments } = resolvePath((template?.trim() || fallback).replace(/\//g, " "), ctx);
  const name = segments.join(" ").replace(/\.pdf$/i, "").trim();
  return `${name || "מסמך"}.pdf`;
}

/** One line for the builder: what this template becomes right now. */
export function describePath(template: string, ctx: PathContext): string {
  const r = resolvePath(template, ctx);
  if (r.unknown.length) return `משתנה לא מוכר: ${r.unknown.map((u) => `{${u}}`).join(", ")}`;
  if (!r.segments.length) return "הנתיב ריק";
  const note = r.missing.length ? ` (חסר ערך ל-${r.missing.map((m) => `{${m}}`).join(", ")})` : "";
  return `${r.segments.join(" / ")}${note}`;
}

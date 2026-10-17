/** Pure helpers for the requests dashboard: URL filters, progress, timeline wording. No I/O. */
import { REQUEST_STATUSES } from "@/lib/workflow/types";
import { ROLE_LABELS } from "@/lib/workflow/labels";

export const PAGE_SIZE = 25;

export interface RequestFilters {
  org?: string;
  status?: (typeof REQUEST_STATUSES)[number];
  role?: string;
  pkg?: string;
  /** YYYY-MM-DD (inclusive) */
  from?: string;
  to?: string;
  overdue?: boolean;
  q?: string;
  /** Table (default) or kanban board. */
  view?: "board";
  /** Requests with an open step addressed to this e-mail (the signed-in user's inbox; never read from the URL). */
  assigneeEmail?: string;
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseFilters(sp: SearchParams): RequestFilters {
  const f: RequestFilters = { page: 1 };
  const org = first(sp.org);
  if (org && UUID.test(org)) f.org = org;
  const pkg = first(sp.pkg);
  if (pkg && UUID.test(pkg)) f.pkg = pkg;
  const status = first(sp.status);
  if (status && (REQUEST_STATUSES as readonly string[]).includes(status)) f.status = status as RequestFilters["status"];
  const role = first(sp.role);
  if (role && role in ROLE_LABELS) f.role = role;
  const from = first(sp.from);
  if (from && DATE.test(from)) f.from = from;
  const to = first(sp.to);
  if (to && DATE.test(to)) f.to = to;
  if (first(sp.overdue) === "1") f.overdue = true;
  const q = first(sp.q)?.trim();
  if (q) f.q = q.slice(0, 80);
  if (first(sp.view) === "board") f.view = "board";
  const page = Number.parseInt(first(sp.page) ?? "1", 10);
  f.page = Number.isFinite(page) && page >= 1 ? page : 1;
  return f;
}

/** Query string for a filter set (defaults omitted). `override` changes keys, e.g. `{ page: 1 }`. */
export function filtersToQuery(f: RequestFilters, override: Partial<RequestFilters> = {}): string {
  const m = { ...f, ...override };
  const p = new URLSearchParams();
  if (m.org) p.set("org", m.org);
  if (m.pkg) p.set("pkg", m.pkg);
  if (m.status) p.set("status", m.status);
  if (m.role) p.set("role", m.role);
  if (m.from) p.set("from", m.from);
  if (m.to) p.set("to", m.to);
  if (m.overdue) p.set("overdue", "1");
  if (m.q) p.set("q", m.q);
  if (m.view) p.set("view", m.view);
  if (m.page > 1) p.set("page", String(m.page));
  return p.toString();
}

export function progress(steps: { status: string }[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.status === "completed" || s.status === "skipped").length, total: steps.length };
}

export function daysSince(date: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const role = (r: unknown) => (typeof r === "string" && r in ROLE_LABELS ? ROLE_LABELS[r as keyof typeof ROLE_LABELS] : "");

/** Hebrew sentence for a timeline entry. */
export function eventLabel(type: string, payload: Record<string, unknown> = {}): string {
  const reason = typeof payload.reason === "string" && payload.reason ? ` · ${payload.reason}` : "";
  const r = role(payload.role);
  switch (type) {
    case "request_created": return "הבקשה נוצרה";
    case "request_sent": return "הבקשה נשלחה";
    case "request_completed": return "הבקשה הושלמה";
    case "request_declined": return `הבקשה נדחתה${reason}`;
    case "request_cancelled": return `הבקשה בוטלה${reason}`;
    case "request_expired": return "תוקף הבקשה פג";
    case "step_activated": return `שלב נפתח${r ? ` · ${r}` : ""}`;
    case "step_opened": return `הקישור נפתח${r ? ` · ${r}` : ""}`;
    case "step_saved": return "נשמרה טיוטה";
    case "step_completed": return `שלב הושלם${r ? ` · ${r}` : ""}`;
    case "file_uploaded": return `הועלה קובץ${payload.name ? `: ${String(payload.name)}` : ""}`;
    case "step_declined": return `שלב נדחה${reason}`;
    case "step_returned": return `הוחזר לתיקון${reason}`;
    case "step_delegated": return "השלב הועבר לאדם אחר";
    case "step_skipped": return `שלב דולג${r ? ` · ${r}` : ""}`;
    case "step_expired": return "תוקף שלב פג";
    case "request_extended": return "תוקף הבקשה הוארך";
    case "step_assignee_changed": return `הוחלף נמען${r ? ` · ${r}` : ""}`;
    case "otp_sent": return "נשלח קוד אימות";
    case "otp_verified": return "קוד האימות אומת";
    default: return type;
  }
}

export interface BoardRow {
  id: string;
  status: string;
  waitingFor: { role: string }[];
}
export interface BoardColumn<T extends BoardRow> {
  key: string;
  title: string;
  rows: T[];
}

/**
 * Kanban columns: one per role someone is waiting on (a request waiting on two roles shows in both),
 * then requests with no open step, completed, and stopped (declined/cancelled/expired). Empty columns are omitted.
 */
export function boardColumns<T extends BoardRow>(rows: T[]): BoardColumn<T>[] {
  const cols: BoardColumn<T>[] = [];
  for (const [role, title] of Object.entries(ROLE_LABELS)) {
    const list = rows.filter((r) => r.waitingFor.some((w) => w.role === role));
    if (list.length) cols.push({ key: role, title: `ממתין ל${title}`, rows: list });
  }
  const open = ["draft", "in_progress", "returned"];
  const idle = rows.filter((r) => open.includes(r.status) && r.waitingFor.length === 0);
  if (idle.length) cols.push({ key: "idle", title: "ללא שלב פעיל", rows: idle });
  const done = rows.filter((r) => r.status === "completed");
  if (done.length) cols.push({ key: "completed", title: "הושלמו", rows: done });
  const stopped = rows.filter((r) => ["declined", "cancelled", "expired"].includes(r.status));
  if (stopped.length) cols.push({ key: "stopped", title: "נעצרו", rows: stopped });
  return cols;
}

/** The earliest of the open steps' due dates (null when none has one). */
export function nearestDue(dates: (Date | null)[]): Date | null {
  const set = dates.filter((d): d is Date => !!d);
  return set.length ? new Date(Math.min(...set.map((d) => d.getTime()))) : null;
}


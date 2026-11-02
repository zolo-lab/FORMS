/**
 * The request's journey as a parcel-tracking style timeline: who already handled it, where it is now and for how
 * long, and who comes next. Pure (steps in, view model out) so the rules are unit tested; the same model feeds the
 * request page, the "in my chain" list and the tracking screen (which shows status only, never content).
 */

/** After this many whole days on one step, the step is flagged as stuck (the plan's default; per-step later). */
export const DEFAULT_STUCK_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TimelineStepInput {
  id: string;
  order: number;
  role: string;
  status: string;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  activatedAt?: Date | null;
  firstViewedAt?: Date | null;
  completedAt?: Date | null;
  declineReason?: string | null;
  returnReason?: string | null;
}

export type TimelineState = "done" | "current" | "upcoming" | "returned" | "declined" | "skipped" | "closed";

export interface TimelineStep {
  id: string;
  order: number;
  role: string;
  /** Who handles it, for display ("העובד – דנה כהן", "משה לוי"). */
  who: string;
  state: TimelineState;
  activatedAt: Date | null;
  viewedAt: Date | null;
  completedAt: Date | null;
  /** Whole days the current step has been waiting; null when the step is not current. */
  daysWaiting: number | null;
  stuck: boolean;
  /** Reason given when the step declined or returned the request. */
  reason: string | null;
  /** The signed-in viewer is this step's assignee. */
  isViewer: boolean;
}

export interface Timeline {
  steps: TimelineStep[];
  /** One line for lists: "אצל משה לוי · יום 4". */
  summary: string;
  /** Where the viewer stands, when they are in the chain. */
  viewerNote: string | null;
  stuck: boolean;
}

export interface TimelineOptions {
  now?: Date;
  stuckDays?: number;
  /** E-mail of the person looking, to mark their step and say where they stand. */
  viewerEmail?: string | null;
}

function stateOf(status: string): TimelineState {
  switch (status) {
    case "completed":
      return "done";
    case "active":
    case "in_progress":
      return "current";
    case "pending":
      return "upcoming";
    case "returned":
      return "returned";
    case "declined":
      return "declined";
    case "skipped":
    case "delegated":
      return "skipped";
    default:
      // expired, cancelled: the step ended without being handled.
      return "closed";
  }
}

export function whoOf(s: Pick<TimelineStepInput, "role" | "assigneeName" | "assigneeEmail">): string {
  if (s.role === "requester") return s.assigneeName ? `השולח – ${s.assigneeName}` : "השולח";
  if (s.role === "employee") return s.assigneeName ? `העובד – ${s.assigneeName}` : "העובד";
  return s.assigneeName || s.assigneeEmail || "מאשר";
}

/** Whole days between two moments (never negative). */
export function wholeDays(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

export function buildTimeline(input: TimelineStepInput[], requestStatus: string, opts: TimelineOptions = {}): Timeline {
  const now = opts.now ?? new Date();
  const stuckDays = opts.stuckDays ?? DEFAULT_STUCK_DAYS;
  const viewer = opts.viewerEmail?.trim().toLowerCase() || null;
  const open = requestStatus === "in_progress" || requestStatus === "returned";

  const sorted = [...input].sort((a, b) => a.order - b.order);
  const steps: TimelineStep[] = sorted.map((s) => {
    const state = stateOf(s.status);
    const current = state === "current" && open;
    const days = current && s.activatedAt ? wholeDays(s.activatedAt, now) : null;
    return {
      id: s.id,
      order: s.order,
      role: s.role,
      who: whoOf(s),
      // A step left "active" on a request that is no longer open (cancelled, expired) did not happen.
      state: state === "current" && !open ? "closed" : state,
      activatedAt: s.activatedAt ?? null,
      viewedAt: s.firstViewedAt ?? null,
      completedAt: s.completedAt ?? null,
      daysWaiting: days,
      stuck: days !== null && days >= stuckDays,
      reason: s.status === "declined" ? (s.declineReason ?? null) : s.status === "returned" ? (s.returnReason ?? null) : null,
      isViewer: !!viewer && (s.assigneeEmail ?? "").trim().toLowerCase() === viewer,
    };
  });

  const current = steps.filter((s) => s.state === "current");
  return { steps, summary: summaryOf(steps, current, requestStatus), viewerNote: viewerNoteOf(steps, current, open), stuck: current.some((s) => s.stuck) };
}

function summaryOf(steps: TimelineStep[], current: TimelineStep[], requestStatus: string): string {
  switch (requestStatus) {
    case "draft":
      return "טיוטה – עוד לא נשלחה";
    case "completed":
      return "הושלם – כל השלבים חתמו";
    case "declined": {
      const d = steps.find((s) => s.state === "declined");
      return d ? `נדחה אצל ${d.who}${d.reason ? ` · ${d.reason}` : ""}` : "נדחה";
    }
    case "cancelled":
      return "בוטל";
    case "expired":
      return "פג תוקף";
  }
  if (!current.length) return "בטיפול";
  const days = Math.max(...current.map((s) => s.daysWaiting ?? 0));
  const names = current.map((s) => s.who).join(", ");
  return `אצל ${names} · ${days === 0 ? "מהיום" : `יום ${days}`}`;
}

function viewerNoteOf(steps: TimelineStep[], current: TimelineStep[], open: boolean): string | null {
  const mine = steps.filter((s) => s.isViewer);
  if (!mine.length) return null;
  if (mine.some((s) => s.state === "current")) return "תורך עכשיו";
  const next = mine.find((s) => s.state === "upcoming");
  if (next && open) {
    // Steps that share an order run together, so count distinct orders still ahead of the viewer.
    const from = current.length ? Math.min(...current.map((s) => s.order)) : next.order;
    const ahead = new Set(steps.filter((s) => (s.state === "current" || s.state === "upcoming") && s.order >= from && s.order < next.order).map((s) => s.order)).size;
    if (ahead <= 1) return "אתה השלב הבא";
    return `לפניך עוד ${plural(ahead, "שלב אחד", "שלבים")}`;
  }
  if (mine.some((s) => s.state === "done")) return "סיימת את השלב שלך";
  return null;
}

/** Steps grouped by request id, for list screens that load many requests' steps in one query. */
export function groupStepsByRequest<T extends { requestId: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.requestId);
    if (list) list.push(r);
    else m.set(r.requestId, [r]);
  }
  return m;
}

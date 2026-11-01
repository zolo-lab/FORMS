/**
 * Who hears what when a request changes state (pure, so it is unit tested).
 *  - request completed / declined: the person the request is about and whoever opened it;
 *  - a step completed (and the request is still going): whoever opened it, as a progress note;
 *  - a step returned for correction is handled where the target step is re-activated (it gets the "returned" text
 *    with the reason and a fresh link instead of the plain invitation).
 */
import type { RecipientKind } from "./triggers";

export interface Recipient {
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface StatusEvent {
  type: string;
  stepId?: string;
  payload?: Record<string, unknown>;
}

export interface StatusNotice {
  to: Recipient;
  key: "completed" | "declined" | "step_done";
  vars: { name: string; subject?: string; reason?: string; stepName?: string };
}

/** What the triggers panel set for one of these notices (see `triggers.ts`); without it, the defaults. */
export interface NoticeSetting {
  enabled: boolean;
  recipients: RecipientKind[];
  fixedRecipients: { name: string; email: string }[];
}

type StatusKey = StatusNotice["key"];

const DEFAULTS: Record<StatusKey, NoticeSetting> = {
  completed: { enabled: true, recipients: ["employee", "creator"], fixedRecipients: [] },
  declined: { enabled: true, recipients: ["employee", "creator"], fixedRecipients: [] },
  step_done: { enabled: true, recipients: ["creator", "trackers"], fixedRecipients: [] },
};

export function statusNotices(
  events: StatusEvent[],
  ctx: {
    subject: Recipient;
    creator?: Recipient | null;
    stepName: (stepId: string) => string;
    /** Role of a step (to tell the person's own step apart). */
    stepRole?: (stepId: string) => string | undefined;
    /** Tracking users of the organization: told when the person finished their step. */
    watchers?: Recipient[];
    /** The organization's secretariat / bookkeeping addresses (for triggers that include them). */
    secretariat?: Recipient[];
    bookkeeping?: Recipient[];
    settings?: Partial<Record<StatusKey, NoticeSetting>>;
  },
): StatusNotice[] {
  const out: StatusNotice[] = [];
  const setting = (k: StatusKey) => ctx.settings?.[k] ?? DEFAULTS[k];
  const completed = events.some((e) => e.type === "request_completed");
  const declined = events.some((e) => e.type === "request_declined");
  const reason = String(events.find((e) => e.type === "step_declined")?.payload?.reason ?? "");

  /** One notice per person: an address already told for this event is skipped (case-insensitive). */
  const told = new Set<string>();
  const push = (to: Recipient, key: StatusKey, vars: StatusNotice["vars"]) => {
    const e = to.email?.trim().toLowerCase();
    if (e) {
      if (told.has(e)) return;
      told.add(e);
    }
    out.push({ to, key, vars });
  };
  const others = (st: NoticeSetting, kinds: RecipientKind[]): Recipient[] => [
    ...(kinds.includes("secretariat") && st.recipients.includes("secretariat") ? (ctx.secretariat ?? []) : []),
    ...(kinds.includes("bookkeeping") && st.recipients.includes("bookkeeping") ? (ctx.bookkeeping ?? []) : []),
    ...(kinds.includes("fixed") && st.recipients.includes("fixed") ? st.fixedRecipients : []),
  ];

  const both = (key: "completed" | "declined", extra: { reason?: string }) => {
    const st = setting(key);
    if (!st.enabled) return;
    const about = { subject: ` (${ctx.subject.name})`, ...extra };
    if (st.recipients.includes("employee")) push(ctx.subject, key, { name: ctx.subject.name, ...extra });
    if (ctx.creator && st.recipients.includes("creator")) push(ctx.creator, key, { name: ctx.creator.name, ...about });
    for (const p of others(st, ["secretariat", "bookkeeping", "fixed"])) push(p, key, { name: p.name, ...about });
  };
  if (completed) both("completed", {});
  else if (declined) both("declined", { reason });
  else {
    const st = setting("step_done");
    if (!st.enabled) return out;
    for (const e of events) {
      if (e.type !== "step_completed" || !e.stepId) continue;
      told.clear();
      const vars = (name: string) => ({ name, subject: ctx.subject.name, stepName: ctx.stepName(e.stepId!) });
      if (ctx.creator && st.recipients.includes("creator")) push(ctx.creator, "step_done", vars(ctx.creator.name));
      // The secretariats that chase signatures hear when the person themselves finished their part.
      const ownStep = ctx.stepRole?.(e.stepId) === "employee";
      if (ownStep && st.recipients.includes("trackers")) for (const w of ctx.watchers ?? []) push(w, "step_done", vars(w.name));
      for (const p of others(st, ownStep ? ["secretariat", "fixed"] : ["fixed"])) push(p, "step_done", vars(p.name));
    }
  }
  return out;
}

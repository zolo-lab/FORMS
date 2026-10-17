/**
 * Who hears what when a request changes state (pure, so it is unit tested).
 *  - request completed / declined: the person the request is about and whoever opened it;
 *  - a step completed (and the request is still going): whoever opened it, as a progress note;
 *  - a step returned for correction is handled where the target step is re-activated (it gets the "returned" text
 *    with the reason and a fresh link instead of the plain invitation).
 */
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

export function statusNotices(
  events: StatusEvent[],
  ctx: { subject: Recipient; creator?: Recipient | null; stepName: (stepId: string) => string },
): StatusNotice[] {
  const out: StatusNotice[] = [];
  const completed = events.some((e) => e.type === "request_completed");
  const declined = events.some((e) => e.type === "request_declined");
  const reason = String(events.find((e) => e.type === "step_declined")?.payload?.reason ?? "");
  const same = (a: Recipient, b: Recipient) => !!a.email && a.email.toLowerCase() === (b.email ?? "").toLowerCase();

  const both = (key: "completed" | "declined", extra: { reason?: string }) => {
    out.push({ to: ctx.subject, key, vars: { name: ctx.subject.name, ...extra } });
    if (ctx.creator && !same(ctx.creator, ctx.subject)) {
      out.push({ to: ctx.creator, key, vars: { name: ctx.creator.name, subject: ` (${ctx.subject.name})`, ...extra } });
    }
  };
  if (completed) both("completed", {});
  else if (declined) both("declined", { reason });
  else if (ctx.creator) {
    for (const e of events) {
      if (e.type === "step_completed" && e.stepId) {
        out.push({ to: ctx.creator, key: "step_done", vars: { name: ctx.creator.name, subject: ctx.subject.name, stepName: ctx.stepName(e.stepId) } });
      }
    }
  }
  return out;
}

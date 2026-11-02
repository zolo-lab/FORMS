import { AlertTriangle, Check, Circle, Clock, MinusCircle, Undo2, X } from "lucide-react";
import type { Timeline, TimelineState, TimelineStep } from "@/lib/requests/timeline";
import { cn } from "@/lib/utils";

/**
 * Parcel-tracking style view of a request's chain. Status only: names, dates and reasons, never answers or files,
 * so it is safe on the tracking screen too. Each state has an icon and a word, not only a colour.
 */

const STATE: Record<TimelineState, { label: string; Icon: typeof Check; dot: string; text: string }> = {
  done: { label: "הושלם", Icon: Check, dot: "bg-success text-primary-foreground border-success", text: "text-success" },
  current: { label: "ממתין עכשיו", Icon: Clock, dot: "bg-primary text-primary-foreground border-primary", text: "text-primary" },
  upcoming: { label: "בהמשך", Icon: Circle, dot: "bg-card text-muted-foreground border-border", text: "text-muted-foreground" },
  returned: { label: "החזיר לתיקון", Icon: Undo2, dot: "bg-warning text-foreground border-warning", text: "text-foreground" },
  declined: { label: "דחה", Icon: X, dot: "bg-destructive text-primary-foreground border-destructive", text: "text-destructive" },
  skipped: { label: "דולג", Icon: MinusCircle, dot: "bg-muted text-muted-foreground border-border", text: "text-muted-foreground" },
  closed: { label: "לא טופל", Icon: MinusCircle, dot: "bg-muted text-muted-foreground border-border", text: "text-muted-foreground" },
};

const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });

function StepDetails({ s, compact }: { s: TimelineStep; compact: boolean }) {
  const bits: string[] = [];
  if (s.state === "current") {
    if (s.activatedAt) bits.push(`נשלח ${fmt.format(s.activatedAt)}`);
    bits.push(s.viewedAt ? `נפתח ${fmt.format(s.viewedAt)}` : "עוד לא נפתח");
  } else if (s.completedAt && (s.state === "done" || s.state === "returned" || s.state === "declined")) {
    bits.push(fmt.format(s.completedAt));
  }
  if (!bits.length && !s.reason) return null;
  return (
    <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>
      {bits.join(" · ")}
      {s.reason && (
        <>
          {bits.length > 0 && " · "}
          <span className="text-foreground">סיבה: {s.reason}</span>
        </>
      )}
    </p>
  );
}

export function RequestTimeline({ timeline, compact = false, title = "איפה הבקשה עכשיו" }: { timeline: Timeline; compact?: boolean; title?: string | null }) {
  const { steps } = timeline;
  if (!steps.length) return <p className="text-sm text-muted-foreground">הבקשה עדיין טיוטה ולא נשלחה.</p>;
  const position = steps.findIndex((s) => s.state === "current");
  return (
    <div className="space-y-3">
      {title !== null && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {title && <h2 className="font-semibold">{title}</h2>}
          <p className="text-sm text-muted-foreground">
            {timeline.summary}
            {position >= 0 && ` · שלב ${position + 1} מתוך ${steps.length}`}
          </p>
          {timeline.viewerNote && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{timeline.viewerNote}</span>}
        </div>
      )}
      <ol className="relative space-y-0" aria-label="שלבי הבקשה">
        {steps.map((s, i) => {
          const st = STATE[s.state];
          const last = i === steps.length - 1;
          return (
            <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0" aria-current={s.state === "current" ? "step" : undefined}>
              {!last && <span aria-hidden className={cn("absolute top-7 bottom-0 w-px start-3.5", s.state === "done" ? "bg-success/60" : "bg-border")} />}
              <span aria-hidden className={cn("relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2", st.dot)}>
                <st.Icon className="size-3.5" strokeWidth={3} />
              </span>
              <div className={cn("min-w-0 flex-1 space-y-0.5 rounded-md", s.isViewer && "bg-primary/5 px-2 py-1 -my-1")}>
                <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5", compact ? "text-sm" : "text-base")}>
                  <span className={cn("font-medium", s.state === "upcoming" && "text-muted-foreground")}>{s.who}</span>
                  {s.isViewer && <span className="text-xs text-primary">(את/ה)</span>}
                  <span className={cn("text-xs font-medium", st.text)}>
                    {st.label}
                    {s.daysWaiting !== null && ` · ${s.daysWaiting === 0 ? "מהיום" : `יום ${s.daysWaiting}`}`}
                  </span>
                  {s.stuck && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                      <AlertTriangle aria-hidden className="size-3" />
                      תקוע
                    </span>
                  )}
                </p>
                <StepDetails s={s} compact={compact} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

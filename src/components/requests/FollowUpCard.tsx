import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { followUpAction } from "@/app/admin/requests/actions";
import type { FollowUpState, FollowUpStatus } from "@/lib/requests/follow-up";

/** Handling after signing ("עודכן בשכר"…): a row per status with who ticked it and when. */
export function FollowUpCard({ requestId, statuses, state, canMark }: { requestId: string; statuses: FollowUpStatus[]; state: FollowUpState; canMark: boolean }) {
  const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
  return (
    <section className="space-y-2" aria-labelledby="followup-h">
      <h2 id="followup-h" className="font-semibold">טיפול אחרי החתימה</h2>
      <Card className="divide-y">
        {statuses.map((s) => {
          const done = state[s.key];
          return (
            <form key={s.key} action={followUpAction} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <input type="hidden" name="requestId" value={requestId} />
              <input type="hidden" name="key" value={s.key} />
              <input type="hidden" name="done" value={done ? "0" : "1"} />
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className={done ? "text-success" : "text-muted-foreground"}>{done ? "✓" : "○"}</span>
                <span className={done ? "font-medium" : ""}>{s.label}</span>
                {done && <span className="text-xs text-muted-foreground">{fmt.format(new Date(done.at))}{done.byName ? ` · ${done.byName}` : ""}</span>}
              </span>
              {canMark && (
                <Button type="submit" size="sm" variant={done ? "ghost" : "outline"}>
                  {done ? "ביטול סימון" : "סימון כבוצע"}
                </Button>
              )}
            </form>
          );
        })}
      </Card>
    </section>
  );
}

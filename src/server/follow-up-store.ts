/** Handling steps after signing ("עודכן בשכר"): tick / untick on a completed request, with an audit event. */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeFollowUpStatuses, setFollowUp, type FollowUpState } from "@/lib/requests/follow-up";

const { requests, packageTemplates, events } = schema;

export async function markFollowUp(requestId: string, key: string, done: boolean, by: { id?: string; name?: string }): Promise<{ ok: boolean; message?: string }> {
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!req) return { ok: false, message: "הבקשה לא נמצאה" };
  if (req.status !== "completed") return { ok: false, message: "אפשר לסמן טיפול רק אחרי שכל השלבים הושלמו" };
  const [pkg] = await db.select().from(packageTemplates).where(eq(packageTemplates.id, req.packageTemplateId));
  const status = normalizeFollowUpStatuses(pkg?.followUpStatuses).find((s) => s.key === key);
  if (!status) return { ok: false, message: "שלב טיפול לא מוכר" };
  const next = setFollowUp(req.followUp as FollowUpState, key, done, by);
  await db.update(requests).set({ followUp: next }).where(eq(requests.id, requestId));
  await db.insert(events).values({ requestId, actorType: "user", actorId: by.id, type: done ? "follow_up_done" : "follow_up_undone", payload: { key, label: status.label } });
  return { ok: true };
}

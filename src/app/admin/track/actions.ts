"use server";
import { remindNow } from "@/server/reminders";
import { canTrackRequest, currentUser } from "@/server/users-store";

/** "שלח תזכורת עכשיו": allowed for anyone who may track the request; the link itself is never returned. */
export async function remindNowAction(requestId: string): Promise<{ ok: boolean; message: string }> {
  const me = await currentUser();
  if (!(await canTrackRequest(requestId))) return { ok: false, message: "אין הרשאה לבקשה הזו" };
  return remindNow(requestId, { id: me?.id });
}

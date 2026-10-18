import { hasGrant } from "@/lib/auth/permissions";
import { currentUser } from "@/server/users-store";
import { recordFeedback } from "@/server/detect-memory";
import type { Feedback } from "@/lib/pdf/learn";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const UUID = /^[0-9a-f-]{36}$/;

/**
 * Body: { templateId?, items: [{ sourceLabel, detectedType, kept, finalLabel?, finalType?, finalKey? }] } → { saved }.
 * What the admin did with each proposed field, so the next detection can follow it.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!hasGrant(user, "manageForms")) return Response.json({ error: "אין הרשאה" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { templateId?: unknown; items?: unknown } | null;
  if (!Array.isArray(body?.items)) return Response.json({ error: "קלט לא תקין" }, { status: 400 });
  const items: Feedback[] = (body.items as Record<string, unknown>[]).slice(0, 300).map((i) => ({
    sourceLabel: text(i.sourceLabel, 300),
    detectedType: text(i.detectedType, 40),
    kept: i.kept === true,
    ...(typeof i.finalLabel === "string" ? { finalLabel: text(i.finalLabel, 300) } : {}),
    ...(typeof i.finalType === "string" ? { finalType: text(i.finalType, 40) } : {}),
    ...(typeof i.finalKey === "string" ? { finalKey: text(i.finalKey, 80) } : {}),
  }));
  const templateId = typeof body.templateId === "string" && UUID.test(body.templateId) ? body.templateId : null;
  try {
    return Response.json({ saved: await recordFeedback(items, { templateId, userId: user?.id ?? null }) });
  } catch {
    return Response.json({ saved: 0 });
  }
}

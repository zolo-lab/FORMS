import { hasGrant } from "@/lib/auth/permissions";
import { currentUser } from "@/server/users-store";
import { matchWithClaude, pdfMatchEnabled } from "@/server/pdf-match";

const MAX = 400;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * Body: { fields: [{ id, type, label }], labels: [{ id, text }] } → { matches: [{ fieldId, labelId, score }] | null }.
 * `matches: null` = no model answer (no key, error): use the local matcher.
 */
export async function POST(req: Request) {
  if (!hasGrant(await currentUser(), "manageForms")) return Response.json({ error: "אין הרשאה" }, { status: 403 });
  if (!pdfMatchEnabled()) return Response.json({ matches: null });
  const body = (await req.json().catch(() => null)) as { fields?: unknown; labels?: unknown } | null;
  if (!Array.isArray(body?.fields) || !Array.isArray(body?.labels)) return Response.json({ error: "קלט לא תקין" }, { status: 400 });
  const fields = (body.fields as Record<string, unknown>[]).slice(0, MAX).map((f) => ({ id: text(f.id, 100), type: text(f.type, 40), label: text(f.label, 200) }));
  const labels = (body.labels as Record<string, unknown>[]).slice(0, MAX).map((l) => ({ id: text(l.id, 40), text: text(l.text, 200) }));
  return Response.json({ matches: await matchWithClaude(fields as never, labels) });
}

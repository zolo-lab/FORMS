import { hasGrant } from "@/lib/auth/permissions";
import { currentUser } from "@/server/users-store";
import { pdfMatchEnabled } from "@/server/pdf-match";
import { refineWithClaude } from "@/server/pdf-detect";
import { learnedFor, recentExamples } from "@/server/detect-memory";

const MAX = 200;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * Body: { fields: [{ id, label, type, options?: [{ label }] }] } →
 * { refinements: [{ id, label?, type? }] | null, learned: { [normalized label]: { skip?, label?, type?, key? } } }.
 * `learned` = the latest decision admins made about the same label (src/lib/pdf/learn.ts); it wins over the model.
 * `refinements: null` = no model answer (no key, error): keep the local detection.
 */
export async function POST(req: Request) {
  if (!hasGrant(await currentUser(), "manageForms")) return Response.json({ error: "אין הרשאה" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { fields?: unknown } | null;
  if (!Array.isArray(body?.fields)) return Response.json({ error: "קלט לא תקין" }, { status: 400 });
  const fields = (body.fields as Record<string, unknown>[]).slice(0, MAX).map((f) => ({
    id: text(f.id, 40),
    label: text(f.label, 200),
    type: text(f.type, 40),
    options: Array.isArray(f.options) ? (f.options as Record<string, unknown>[]).slice(0, 30).map((o) => ({ label: text(o?.label, 100) })) : undefined,
  }));
  const learned = await learnedFor(fields.map((f) => f.label));
  if (!pdfMatchEnabled()) return Response.json({ refinements: null, learned });
  const refinements = await refineWithClaude(fields as never, { examples: await recentExamples() });
  return Response.json({ refinements, learned });
}

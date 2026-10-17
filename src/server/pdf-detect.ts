/**
 * Asks a language model for a second opinion on the fields detected in a PDF (cleaner labels, better text types).
 * Names go out, ids come back; no key or any failure means "no answer" and the local detection stands.
 */
import { REFINE_TOOL, refinePrompt, sanitizeRefinements, type Refinement } from "@/lib/pdf/refine";
import type { DetectedField } from "@/lib/pdf/detect";

const URL = "https://api.anthropic.com/v1/messages";

type Named = Pick<DetectedField, "id" | "label" | "type"> & { options?: { label: string }[] };

export async function refineWithClaude(
  fields: Named[],
  opts: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {},
): Promise<Refinement[] | null> {
  const env = opts.env ?? process.env;
  const key = env.ANTHROPIC_API_KEY;
  if (!key || fields.length === 0) return null;
  try {
    const res = await (opts.fetchImpl ?? fetch)(URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 3000,
        tools: [REFINE_TOOL],
        tool_choice: { type: "tool", name: REFINE_TOOL.name },
        messages: [{ role: "user", content: refinePrompt(fields) }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: { type: string; name?: string; input?: unknown }[] };
    const call = json.content?.find((c) => c.type === "tool_use" && c.name === REFINE_TOOL.name);
    return call ? sanitizeRefinements(call.input, fields) : null;
  } catch {
    return null;
  }
}

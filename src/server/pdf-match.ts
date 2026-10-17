/**
 * Asks a language model which printed label belongs to which form field. Names only go out (field ids, types,
 * labels and the text of the PDF's labels – no answers, no personal data) and only ids come back; any failure
 * or a missing key means "no answer" and the caller falls back to the local matcher.
 */
import { MATCH_TOOL, matchPrompt, sanitizeMatches, type Match, type MatchLabel } from "@/lib/pdf/match";
import type { FormField } from "@/lib/forms/schema";

const URL = "https://api.anthropic.com/v1/messages";

export const pdfMatchEnabled = (env: Record<string, string | undefined> = process.env) => !!env.ANTHROPIC_API_KEY;

export async function matchWithClaude(
  fields: Pick<FormField, "id" | "type" | "label">[],
  labels: MatchLabel[],
  opts: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {},
): Promise<Match[] | null> {
  const env = opts.env ?? process.env;
  const key = env.ANTHROPIC_API_KEY;
  if (!key || fields.length === 0 || labels.length === 0) return null;
  try {
    const res = await (opts.fetchImpl ?? fetch)(URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 2000,
        tools: [MATCH_TOOL],
        tool_choice: { type: "tool", name: MATCH_TOOL.name },
        messages: [{ role: "user", content: matchPrompt(fields, labels) }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: { type: string; name?: string; input?: unknown }[] };
    const call = json.content?.find((c) => c.type === "tool_use" && c.name === MATCH_TOOL.name);
    return call ? sanitizeMatches(call.input, fields, labels) : null;
  } catch {
    return null;
  }
}

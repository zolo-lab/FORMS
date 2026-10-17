import { describe, expect, it } from "vitest";
import { matchWithClaude, pdfMatchEnabled } from "@/server/pdf-match";

const fields = [{ id: "a", type: "date" as const, label: "תאריך" }];
const labels = [{ id: "l1", text: "תאריך" }];
const reply = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe("matchWithClaude", () => {
  it("is off without a key and never calls the network", async () => {
    expect(pdfMatchEnabled({})).toBe(false);
    let called = false;
    const f = (async () => { called = true; return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
    expect(await matchWithClaude(fields, labels, { env: {}, fetchImpl: f })).toBeNull();
    expect(called).toBe(false);
  });
  it("sends names only, forces the tool and returns sanitised pairs", async () => {
    let sent: { headers: Record<string, string>; body: { model: string; tool_choice: unknown; messages: { content: string }[] } } | null = null;
    const f = (async (_u: string, init: { headers: Record<string, string>; body: string }) => {
      sent = { headers: init.headers, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ content: [{ type: "tool_use", name: "report_matches", input: { matches: [{ fieldId: "a", labelId: "l1", confidence: 0.95 }, { fieldId: "x", labelId: "l1", confidence: 1 }] } }] }) };
    }) as unknown as typeof fetch;
    const r = await matchWithClaude(fields, labels, { env: { ANTHROPIC_API_KEY: "k" }, fetchImpl: f });
    expect(r).toEqual([{ fieldId: "a", labelId: "l1", score: 0.95 }]);
    expect(sent!.headers["x-api-key"]).toBe("k");
    expect(sent!.body.model).toBe("claude-sonnet-5-5");
    expect(sent!.body.tool_choice).toEqual({ type: "tool", name: "report_matches" });
    expect(sent!.body.messages[0]!.content).toContain("- a | date | תאריך");
  });
  it("returns null on HTTP errors, odd replies and exceptions", async () => {
    const env = { ANTHROPIC_API_KEY: "k" };
    expect(await matchWithClaude(fields, labels, { env, fetchImpl: reply({}, false) })).toBeNull();
    expect(await matchWithClaude(fields, labels, { env, fetchImpl: reply({ content: [{ type: "text" }] }) })).toBeNull();
    expect(await matchWithClaude(fields, labels, { env, fetchImpl: (async () => { throw new Error("x"); }) as unknown as typeof fetch })).toBeNull();
  });
});

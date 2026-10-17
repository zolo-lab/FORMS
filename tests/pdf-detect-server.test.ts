import { describe, expect, it } from "vitest";
import { refineWithClaude } from "@/server/pdf-detect";
import { applyRefinements, refinePrompt, sanitizeRefinements } from "@/lib/pdf/refine";

const fields = [
  { id: "d0", label: "3. שם פרטי:", type: "short_text" as const },
  { id: "d1", label: "מין", type: "radio" as const, options: [{ label: "זכר" }, { label: "נקבה" }] },
  { id: "d2", label: "תאריך", type: "date" as const },
];

describe("refinements", () => {
  it("builds a prompt of names only", () => {
    const p = refinePrompt(fields);
    expect(p).toContain("- d0 | short_text | 3. שם פרטי:");
    expect(p).toContain("options: זכר, נקבה");
  });
  it("keeps good answers and drops unknown ids, bad types, structural changes and no-ops", () => {
    const r = sanitizeRefinements({ fields: [
      { id: "d0", label: " שם   פרטי ", type: "short_text" },
      { id: "d1", label: "מין העובד", type: "date" }, // a choice keeps its type; the label may improve
      { id: "d2", type: "signature" }, // not an allowed type
      { id: "d2", type: "phone" },
      { id: "zzz", label: "x" },
      { id: "d0", label: "again" },
    ] }, fields);
    expect(r).toEqual([{ id: "d0", label: "שם פרטי" }, { id: "d1", label: "מין העובד" }, { id: "d2", type: "phone" }]);
    expect(sanitizeRefinements({ fields: "x" }, fields)).toEqual([]);
    expect(sanitizeRefinements(null, fields)).toEqual([]);
  });
  it("applies refinements without touching anything else", () => {
    const out = applyRefinements(fields, [{ id: "d0", label: "שם פרטי", type: "short_text" }]);
    expect(out[0]).toMatchObject({ label: "שם פרטי", type: "short_text" });
    expect(out[1]).toBe(fields[1]);
  });
});

describe("refineWithClaude", () => {
  it("is off without a key and never calls the network", async () => {
    let called = false;
    const f = (async () => { called = true; return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
    expect(await refineWithClaude(fields, { env: {}, fetchImpl: f })).toBeNull();
    expect(called).toBe(false);
  });
  it("forces the tool and returns sanitised answers", async () => {
    let sent: { tool_choice: unknown } | null = null;
    const f = (async (_u: string, init: { body: string }) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ content: [{ type: "tool_use", name: "report_fields", input: { fields: [{ id: "d0", label: "שם פרטי" }, { id: "nope", label: "x" }] } }] }) };
    }) as unknown as typeof fetch;
    expect(await refineWithClaude(fields, { env: { ANTHROPIC_API_KEY: "k" }, fetchImpl: f })).toEqual([{ id: "d0", label: "שם פרטי" }]);
    expect(sent!.tool_choice).toEqual({ type: "tool", name: "report_fields" });
  });
  it("returns null on HTTP errors and exceptions", async () => {
    const env = { ANTHROPIC_API_KEY: "k" };
    expect(await refineWithClaude(fields, { env, fetchImpl: (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch })).toBeNull();
    expect(await refineWithClaude(fields, { env, fetchImpl: (async () => { throw new Error("x"); }) as unknown as typeof fetch })).toBeNull();
  });
});

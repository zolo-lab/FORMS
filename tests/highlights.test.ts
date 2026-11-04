import { describe, expect, it } from "vitest";
import { detailsText, highlightsOf, identifierValue } from "@/lib/forms/highlights";
import type { FormDefinition } from "@/lib/forms/schema";
import { renderTemplate } from "@/lib/notifications/templates";
import { DEFAULT_HTML, renderHtml } from "@/lib/notifications/email-design";

const def = (fields: Record<string, unknown>[]): FormDefinition =>
  ({ schemaVersion: 1, title: "t", pages: [{ id: "p1", title: "", fields }] }) as unknown as FormDefinition;

const form = def([
  { id: "supplier", type: "short_text", label: "שם הספק", identifier: true },
  { id: "amount", type: "number", label: "סכום", showInMessages: true },
  { id: "note", type: "short_text", label: "הערה" },
  { id: "cost", type: "short_text", label: "מרכז עלות", internal: true, showInMessages: true },
]);

describe("highlights", () => {
  it("reads the identifier and the message details, skipping internal fields", () => {
    const h = highlightsOf(form, { supplier: "אלקטרה", amount: 1200, note: "לא רלוונטי", cost: "100" });
    expect(h.identifier).toEqual({ label: "שם הספק", value: "אלקטרה" });
    expect(h.lines.map((l) => l.label)).toEqual(["שם הספק", "סכום"]);
    expect(detailsText(h)).toBe("שם הספק: אלקטרה\nסכום: 1,200");
  });

  it("an identifier not filled yet is empty, not the name from the wizard", () => {
    const h = highlightsOf(form, {});
    expect(h.identifier).toEqual({ label: "שם הספק", value: "" });
    expect(identifierValue(h, "ישראל ישראלי")).toBe("");
    expect(detailsText(h)).toBe("");
  });

  it("a form without an identifier falls back to the name the request was opened with", () => {
    const h = highlightsOf(def([{ id: "a", type: "short_text", label: "א" }]), {});
    expect(h.identifier).toBe(null);
    expect(identifierValue(h, "ישראל ישראלי")).toBe("ישראל ישראלי");
  });

  it("over several forms of one package the first identifier wins and a field is taken once", () => {
    const a = def([{ id: "x", type: "short_text", label: "ראשון", identifier: true }]);
    const b = def([
      { id: "x", type: "short_text", label: "ראשון שוב", identifier: true },
      { id: "y", type: "short_text", label: "שני", identifier: true, showInMessages: true },
    ]);
    const h = highlightsOf([a, b], { x: "1", y: "2" });
    expect(h.identifier).toEqual({ label: "ראשון", value: "1" });
    expect(h.lines.map((l) => l.label)).toEqual(["ראשון", "שני"]);
  });

  it("no definitions at all is empty, not a crash", () => {
    expect(highlightsOf([], { a: 1 })).toEqual({ identifier: null, lines: [] });
  });

  it("an option field shows its label, not its stored value", () => {
    const h = highlightsOf(
      def([{ id: "kind", type: "dropdown", label: "סוג", identifier: true, options: [{ value: "a", label: "חוזה" }] }]),
      { kind: "a" },
    );
    expect(h.identifier?.value).toBe("חוזה");
  });
});

describe("the details block in the messages", () => {
  it("a line made only of empty placeholders disappears instead of leaving a gap", () => {
    const body = "שלום {{name}},\n{{details}}\nלמעבר: {{link}}";
    expect(renderTemplate(body, { name: "דנה", link: "L" })).toBe("שלום דנה,\nלמעבר: L");
    expect(renderTemplate(body, { name: "דנה", link: "L", details: "סכום: 10" })).toBe("שלום דנה,\nסכום: 10\nלמעבר: L");
  });

  it("a line with text around a placeholder is kept even when the value is empty", () => {
    expect(renderTemplate("ממתין ל: {{stepName}}", {})).toBe("ממתין ל: ");
  });

  it("the designed e-mail drops its details box when nothing is filled", () => {
    const html = DEFAULT_HTML.step_invite!;
    expect(html).toContain("{{details}}");
    expect(renderHtml(html, { name: "דנה" })).not.toContain("{{details}}");
    expect(renderHtml(html, { name: "דנה" })).not.toContain("border-right:3px solid");
    expect(renderHtml(html, { name: "דנה", details: "סכום: 10" })).toContain("סכום: 10");
  });

  it("the markers never reach the reader", () => {
    for (const key of ["step_invite", "reminder", "completed", "completion_docs", "sent_to_creator"]) {
      const out = renderHtml(DEFAULT_HTML[key]!, { details: "א: ב" });
      expect(out).not.toContain("<!--if:");
      expect(out).not.toContain("<!--/if:");
    }
  });
});

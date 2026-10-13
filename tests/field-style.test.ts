import { describe, expect, it } from "vitest";
import { FIELD_STYLE_OPTIONS, cleanStyle, fieldStyleClass } from "@/lib/forms/field-style";
import { parseFormDefinition } from "@/lib/forms/schema";

describe("fieldStyleClass", () => {
  it("is empty without a style", () => {
    expect(fieldStyleClass(undefined)).toBe("");
    expect(fieldStyleClass({})).toBe("");
  });
  it("maps each option to a semantic utility", () => {
    expect(fieldStyleClass({ size: "lg" })).toContain("text-lg");
    expect(fieldStyleClass({ size: "sm" })).toContain("text-xs");
    expect(fieldStyleClass({ bold: true })).toContain("font-bold");
    expect(fieldStyleClass({ color: "primary" })).toContain("text-primary");
    expect(fieldStyleClass({ color: "muted" })).toContain("text-muted-foreground");
    expect(fieldStyleClass({ color: "destructive" })).toContain("text-destructive");
    expect(fieldStyleClass({ align: "center" })).toContain("text-center");
    expect(fieldStyleClass({ highlight: true })).toContain("bg-accent");
  });
  it("combines options", () => {
    const c = fieldStyleClass({ size: "xl", bold: true, color: "primary", align: "end", highlight: true });
    for (const part of ["text-2xl", "font-bold", "text-primary", "text-end", "bg-accent"]) expect(c).toContain(part);
  });
  it("only ever emits RTL-safe, token-based classes", () => {
    const every = FIELD_STYLE_OPTIONS.flatMap((g) => g.options.map((o) => o.value));
    expect(every.length).toBeGreaterThan(5);
    const all = fieldStyleClass({ size: "xl", bold: true, color: "destructive", align: "start", highlight: true });
    expect(all).not.toMatch(/\b(ml|mr|pl|pr|left|right)-|text-(left|right)|#[0-9a-f]{3,6}/);
  });
});

describe("cleanStyle", () => {
  it("drops defaults and empty values, and returns undefined when nothing is left", () => {
    expect(cleanStyle({ size: "md", bold: false, color: "default", align: "start", highlight: false })).toBeUndefined();
    expect(cleanStyle({ size: "lg", bold: false })).toEqual({ size: "lg" });
    expect(cleanStyle({ bold: true, color: "primary" })).toEqual({ bold: true, color: "primary" });
  });
});

describe("schema", () => {
  const base = (style: unknown) => ({
    schemaVersion: 1,
    title: "t",
    pages: [{ id: "p", title: "p", fields: [{ id: "a", type: "short_text", label: "א", style }] }],
  });
  it("accepts a valid style and rejects unknown values", () => {
    expect(parseFormDefinition(base({ size: "lg", bold: true, color: "primary", align: "center", highlight: true })).success).toBe(true);
    expect(parseFormDefinition(base({ size: "gigantic" })).success).toBe(false);
    expect(parseFormDefinition(base({ color: "#ff0000" })).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { applyLearned, examplesFor, feedbackFrom, latestDecisions, learnKey } from "@/lib/pdf/learn";
import { refinePrompt } from "@/lib/pdf/refine";
import type { DetectedField } from "@/lib/pdf/detect";

const box = { x: 0, y: 0, width: 10, height: 10 };
const f = (id: string, label: string, type: DetectedField["type"], key?: string): DetectedField => ({ id, label, type, page: 0, box, ...(key ? { key } : {}) });

describe("feedback from the dialog", () => {
  it("records kept, renamed and dropped proposals against the local label", () => {
    const proposed = [f("d0", "שם", "short_text", "name"), f("d1", "(1)", "short_text"), f("d2", "בשנת המס", "short_text")];
    const kept = [{ ...proposed[0]!, label: "שם המעסיק", key: "employer_name" }];
    const items = feedbackFrom(proposed, kept);
    expect(items).toEqual([
      { sourceLabel: "שם", detectedType: "short_text", kept: true, finalLabel: "שם המעסיק", finalType: "short_text", finalKey: "employer_name" },
      { sourceLabel: "בשנת המס", detectedType: "short_text", kept: false },
    ]);
  });
});

describe("the latest decision per label", () => {
  const rows = [
    { sourceLabel: "בשנת המס", sourceNorm: learnKey("בשנת המס"), detectedType: "short_text", kept: false },
    { sourceLabel: "תאריך", sourceNorm: learnKey("תאריך"), detectedType: "short_text", kept: true, finalLabel: "תאריך החתימה", finalType: "date", finalKey: "signDate" },
    // Older: a different decision for the same label is ignored.
    { sourceLabel: "בשנת המס", sourceNorm: learnKey("בשנת המס"), detectedType: "short_text", kept: true, finalLabel: "שנת המס" },
  ];
  const learned = Object.fromEntries(latestDecisions(rows));
  it("keeps only the newest decision", () => {
    expect(learned[learnKey("בשנת המס")]).toEqual({ skip: true });
    expect(learned[learnKey("תאריך")]).toEqual({ label: "תאריך החתימה", type: "date", key: "signDate" });
  });
  it("applies it to new proposals: dropped ones come unticked, kept ones renamed", () => {
    const out = applyLearned([f("d0", "בשנת המס", "short_text"), f("d1", "תאריך:", "short_text"), f("d2", "טלפון", "phone")], learned);
    expect(out[0]).toMatchObject({ learned: true, skip: true });
    expect(out[1]).toMatchObject({ learned: true, label: "תאריך החתימה", type: "date", key: "signDate" });
    expect(out[2]!.learned).toBeUndefined();
  });
  it("never changes the structure of a choice or a table", () => {
    const out = applyLearned([f("d0", "תאריך", "radio")], learned);
    expect(out[0]!.type).toBe("radio");
    expect(out[0]!.label).toBe("תאריך החתימה");
  });
});

describe("examples for the model", () => {
  it("lists only real corrections, newest first", () => {
    const ex = examplesFor([
      { sourceLabel: "בשנת המס", detectedType: "short_text", kept: false },
      { sourceLabel: "שם", detectedType: "short_text", kept: true, finalLabel: "שם" },
      { sourceLabel: "ת.ז", detectedType: "short_text", kept: true, finalLabel: "מספר זהות", finalType: "id_number" },
    ]);
    expect(ex).toEqual(['"בשנת המס" (short_text) → not a field', '"ת.ז" (short_text) → "מספר זהות" (id_number)']);
    expect(refinePrompt([{ id: "d0", label: "x", type: "short_text" }], ex)).toContain("Corrections this organization's admins made");
  });
});

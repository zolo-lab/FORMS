import { describe, expect, it } from "vitest";
import { normalizeFollowUpStatuses, parseFollowUpStatuses, pendingFollowUp, setFollowUp } from "@/lib/requests/follow-up";

describe("follow-up statuses", () => {
  it("parses lines, keeps existing keys, drops blanks and duplicates", () => {
    const first = parseFollowUpStatuses("עודכן בשכר\n\nהוקם בפריוריטי\nעודכן בשכר");
    expect(first.map((s) => s.label)).toEqual(["עודכן בשכר", "הוקם בפריוריטי"]);
    const again = parseFollowUpStatuses("הוקם בפריוריטי\nנשלח למנהל", first);
    expect(again[0].key).toBe(first[1].key);
    expect(new Set(again.map((s) => s.key)).size).toBe(2);
  });
  it("pending = first not done; tick and untick", () => {
    const sts = [{ key: "a", label: "א" }, { key: "b", label: "ב" }];
    expect(pendingFollowUp(sts, {})?.key).toBe("a");
    const st = setFollowUp({}, "a", true, { id: "u1", name: "חשבות" }, new Date("2026-10-19T10:00:00Z"));
    expect(st.a).toEqual({ at: "2026-10-19T10:00:00.000Z", byUserId: "u1", byName: "חשבות" });
    expect(pendingFollowUp(sts, st)?.key).toBe("b");
    expect(pendingFollowUp(sts, setFollowUp(st, "b", true, {}))).toBeNull();
    expect(setFollowUp(st, "a", false, {})).toEqual({});
  });
  it("normalizes junk", () => {
    expect(normalizeFollowUpStatuses([{ key: "a", label: "x" }, { key: 1 }, null])).toEqual([{ key: "a", label: "x" }]);
    expect(normalizeFollowUpStatuses("x")).toEqual([]);
  });
});

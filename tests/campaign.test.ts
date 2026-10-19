import { describe, expect, it } from "vitest";
import { normalizeCampaign, percent, summarizeCampaigns } from "@/lib/requests/campaign";

describe("campaigns", () => {
  it("normalizes tags", () => {
    expect(normalizeCampaign("  101   2027 ")).toBe("101 2027");
    expect(normalizeCampaign("")).toBeNull();
    expect(normalizeCampaign(null)).toBeNull();
  });
  it("summarizes per campaign and organization", () => {
    const s = summarizeCampaigns([
      { campaign: "101 2027", organization: "פנימה", status: "completed", count: 8 },
      { campaign: "101 2027", organization: "פנימה", status: "in_progress", count: 2 },
      { campaign: "101 2027", organization: "אל עמי", status: "cancelled", count: 1 },
      { campaign: "101 2026", organization: "פנימה", status: "completed", count: 5 },
    ]);
    expect(s.map((c) => c.campaign)).toEqual(["101 2027", "101 2026"]);
    expect(s[0]).toMatchObject({ total: 11, completed: 8, open: 2, other: 1 });
    expect(s[0]!.byOrganization.map((o) => o.organization)).toEqual(["אל עמי", "פנימה"]);
    expect(percent(8, 11)).toBe(73);
    expect(percent(0, 0)).toBe(0);
  });
});

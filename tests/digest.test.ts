import { describe, expect, it } from "vitest";
import { digestItems, digestMessage, isDigestTime } from "@/lib/notifications/digest";

describe("weekly digest", () => {
  it("runs Sunday 08:xx Israel time only", () => {
    expect(isDigestTime(new Date("2026-10-18T05:30:00Z"))).toBe(true); // Sunday 08:30 IDT
    expect(isDigestTime(new Date("2026-10-18T07:30:00Z"))).toBe(false);
    expect(isDigestTime(new Date("2026-10-19T05:30:00Z"))).toBe(false); // Monday
  });
  it("keeps requests waiting more than 3 days, longest first", () => {
    const items = digestItems([
      { subject: "א", packageName: "קליטה", waitingFor: "עובד", days: 2 },
      { subject: "ב", packageName: "קליטה", waitingFor: "עובד", days: 9 },
      { subject: "ג", packageName: "סיום", waitingFor: "מאשר", days: 4 },
    ]);
    expect(items.map((i) => i.subject)).toEqual(["ב", "ג"]);
    const m = digestMessage("פנימה", items, "https://x/admin/track");
    expect(m.subject).toBe("2 בקשות ממתינות – פנימה");
    expect(m.body).toContain("ב – קליטה – ממתין לעובד – 9 ימים");
  });
});

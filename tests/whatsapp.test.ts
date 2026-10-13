import { describe, expect, it } from "vitest";
import { normalizeIsraeliPhone, whatsappUrl } from "@/lib/whatsapp";

describe("normalizeIsraeliPhone", () => {
  it("converts local mobile numbers to 972 format", () => {
    expect(normalizeIsraeliPhone("050-123 4567")).toBe("972501234567");
    expect(normalizeIsraeliPhone("0501234567")).toBe("972501234567");
  });
  it("keeps numbers already in international form", () => {
    expect(normalizeIsraeliPhone("+972 50-123-4567")).toBe("972501234567");
    expect(normalizeIsraeliPhone("972501234567")).toBe("972501234567");
    expect(normalizeIsraeliPhone("00972501234567")).toBe("972501234567");
  });
  it("returns null for numbers that cannot be valid", () => {
    expect(normalizeIsraeliPhone("")).toBeNull();
    expect(normalizeIsraeliPhone("12345")).toBeNull();
    expect(normalizeIsraeliPhone("abc")).toBeNull();
  });
});

describe("whatsappUrl", () => {
  it("builds a wa.me link with the encoded text", () => {
    const u = whatsappUrl("0501234567", "שלום\nhttps://x/s/a b");
    expect(u).toBe(`https://wa.me/972501234567?text=${encodeURIComponent("שלום\nhttps://x/s/a b")}`);
  });
  it("without a phone number, opens the share picker (no recipient)", () => {
    expect(whatsappUrl(undefined, "היי")).toBe(`https://wa.me/?text=${encodeURIComponent("היי")}`);
  });
});

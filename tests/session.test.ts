import { describe, expect, it } from "vitest";
import { checkAdminPassword, createSessionToken, verifySessionToken } from "@/lib/auth/session";

describe("session token", () => {
  const secret = "test-secret-123";
  it("accepts a fresh token", async () => {
    const t = await createSessionToken(secret, 1000);
    expect(await verifySessionToken(secret, t, 2000)).toBe(true);
  });
  it("rejects expired token", async () => {
    const t = await createSessionToken(secret, 1000);
    expect(await verifySessionToken(secret, t, 1000 + 13 * 60 * 60 * 1000)).toBe(false);
  });
  it("rejects wrong secret, tampering, garbage and empty", async () => {
    const t = await createSessionToken(secret, 1000);
    expect(await verifySessionToken("other", t, 2000)).toBe(false);
    const [exp, sig] = t.split(".");
    expect(await verifySessionToken(secret, `${Number(exp) + 99999999}.${sig}`, 2000)).toBe(false);
    expect(await verifySessionToken(secret, "garbage", 2000)).toBe(false);
    expect(await verifySessionToken(secret, undefined, 2000)).toBe(false);
    expect(await verifySessionToken("", t, 2000)).toBe(false);
  });
  it("refuses to create a token without a secret", async () => {
    await expect(createSessionToken("")).rejects.toThrow();
  });
});

describe("admin password", () => {
  it("matches only the exact password", async () => {
    expect(await checkAdminPassword("abc", "abc")).toBe(true);
    expect(await checkAdminPassword("abd", "abc")).toBe(false);
    expect(await checkAdminPassword("abcd", "abc")).toBe(false);
    expect(await checkAdminPassword("", "")).toBe(false);
    expect(await checkAdminPassword("abc", undefined)).toBe(false);
  });
});

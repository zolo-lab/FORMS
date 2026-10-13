import { describe, expect, it } from "vitest";
import { parseCreateBody } from "@/lib/api/create-request";
import { bearerKey, generateApiKey, hashApiKey } from "@/lib/api/keys";

const PKG = "11111111-2222-3333-4444-555555555555";
const now = new Date("2026-10-14T10:00:00Z");

describe("api keys", () => {
  it("generates a key that hashes to the stored hash and parses from a Bearer header", () => {
    const k = generateApiKey();
    expect(k.key).toMatch(/^fk_[A-Za-z0-9_-]{43}$/);
    expect(hashApiKey(k.key)).toBe(k.hash);
    expect(bearerKey(`Bearer ${k.key}`)).toBe(k.key);
    expect(k.hint).not.toContain(k.key.slice(8, 30));
  });
  it("rejects malformed headers", () => {
    expect(bearerKey(null)).toBeNull();
    expect(bearerKey("Basic abc")).toBeNull();
    expect(bearerKey("Bearer nope")).toBeNull();
  });
  it("keys are unique", () => {
    expect(generateApiKey().key).not.toBe(generateApiKey().key);
  });
});

describe("parseCreateBody", () => {
  const ok = { packageTemplateId: PKG, subject: { name: "דנה כהן", email: "dana@example.org" } };
  it("accepts the minimal body and defaults to sending", () => {
    const r = parseCreateBody(ok, now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.send).toBe(true);
      expect(r.value.answers).toEqual({});
    }
  });
  it("collects every error", () => {
    const r = parseCreateBody({ packageTemplateId: "x", subject: { name: " ", email: "bad", phone: "12" }, answers: [], expiresAt: "soon" }, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["answers", "expiresAt", "packageTemplateId", "subject.email", "subject.name", "subject.phone"]);
  });
  it("needs a way to reach the employee only when sending", () => {
    expect(parseCreateBody({ packageTemplateId: PKG, subject: { name: "דנה" } }, now).ok).toBe(false);
    expect(parseCreateBody({ packageTemplateId: PKG, subject: { name: "דנה" }, send: false }, now).ok).toBe(true);
  });
  it("checks expiresAt range, redirectUrl scheme and apiParams size", () => {
    expect(parseCreateBody({ ...ok, expiresAt: "2026-10-13T00:00:00Z" }, now).ok).toBe(false);
    expect(parseCreateBody({ ...ok, expiresAt: "2028-01-01T00:00:00Z" }, now).ok).toBe(false);
    expect(parseCreateBody({ ...ok, expiresAt: "2026-11-01T00:00:00Z" }, now).ok).toBe(true);
    expect(parseCreateBody({ ...ok, redirectUrl: "http://x.test" }, now).ok).toBe(false);
    expect(parseCreateBody({ ...ok, redirectUrl: "https://x.test/done" }, now).ok).toBe(true);
    expect(parseCreateBody({ ...ok, apiParams: { big: "x".repeat(5000) } }, now).ok).toBe(false);
  });
  it("rejects non-objects", () => {
    expect(parseCreateBody(null, now).ok).toBe(false);
    expect(parseCreateBody([], now).ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { hashPassword, isDemoAddress, validDemoPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies the right password only", () => {
    const h = hashPassword("demo-1234");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("demo-1234", h)).toBe(true);
    expect(verifyPassword("demo-12345", h)).toBe(false);
    expect(verifyPassword("", h)).toBe(false);
  });
  it("salts: same password, different hashes", () => {
    expect(hashPassword("abcdef")).not.toBe(hashPassword("abcdef"));
  });
  it("rejects missing or malformed hashes", () => {
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", "plain")).toBe(false);
    expect(verifyPassword("x", "scrypt$only")).toBe(false);
  });
});

describe("demo addresses and passwords", () => {
  it("recognises reserved domains", () => {
    expect(isDemoAddress("ruth@demo.test")).toBe(true);
    expect(isDemoAddress("a@b.example")).toBe(true);
    expect(isDemoAddress("a@example.com")).toBe(true);
    expect(isDemoAddress("israel@misrad.org.il")).toBe(false);
    expect(isDemoAddress("x@gmail.com")).toBe(false);
  });
  it("needs 6+ characters", () => {
    expect(validDemoPassword("12345")).toBe(false);
    expect(validDemoPassword("123456")).toBe(true);
  });
});

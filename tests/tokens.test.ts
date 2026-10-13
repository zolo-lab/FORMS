import { describe, expect, it } from "vitest";
import { createToken, hashToken, verifyToken } from "@/lib/auth/tokens";

describe("tokens", () => {
  it("creates a 43-char base64url token and a sha256 hex hash", () => {
    const { token, hash } = createToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hash);
  });
  it("creates distinct tokens", () => {
    expect(createToken().token).not.toBe(createToken().token);
  });
  it("verifies the right token and rejects wrong ones", () => {
    const { token, hash } = createToken();
    expect(verifyToken(hash, token)).toBe(true);
    expect(verifyToken(hash, token + "x")).toBe(false);
    expect(verifyToken(hash, "")).toBe(false);
    expect(verifyToken("short", token)).toBe(false);
  });
});

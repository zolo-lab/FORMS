import { describe, expect, it } from "vitest";
import { checkOtp, createOtp, hashOtp, otpCookieValue, verifyOtpCookie, OTP_MAX_ATTEMPTS } from "@/lib/auth/otp";

const now = new Date("2026-10-13T10:00:00Z");
const soon = new Date(now.getTime() + 10 * 60_000);

describe("otp", () => {
  it("creates a 6-digit code with a stored hash and 10 minute expiry", () => {
    const o = createOtp("step-1", now);
    expect(o.code).toMatch(/^\d{6}$/);
    expect(o.hash).toBe(hashOtp(o.code, "step-1"));
    expect(o.expiresAt.getTime()).toBe(soon.getTime());
  });
  it("accepts the right code", () => {
    const o = createOtp("s", now);
    expect(checkOtp({ hash: o.hash, expiresAt: o.expiresAt, attempts: 0, code: o.code, stepId: "s", now })).toBe("ok");
  });
  it("rejects wrong, expired and locked", () => {
    const o = createOtp("s", now);
    const base = { hash: o.hash, expiresAt: o.expiresAt, stepId: "s", now };
    expect(checkOtp({ ...base, attempts: 0, code: "000000" === o.code ? "111111" : "000000" })).toBe("wrong");
    expect(checkOtp({ ...base, attempts: 0, code: o.code, now: new Date(soon.getTime() + 1) })).toBe("expired");
    expect(checkOtp({ ...base, attempts: OTP_MAX_ATTEMPTS, code: o.code })).toBe("locked");
  });
  it("is missing when nothing was sent", () => {
    expect(checkOtp({ hash: null, expiresAt: null, attempts: 0, code: "123456", stepId: "s", now })).toBe("missing");
  });
});

describe("otp cookie", () => {
  it("round-trips and is bound to the step", () => {
    const v = otpCookieValue("secret", "step-1", now.getTime() + 1000);
    expect(verifyOtpCookie("secret", "step-1", v, now.getTime())).toBe(true);
    expect(verifyOtpCookie("secret", "step-2", v, now.getTime())).toBe(false);
    expect(verifyOtpCookie("other", "step-1", v, now.getTime())).toBe(false);
    expect(verifyOtpCookie("secret", "step-1", v, now.getTime() + 2000)).toBe(false);
    expect(verifyOtpCookie("secret", "step-1", undefined, now.getTime())).toBe(false);
  });
});

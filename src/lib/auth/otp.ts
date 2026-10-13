/** One-time code for signing steps (server side). 6 digits, 10 minutes, 5 attempts. */
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS_PER_DAY = 5;
export const OTP_COOKIE_TTL_MS = 2 * 60 * 60_000;

export function hashOtp(code: string, stepId: string): string {
  return createHash("sha256").update(`${stepId}:${code}`).digest("hex");
}

export function createOtp(stepId: string, now = new Date()): { code: string; hash: string; expiresAt: Date } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { code, hash: hashOtp(code, stepId), expiresAt: new Date(now.getTime() + OTP_TTL_MS) };
}

export type OtpCheck = "ok" | "wrong" | "expired" | "locked" | "missing";

export function checkOtp(i: { hash: string | null; expiresAt: Date | null; attempts: number; code: string; stepId: string; now: Date }): OtpCheck {
  if (!i.hash || !i.expiresAt) return "missing";
  if (i.attempts >= OTP_MAX_ATTEMPTS) return "locked";
  if (i.expiresAt < i.now) return "expired";
  const a = Buffer.from(hashOtp(i.code, i.stepId), "hex");
  const b = Buffer.from(i.hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "wrong";
}

const sign = (secret: string, stepId: string, expires: number) => createHmac("sha256", secret).update(`otp:${stepId}:${expires}`).digest("hex");

/** Cookie proving this browser passed the OTP for this step: `${expires}.${hmac}`. */
export function otpCookieValue(secret: string, stepId: string, expiresAtMs: number): string {
  return `${expiresAtMs}.${sign(secret, stepId, expiresAtMs)}`;
}

export function verifyOtpCookie(secret: string, stepId: string, value: string | undefined, nowMs = Date.now()): boolean {
  if (!secret || !value) return false;
  const dot = value.indexOf(".");
  const exp = Number(value.slice(0, dot));
  if (dot < 1 || !Number.isFinite(exp) || exp <= nowMs) return false;
  const expected = Buffer.from(sign(secret, stepId, exp), "hex");
  const got = Buffer.from(value.slice(dot + 1), "hex");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export const otpCookieName = (stepId: string) => `otp_${stepId.slice(0, 8)}`;

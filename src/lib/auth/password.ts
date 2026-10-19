/** Password hashing for demo/test users (scrypt, node crypto). Google users have no password. */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored || !password) return false;
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Demo users live on a reserved domain: nothing is ever sent to it (see `isDemoAddress`). */
export const DEMO_DOMAIN = "demo.test";

export function isDemoAddress(email: string): boolean {
  return /@[^@]*\.(test|invalid|example)$/i.test(email.trim()) || /@example\.(com|org|net)$/i.test(email.trim());
}

export function validDemoPassword(p: string): boolean {
  return p.length >= 6;
}

/** User name for password sign-in (no e-mail needed): 3–30 latin letters, digits, dot, dash, underscore. */
export function normalizeLogin(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(s) ? s : null;
}

/** Passwords of real (non-demo) users: at least 9 characters with a letter and a digit. */
export function validUserPassword(p: string): boolean {
  return p.length >= 9 && /[A-Za-z\u0590-\u05FF]/.test(p) && /\d/.test(p);
}

/** The stored address of a user created without e-mail (never mailed: see isPlaceholderEmail). */
export const placeholderEmail = (login: string) => `${login}@users.invalid`;

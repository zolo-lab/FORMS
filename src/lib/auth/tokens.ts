/** Personal one-time signing links: 32 random bytes, only the sha256 is stored. Server-side only. */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function verifyToken(hash: string, token: string): boolean {
  if (!token || hash.length !== 64) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

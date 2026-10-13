/** API keys (pure helpers): `fk_` + 32 random bytes; only the sha256 is stored. */
import { createHash, randomBytes } from "node:crypto";

export const API_KEY_PREFIX = "fk_";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): { key: string; hash: string; hint: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashApiKey(key), hint: `${key.slice(0, 7)}…${key.slice(-4)}` };
}

/** "Bearer fk_…" → the key, or null when the header is missing/malformed. */
export function bearerKey(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(fk_[A-Za-z0-9_-]{43})$/.exec(header?.trim() ?? "");
  return m ? m[1]! : null;
}

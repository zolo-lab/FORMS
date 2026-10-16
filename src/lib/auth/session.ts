/**
 * Temporary admin session (until Google OAuth in phase 6).
 * Cookie value = `${expiresAtMs}.${hmacSha256Hex(secret, expiresAtMs)}`.
 * Uses Web Crypto only, so it runs in both proxy (edge) and node runtimes.
 */
export const SESSION_COOKIE = "gybs_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function createSessionToken(secret: string, now = Date.now()): Promise<string> {
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const expires = String(now + SESSION_TTL_MS);
  return `${expires}.${await hmacHex(secret, expires)}`;
}

/** Session of a signed-in Google user: `${expiresAtMs}.${base64url(email)}.${hmac(expires.email)}`. */
export async function createUserSessionToken(secret: string, email: string, now = Date.now()): Promise<string> {
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const expires = String(now + SESSION_TTL_MS);
  const e = Buffer.from(email.toLowerCase(), "utf8").toString("base64url");
  return `${expires}.${e}.${await hmacHex(secret, `${expires}.${e}`)}`;
}

type Parsed = { ok: boolean; email: string | null };

async function parseToken(secret: string, token: string | undefined, now: number): Promise<Parsed> {
  const no: Parsed = { ok: false, email: null };
  if (!secret || !token) return no;
  const parts = token.split(".");
  if (parts.length === 2) {
    const [expires, sig] = parts as [string, string];
    if (!/^\d+$/.test(expires) || Number(expires) <= now) return no;
    return { ok: safeEqual(sig, await hmacHex(secret, expires)), email: null };
  }
  if (parts.length === 3) {
    const [expires, e, sig] = parts as [string, string, string];
    if (!/^\d+$/.test(expires) || Number(expires) <= now) return no;
    if (!safeEqual(sig, await hmacHex(secret, `${expires}.${e}`))) return no;
    return { ok: true, email: Buffer.from(e, "base64url").toString("utf8") };
  }
  return no;
}

/** Valid password session or valid Google session. */
export async function verifySessionToken(secret: string, token: string | undefined, now = Date.now()): Promise<boolean> {
  return (await parseToken(secret, token, now)).ok;
}

/** The signed-in Google user's e-mail, or null (no session, or the shared password session). */
export async function sessionEmail(secret: string, token: string | undefined, now = Date.now()): Promise<string | null> {
  const p = await parseToken(secret, token, now);
  return p.ok ? p.email : null;
}

export async function checkAdminPassword(input: string, expected: string | undefined): Promise<boolean> {
  if (!expected || !input) return false;
  return safeEqual(input, expected);
}

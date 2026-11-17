/** Officer session. Cookie = `${expiresAtMs}.${hmac}`. Web Crypto, so the proxy and route handlers can both check it. */
export const SESSION_COOKIE = "miluim_session";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

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

export async function verifySessionToken(secret: string, token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expires, sig] = parts;
  if (!expires || !sig || !/^\d+$/.test(expires) || Number(expires) <= now) return false;
  return safeEqual(sig, await hmacHex(secret, expires));
}

export function newSigningToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export function checkPasscode(input: string, expected: string | undefined): boolean {
  if (!expected || !input) return false;
  return safeEqual(input, expected);
}

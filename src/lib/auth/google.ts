/**
 * Google sign-in (OpenID Connect, authorization-code flow). Pure helpers, so they are unit tested; the routes under
 * /api/auth/google do the network calls. The id_token comes straight from Google's token endpoint over TLS, so its
 * claims are checked here but its signature need not be (OIDC Core 3.1.3.7).
 */
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const OAUTH_COOKIE = "gybs_oauth";
export const OAUTH_COOKIE_TTL_S = 10 * 60;

export const googleConfigured = (env: Record<string, string | undefined> = process.env) => !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;

export function buildAuthUrl(p: { clientId: string; redirectUri: string; state: string; nonce: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: p.state,
    nonce: p.nonce,
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${q}`;
}

/** Comma/space/newline separated list → lower-case, trimmed, no empties. */
export function parseEmailList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** An exact address, or a whole domain written as `@example.org`. */
export function isAllowedEmail(email: string, allowed: string[]): boolean {
  const e = email.trim().toLowerCase();
  if (!e.includes("@")) return false;
  return allowed.some((a) => (a.startsWith("@") ? e.endsWith(a) : e === a));
}

export function decodeJwtPayload(jwt: string): unknown {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export type ClaimsResult = { ok: true; email: string; name: string } | { ok: false; reason: string };

export function checkIdTokenClaims(claims: unknown, o: { clientId: string; nonce: string; now?: number }): ClaimsResult {
  if (!claims || typeof claims !== "object") return { ok: false, reason: "bad_token" };
  const c = claims as Record<string, unknown>;
  const now = Math.floor((o.now ?? Date.now()) / 1000);
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") return { ok: false, reason: "bad_issuer" };
  if (c.aud !== o.clientId) return { ok: false, reason: "bad_audience" };
  if (typeof c.exp !== "number" || c.exp <= now) return { ok: false, reason: "expired" };
  if (c.nonce !== o.nonce) return { ok: false, reason: "bad_nonce" };
  if (typeof c.email !== "string" || !c.email) return { ok: false, reason: "no_email" };
  if (c.email_verified !== true) return { ok: false, reason: "email_not_verified" };
  return { ok: true, email: c.email.toLowerCase(), name: typeof c.name === "string" ? c.name : "" };
}

/** Only same-site paths are followed after login. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/admin/forms";
}

export const LOGIN_ERRORS: Record<string, string> = {
  not_allowed: "החשבון הזה לא מורשה להיכנס למערכת. פנו למנהל המערכת.",
  failed: "ההתחברות עם Google נכשלה. נסו שוב.",
  not_configured: "ההתחברות עם Google לא הוגדרה בשרת.",
};

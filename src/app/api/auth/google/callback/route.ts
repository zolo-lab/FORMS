import { NextResponse } from "next/server";
import {
  GOOGLE_TOKEN_URL,
  OAUTH_COOKIE,
  checkIdTokenClaims,
  decodeJwtPayload,
  googleConfigured,
  isAllowedEmail,
  parseEmailList,
  safeNext,
} from "@/lib/auth/google";
import { SESSION_COOKIE, SESSION_TTL_MS, createUserSessionToken } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (code: string) => {
    const r = NextResponse.redirect(new URL(`/login?error=${code}`, url));
    r.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth/google" });
    return r;
  };
  const secret = process.env.SESSION_SECRET;
  if (!googleConfigured() || !secret) return fail("not_configured");

  let saved: { state?: string; nonce?: string; next?: string } = {};
  try {
    const raw = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${OAUTH_COOKIE}=`));
    saved = JSON.parse(decodeURIComponent(raw?.slice(OAUTH_COOKIE.length + 1) ?? "{}"));
  } catch {
    return fail("failed");
  }
  const code = url.searchParams.get("code");
  if (!code || !saved.state || !saved.nonce || url.searchParams.get("state") !== saved.state) return fail("failed");

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${url.origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return fail("failed");
    const { id_token } = (await tokenRes.json()) as { id_token?: string };
    if (!id_token) return fail("failed");
    const claims = checkIdTokenClaims(decodeJwtPayload(id_token), { clientId: process.env.GOOGLE_CLIENT_ID!, nonce: saved.nonce });
    if (!claims.ok) return fail("failed");
    if (!isAllowedEmail(claims.email, parseEmailList(process.env.ADMIN_EMAILS))) return fail("not_allowed");

    const res = NextResponse.redirect(new URL(safeNext(saved.next), url));
    res.cookies.set(SESSION_COOKIE, await createUserSessionToken(secret, claims.email), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth/google" });
    return res;
  } catch (e) {
    console.error("google login failed", e instanceof Error ? e.message : e);
    return fail("failed");
  }
}

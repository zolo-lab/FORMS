import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { OAUTH_COOKIE, OAUTH_COOKIE_TTL_S, buildAuthUrl, googleConfigured, safeNext } from "@/lib/auth/google";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!googleConfigured()) return NextResponse.redirect(new URL("/login?error=not_configured", url));
  const state = randomBytes(16).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const next = safeNext(url.searchParams.get("next"));
  const res = NextResponse.redirect(
    buildAuthUrl({ clientId: process.env.GOOGLE_CLIENT_ID!, redirectUri: `${url.origin}/api/auth/google/callback`, state, nonce }),
  );
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, nonce, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: OAUTH_COOKIE_TTL_S,
  });
  return res;
}

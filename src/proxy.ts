import { NextResponse, type NextRequest } from "next/server";
import { authDisabled } from "@/lib/auth/open-mode";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/** Protects /admin/** and /preview/** with the temporary admin session cookie. */
export async function proxy(req: NextRequest) {
  if (authDisabled()) return NextResponse.next();
  const ok = await verifySessionToken(process.env.SESSION_SECRET ?? "", req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin/:path*", "/preview/:path*", "/api/admin/:path*"] };

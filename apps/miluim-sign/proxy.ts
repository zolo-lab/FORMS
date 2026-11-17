import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

const PUBLIC = [/^\/login$/, /^\/api\/login$/, /^\/s\//, /^\/api\/s\//];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ok = await verifySessionToken(process.env.SESSION_SECRET ?? "", req.cookies.get(SESSION_COOKIE)?.value);
  if (pathname === "/login" && ok) {
    const next = req.nextUrl.searchParams.get("next") || "/";
    return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", req.url));
  }
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "נדרשת כניסה" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest).*)"],
};

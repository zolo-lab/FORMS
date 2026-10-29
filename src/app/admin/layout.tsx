import Link from "next/link";
import { logout } from "../login/actions";
import { AdminNav } from "@/components/admin/AdminNav";
import { Button } from "@/components/ui/button";
import { authDisabled } from "@/lib/auth/open-mode";
import { canTrack, isAdmin, hasGrant, isTrackOnly } from "@/lib/auth/permissions";
import { currentUser } from "@/server/users-store";
import { queryRequests } from "@/server/dashboard-store";
import { cookies } from "next/headers";
import { RETURN_COOKIE } from "@/lib/auth/session";
import { stopImpersonatingAction } from "./settings/users/actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const admin = isAdmin(user);
  const builds = hasGrant(user, "manageForms");
  const tracker = isTrackOnly(user);
  const tracks = canTrack(user);
  let pending = 0;
  if (user) {
    try { pending = (await queryRequests({ assigneeEmail: user.email, page: 1 }, new Date(), 1)).total; } catch { pending = 0; }
  }
  const acting = !!(await cookies()).get(RETURN_COOKIE);
  return (
    <div className="min-h-dvh">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-card px-4 py-2">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">דילוג לתוכן</a>
        <Link href={tracker ? "/admin/track" : builds ? "/admin/requests" : "/admin/inbox"} className="shrink-0 font-bold">מערכת הטפסים</Link>
        <AdminNav
          items={tracker ? [{ href: "/admin/track", label: "מעקב חתימות" }] : [
            { href: "/admin/inbox", label: "לטיפולי", badge: pending },
            { href: "/admin/requests", label: "בקשות" },
            ...(tracks ? [{ href: "/admin/track", label: "מעקב" }] : []),
            { href: "/admin/employees", label: "עובדים" },
            { href: "/admin/campaigns", label: "קמפיינים" },
            ...(builds ? [{ href: "/admin/forms", label: "תבניות טפסים" }] : []),
            { href: "/admin/archive", label: "נתונים וייצוא", also: ["/admin/settings/exports"] },
          ]}
          settings={admin ? [
            { title: "ארגון", items: [
              { href: "/admin/settings/organizations", label: "עמותות ועסקים" },
              { href: "/admin/settings/people", label: "משתמשים לשלבים" },
              { href: "/admin/settings/users", label: "משתמשים והרשאות" },
            ] },
            { title: "חיבורים", items: [
              { href: "/admin/settings/webhooks", label: "Webhooks" },
              { href: "/admin/settings/api-keys", label: "מפתחות API" },
            ] },
          ] : []}
        />
        {authDisabled() ? (
          <span className="ms-auto shrink-0 rounded-md bg-warning/15 px-2 py-1 text-xs">מצב פתוח: ללא סיסמה (זמני)</span>
        ) : (
          <form action={logout} className="ms-auto flex shrink-0 items-center gap-2">
            {user && <span className="hidden text-xs text-muted-foreground sm:inline">{user.name}</span>}
            <Button variant="ghost" size="sm" type="submit">יציאה</Button>
          </form>
        )}
      </header>
      {acting && user && (
        <div className="flex flex-wrap items-center gap-3 border-b bg-warning/15 px-4 py-1.5 text-sm" role="status">
          <span>מחובר/ת כ-{user.name} ({user.email})</span>
          <form action={stopImpersonatingAction}>
            <Button type="submit" variant="outline" size="sm">חזרה למנהל</Button>
          </form>
        </div>
      )}
      <div id="main" tabIndex={-1} className="outline-none">{children}</div>
    </div>
  );
}

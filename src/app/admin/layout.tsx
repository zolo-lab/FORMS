import Link from "next/link";
import { logout } from "../login/actions";
import { AdminNav } from "@/components/admin/AdminNav";
import { SubmitButton } from "@/components/ui/submit-button";
import { authDisabled } from "@/lib/auth/open-mode";
import { devLoginEnabled } from "@/lib/auth/dev-login";
import { hasGrant, isAdmin, isTrackOnly } from "@/lib/auth/permissions";
import { currentUser, viewerFormAccess } from "@/server/users-store";
import { queryRequests } from "@/server/dashboard-store";
import { cookies } from "next/headers";
import { RETURN_COOKIE } from "@/lib/auth/session";
import { stopImpersonatingAction } from "./settings/users/actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const admin = isAdmin(user);
  const forms = await viewerFormAccess();
  const builds = forms.allowed;
  const tracker = isTrackOnly(user);
  let pending = 0;
  if (user) {
    try { pending = (await queryRequests({ assigneeEmail: user.email, page: 1 }, new Date(), 1)).total; } catch { pending = 0; }
  }
  const acting = !!(await cookies()).get(RETURN_COOKIE);
  return (
    <div className="min-h-dvh">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-card px-4 py-2">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">דילוג לתוכן</a>
        <Link href={tracker ? "/admin/track" : builds ? "/admin/requests" : "/admin/inbox"} className="inline-flex min-h-11 shrink-0 items-center font-bold">מערכת הטפסים</Link>
        <AdminNav
          items={tracker ? [{ href: "/admin/track", label: "מעקב חתימות" }] : [
            { href: "/admin/inbox", label: "לטיפולי", badge: pending },
            { href: "/admin/requests", label: "היסטוריית טפסים" },
            { href: "/admin/campaigns", label: "קמפיינים" },
            ...(builds ? [{ href: "/admin/forms", label: "תבניות טפסים" }] : []),
            ...(admin ? [{ href: "/admin/users", label: "משתמשים" }] : []),
            // The identifying fields (and the lists built on them): whoever has the grant.
            ...(hasGrant(user, "manageFields") ? [{ href: "/admin/fields", label: "שדות מזהים" }] : []),
            { href: "/admin/archive", label: "נתונים וייצוא", also: ["/admin/settings/exports"] },
          ]}
          settings={[
            // Everyone has their own notification settings, admin or not.
            { title: "אישי", items: [{ href: "/admin/notifications", label: "ההתראות שלי" }] },
            ...(admin ? [
            { title: "ארגון", items: [
              { href: "/admin/settings/organizations", label: "עמותות ועסקים" },
            ] },
            { title: "חיבורים", items: [
              { href: "/admin/settings/webhooks", label: "Webhooks" },
              { href: "/admin/settings/api-keys", label: "מפתחות API" },
            ] },
            { title: "בדיקות", items: [
              { href: "/admin/mail", label: "מרכז מיילים" },
              ...(devLoginEnabled() ? [{ href: "/dev-login", label: "כניסה כמשתמש לבדיקה" }] : []),
            ] },
            ] : []),
          ]}
        />
        {authDisabled() ? (
          <span className="ms-auto flex shrink-0 items-center gap-2">
            <span className="rounded-md bg-warning/15 px-2 py-1 text-xs">מצב פתוח: ללא סיסמה (זמני)</span>
            <Link href="/dev-login" className="inline-flex min-h-11 items-center text-xs underline underline-offset-2">החלפת משתמש</Link>
          </span>
        ) : (
          <form action={logout} className="ms-auto flex shrink-0 items-center gap-2">
            {user && <span className="hidden text-xs text-muted-foreground sm:inline">{user.name}</span>}
            <SubmitButton variant="ghost" size="sm">יציאה</SubmitButton>
          </form>
        )}
      </header>
      {acting && user && (
        <div className="flex flex-wrap items-center gap-3 border-b bg-warning/15 px-4 py-1.5 text-sm" role="status">
          <span>מחובר/ת כ-{user.name} ({user.email})</span>
          {devLoginEnabled() && <Link href="/dev-login" className="inline-flex min-h-11 items-center underline underline-offset-2">החלפת משתמש</Link>}
          <form action={stopImpersonatingAction}>
            <SubmitButton variant="outline" size="sm">חזרה למנהל</SubmitButton>
          </form>
        </div>
      )}
      <div id="main" tabIndex={-1} className="outline-none">{children}</div>
    </div>
  );
}

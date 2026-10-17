import Link from "next/link";
import { logout } from "../login/actions";
import { Button } from "@/components/ui/button";
import { authDisabled } from "@/lib/auth/open-mode";
import { isAdmin, hasGrant } from "@/lib/auth/permissions";
import { currentUser } from "@/server/users-store";
import { cookies } from "next/headers";
import { RETURN_COOKIE } from "@/lib/auth/session";
import { stopImpersonatingAction } from "./settings/users/actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const admin = isAdmin(user);
  const builds = hasGrant(user, "manageForms");
  const acting = !!(await cookies()).get(RETURN_COOKIE);
  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-4 border-b bg-card px-4 py-2">
        <Link href={builds ? "/admin/forms" : "/admin/requests"} className="shrink-0 font-bold">טפסים וחתימות</Link>
        <nav className="flex min-w-0 gap-3 overflow-x-auto whitespace-nowrap text-sm text-muted-foreground">
          <Link href="/admin/requests" className="hover:text-foreground">בקשות</Link>
          <Link href="/admin/inbox" className="hover:text-foreground">ממתינים</Link>
          <Link href="/admin/archive" className="hover:text-foreground">ארכיון נתונים</Link>
          {builds && <Link href="/admin/forms" className="hover:text-foreground">טפסים</Link>}
          {builds && <Link href="/admin/packages" className="hover:text-foreground">ערכות</Link>}
          {admin && <Link href="/admin/settings/organizations" className="hover:text-foreground">עמותות ועסקים</Link>}
          {admin && <Link href="/admin/settings/people" className="hover:text-foreground">אנשי קשר</Link>}
          {admin && <Link href="/admin/settings/exports" className="hover:text-foreground">תבניות ייצוא</Link>}
          {admin && <Link href="/admin/settings/webhooks" className="hover:text-foreground">Webhooks</Link>}
          {admin && <Link href="/admin/settings/api-keys" className="hover:text-foreground">API</Link>}
          {admin && <Link href="/admin/settings/users" className="hover:text-foreground">משתמשים</Link>}
        </nav>
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
      {children}
    </div>
  );
}

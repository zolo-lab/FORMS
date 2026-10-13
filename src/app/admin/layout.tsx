import Link from "next/link";
import { logout } from "../login/actions";
import { Button } from "@/components/ui/button";
import { authDisabled } from "@/lib/auth/open-mode";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-4 border-b bg-card px-4 py-2">
        <Link href="/admin/forms" className="shrink-0 font-bold">טפסים וחתימות</Link>
        <nav className="flex min-w-0 gap-3 overflow-x-auto whitespace-nowrap text-sm text-muted-foreground">
          <Link href="/admin/requests" className="hover:text-foreground">בקשות</Link>
          <Link href="/admin/inbox" className="hover:text-foreground">ממתינים</Link>
          <Link href="/admin/forms" className="hover:text-foreground">טפסים</Link>
          <Link href="/admin/packages" className="hover:text-foreground">ערכות</Link>
          <Link href="/admin/settings/organizations" className="hover:text-foreground">ארגונים</Link>
          <Link href="/admin/settings/webhooks" className="hover:text-foreground">Webhooks</Link>
          <Link href="/admin/settings/api-keys" className="hover:text-foreground">API</Link>
        </nav>
        {authDisabled() ? (
          <span className="ms-auto shrink-0 rounded-md bg-warning/15 px-2 py-1 text-xs">מצב פתוח: ללא סיסמה (זמני)</span>
        ) : (
          <form action={logout} className="ms-auto shrink-0">
            <Button variant="ghost" size="sm" type="submit">יציאה</Button>
          </form>
        )}
      </header>
      {children}
    </div>
  );
}

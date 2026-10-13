import Link from "next/link";
import { logout } from "../login/actions";
import { Button } from "@/components/ui/button";
import { authDisabled } from "@/lib/auth/open-mode";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-4 border-b bg-card px-4 py-2">
        <Link href="/admin/forms" className="font-bold">טפסים וחתימות</Link>
        <nav className="flex gap-3 text-sm text-muted-foreground">
          <Link href="/admin/requests" className="hover:text-foreground">בקשות</Link>
          <Link href="/admin/inbox" className="hover:text-foreground">ממתינים</Link>
          <Link href="/admin/forms" className="hover:text-foreground">טפסים</Link>
          <Link href="/admin/packages" className="hover:text-foreground">ערכות</Link>
          <Link href="/admin/settings/organizations" className="hover:text-foreground">ארגונים</Link>
        </nav>
        {authDisabled() ? (
          <span className="ms-auto rounded-md bg-warning/15 px-2 py-1 text-xs">מצב פתוח: ללא סיסמה (זמני)</span>
        ) : (
          <form action={logout} className="ms-auto">
            <Button variant="ghost" size="sm" type="submit">יציאה</Button>
          </form>
        )}
      </header>
      {children}
    </div>
  );
}

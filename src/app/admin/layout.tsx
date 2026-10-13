import Link from "next/link";
import { logout } from "../login/actions";
import { Button } from "@/components/ui/button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-4 border-b bg-card px-4 py-2">
        <Link href="/admin/forms" className="font-bold">טפסים וחתימות</Link>
        <nav className="flex gap-3 text-sm text-muted-foreground">
          <Link href="/admin/forms" className="hover:text-foreground">טפסים</Link>
        </nav>
        <form action={logout} className="ms-auto">
          <Button variant="ghost" size="sm" type="submit">יציאה</Button>
        </form>
      </header>
      {children}
    </div>
  );
}

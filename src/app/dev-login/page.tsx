import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authDisabled } from "@/lib/auth/open-mode";
import { DEV_LOGIN_GROUP_LABELS, devLoginAllows, devLoginEnabled, devLoginGroup, type DevLoginGroup } from "@/lib/auth/dev-login";
import { devLoginAction, devLoginAsManagerAction } from "./actions";

export const dynamic = "force-dynamic";

const ORDER: DevLoginGroup[] = ["admin", "manager", "track"];

/** "כניסה כמשתמש לבדיקה": every user is one click away, grouped by what they do (test environment only). */
export default async function DevLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!devLoginEnabled()) redirect("/login");
  const { error } = await searchParams;
  const users = (await db.select().from(schema.users).orderBy(asc(schema.users.name))).filter((u) => devLoginAllows(u));
  const open = authDisabled();
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">כניסה כמשתמש לבדיקה</h1>
        <p className="text-sm text-muted-foreground">סביבת בדיקה בלבד, בלי סיסמה. בחרו מי אתם עכשיו כדי לעבור על שרשרת החתימות מהצד שלו. בכל רגע אפשר לחזור לכאן מ&quot;החלפת משתמש&quot; בראש המסך.</p>
      </header>
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">אי אפשר להיכנס כמשתמש הזה.</p>}

      {open && (
        <section className="space-y-2" aria-labelledby="g-system">
          <h2 id="g-system" className="text-sm font-medium text-muted-foreground">מנהל המערכת</h2>
          <form action={devLoginAsManagerAction}>
            <Card className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
              <span className="font-medium">מנהל המערכת (בלי משתמש)</span>
              <Button type="submit" variant="outline" size="sm">כניסה</Button>
            </Card>
          </form>
        </section>
      )}

      {ORDER.map((g) => {
        const list = users.filter((u) => devLoginGroup(u) === g);
        if (!list.length) return null;
        return (
          <section key={g} className="space-y-2" aria-labelledby={`g-${g}`}>
            <h2 id={`g-${g}`} className="text-sm font-medium text-muted-foreground">{DEV_LOGIN_GROUP_LABELS[g]}</h2>
            <ul className="space-y-2">
              {list.map((u) => (
                <li key={u.id}>
                  <form action={devLoginAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <Card className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{u.name}</span>
                        <bdi dir="ltr" className="block truncate text-xs text-muted-foreground">{u.login ?? u.email}</bdi>
                      </span>
                      <Button type="submit" variant="outline" size="sm" aria-label={`כניסה בתור ${u.name}`}>כניסה</Button>
                    </Card>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {users.length === 0 && <Card className="p-4 text-sm text-muted-foreground">אין עדיין משתמשים. מוסיפים אותם במסך המשתמשים.</Card>}
    </main>
  );
}

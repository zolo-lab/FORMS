import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS, isAdmin, type UserRole } from "@/lib/auth/permissions";
import { listPackages } from "@/server/dashboard-store";
import { currentUser, listAllPermissions, listUsers } from "@/server/users-store";
import { savePermissionsAction, updateUserAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = { input: "קלט לא תקין", self: "אי אפשר להסיר מעצמך את הרשאת המנהל" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; u?: string }> }) {
  const { error, saved, u } = await searchParams;
  const me = await currentUser();
  if (!isAdmin(me)) redirect("/admin/forms");
  const [users, perms, packages] = await Promise.all([listUsers(), listAllPermissions(), listPackages()]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">משתמשים והרשאות</h1>
        <p className="text-sm text-muted-foreground">
          משתמש נוצר אוטומטית בכניסה הראשונה עם Google (רק כתובות שמותרות ב-ADMIN_EMAILS). מנהל/ת מערכת רואה הכול. משתמש רגיל רואה את הבקשות
          שפתח ואת אלה שהוא שלב בהן, ויכול לפתוח בקשות רק מהערכות שסומנו לו כאן.
        </p>
      </header>
      {error && ERRORS[error] && <p role="alert" className="text-sm text-destructive">{ERRORS[error]}</p>}
      {saved && <p role="status" className="text-sm text-success">נשמר.</p>}

      {users.length === 0 && <Card className="p-4 text-sm text-muted-foreground">עדיין אין משתמשים. המשתמש הראשון שייכנס עם Google יהיה מנהל/ת המערכת.</Card>}

      {users.map((user) => {
        const mine = perms.filter((p) => p.userId === user.id);
        return (
          <Card key={user.id} className="space-y-4 p-4" id={`u-${user.id}`}>
            <form action={updateUserAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={user.id} />
              <div className="min-w-0 grow">
                <div className="font-medium">{user.name}</div>
                <div className="text-sm text-muted-foreground" dir="ltr">{user.email}</div>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`role-${user.id}`}>תפקיד</Label>
                <Select id={`role-${user.id}`} name="role" defaultValue={user.role}>
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="active" defaultChecked={user.active} /> פעיל/ה
              </label>
              <Button type="submit" variant="outline" size="sm">שמירה</Button>
            </form>

            {user.role !== "admin" && (
              <form action={savePermissionsAction} className="space-y-2">
                <input type="hidden" name="userId" value={user.id} />
                <p className="text-sm font-medium">הרשאות לפי ערכה</p>
                {packages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין ערכות עדיין.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-start text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-1 text-start font-medium">ערכה</th>
                        <th scope="col" className="py-1 text-start font-medium">פתיחת בקשות</th>
                        <th scope="col" className="py-1 text-start font-medium">רואה את כל הבקשות</th>
                        <th scope="col" className="py-1 text-start font-medium">עריכת שרשרת</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {packages.map((p) => {
                        const row = mine.find((m) => m.packageTemplateId === p.id);
                        return (
                          <tr key={p.id}>
                            <td className="py-1.5">
                              <input type="hidden" name="packages" value={p.id} />
                              {p.name}
                            </td>
                            <td className="py-1.5"><Checkbox name={`${p.id}.open`} defaultChecked={row?.canOpen ?? false} aria-label={`פתיחת בקשות – ${p.name}`} /></td>
                            <td className="py-1.5"><Checkbox name={`${p.id}.view`} defaultChecked={row?.canViewAll ?? false} aria-label={`רואה את כל הבקשות – ${p.name}`} /></td>
                            <td className="py-1.5"><Checkbox name={`${p.id}.chain`} defaultChecked={row?.canEditChain ?? false} aria-label={`עריכת שרשרת – ${p.name}`} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <Button type="submit" size="sm">{u === user.id && saved ? "נשמר ✓" : "שמירת הרשאות"}</Button>
              </form>
            )}
          </Card>
        );
      })}
    </main>
  );
}

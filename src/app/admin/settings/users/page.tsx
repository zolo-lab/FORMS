import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GRANT_KEYS, GRANT_LABELS, ROLE_LABELS, isAdmin, normalizeGrants, normalizeRole, type UserRole } from "@/lib/auth/permissions";
import { listOrganizations } from "@/server/requests-store";
import { listProjects } from "@/server/orgs-store";
import { listPackages } from "@/server/dashboard-store";
import { currentUser, listAllOrgAccess, listAllPermissions, listAllProjectAccess, listUsers } from "@/server/users-store";
import { isDemoAddress } from "@/lib/auth/password";
import { Input } from "@/components/ui/input";
import { createDemoUserAction, createPasswordUserAction, impersonateAction, savePermissionsAction, setPasswordAction, updateUserAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = { input: "קלט לא תקין", self: "אי אפשר להסיר מעצמך את הרשאת המנהל", demo: "משתמש הדגמה: מייל בדומיין שמור (למשל ruth@demo.test), שם, וסיסמה (אם יש) של 6 תווים לפחות", exists: "כבר קיים משתמש עם המייל או שם המשתמש הזה", user: "משתמש עם סיסמה: שם, שם משתמש באנגלית (3–30 תווים: אותיות, ספרות, נקודה, מקף), וסיסמה של 9 תווים לפחות עם אות וספרה", orgs: "בחרת \"רק עמותות / עסקים מסוימים\" בלי לסמן אף אחד" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; u?: string }> }) {
  const { error, saved, u } = await searchParams;
  const me = await currentUser();
  if (!isAdmin(me)) redirect("/admin/forms");
  const [users, perms, packages, orgs, orgAccess, projectAccess, projects] = await Promise.all([listUsers(), listAllPermissions(), listPackages(), listOrganizations(), listAllOrgAccess(), listAllProjectAccess(), listProjects()]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">משתמשים והרשאות</h1>
        <p className="text-sm text-muted-foreground">
          שני תפקידים: אדמין רואה ומנהל הכול. מנהל רואה את הבקשות שפתח ואת אלה שהוא שלב בהן, פותח בקשות רק מהערכות שסומנו לו,
          ואפשר להגביל אותו לחלק מהעמותות והעסקים. משתמש נוצר אוטומטית בכניסה הראשונה עם Google (רק כתובות שמותרות ב-ADMIN_EMAILS).
        </p>
      </header>
      {error && ERRORS[error] && <p role="alert" className="text-sm text-destructive">{ERRORS[error]}</p>}
      {saved && <p role="status" className="text-sm text-success">נשמר.</p>}

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">משתמש עם שם משתמש וסיסמה</h2>
        <p className="text-sm text-muted-foreground">למשל חשבון משותף &quot;מזכירות ת&quot;ת&quot;. המייל לא חובה: בלי מייל המשתמש נכנס עם שם המשתמש, ולא נשלחים אליו מיילים. לחשבון מעקב סמנו אחר כך &quot;מעקב בלבד&quot; בהרשאות.</p>
        <form action={createPasswordUserAction} className="grid gap-3 sm:grid-cols-6 sm:items-end">
          <div className="space-y-1"><Label htmlFor="p-name">שם</Label><Input id="p-name" name="name" required /></div>
          <div className="space-y-1"><Label htmlFor="p-login">שם משתמש</Label><Input id="p-login" name="login" dir="ltr" autoComplete="off" placeholder="mazkirut-tt" required pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,29}" /></div>
          <div className="space-y-1"><Label htmlFor="p-email">מייל (לא חובה)</Label><Input id="p-email" name="email" type="email" dir="ltr" /></div>
          <div className="space-y-1"><Label htmlFor="p-pass">סיסמה</Label><Input id="p-pass" name="password" type="text" dir="ltr" minLength={9} required autoComplete="new-password" /></div>
          <div className="space-y-1">
            <Label htmlFor="p-role">תפקיד</Label>
            <Select id="p-role" name="role" defaultValue="manager">
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </div>
          <Button type="submit">יצירה</Button>
        </form>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">משתמש הדגמה</h2>
        <p className="text-sm text-muted-foreground">משתמש עם מייל בדוי (@demo.test), להצגת התהליך. בלי סיסמה אפשר להיכנס רק עם המייל כשמשתנה הסביבה DEMO_LOGIN=1 מוגדר. הודעות אליו לא נשלחות בפועל.</p>
        <form action={createDemoUserAction} className="grid gap-3 sm:grid-cols-5 sm:items-end">
          <div className="space-y-1"><Label htmlFor="d-name">שם</Label><Input id="d-name" name="name" required /></div>
          <div className="space-y-1"><Label htmlFor="d-email">מייל</Label><Input id="d-email" name="email" type="email" dir="ltr" placeholder="ruth@demo.test" required /></div>
          <div className="space-y-1"><Label htmlFor="d-pass">סיסמה (לא חובה)</Label><Input id="d-pass" name="password" type="text" dir="ltr" minLength={6} /></div>
          <div className="space-y-1">
            <Label htmlFor="d-role">תפקיד</Label>
            <Select id="d-role" name="role" defaultValue="manager">
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </div>
          <Button type="submit">יצירה</Button>
        </form>
      </Card>

      {users.length === 0 && <Card className="p-4 text-sm text-muted-foreground">עדיין אין משתמשים. המשתמש הראשון שייכנס עם Google יהיה מנהל/ת המערכת.</Card>}

      {users.map((user) => {
        const mine = perms.filter((p) => p.userId === user.id);
        const myOrgs = orgAccess.filter((a) => a.userId === user.id).map((a) => a.organizationId);
        const myProjects = projectAccess.filter((a) => a.userId === user.id).map((a) => a.projectId);
        // An organization reached through single projects is ticked too; its projects show which ones.
        const tickedOrgs = new Set([...myOrgs, ...projects.filter((p) => myProjects.includes(p.id)).map((p) => p.organizationId)]);
        const limited = tickedOrgs.size > 0;
        const grants = normalizeGrants(user.grants);
        return (
          <Card key={user.id} className="space-y-4 p-4" id={`u-${user.id}`}>
            <form action={updateUserAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={user.id} />
              <div className="min-w-0 grow">
                <div className="font-medium">{user.name}</div>
                <div className="text-sm text-muted-foreground" dir="ltr">{user.login ? `${user.login}${user.email.endsWith("@users.invalid") ? "" : ` · ${user.email}`}` : user.email}</div>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`role-${user.id}`}>תפקיד</Label>
                <Select id={`role-${user.id}`} name="role" defaultValue={normalizeRole(user.role)}>
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

            <div className="flex flex-wrap items-end gap-3">
              {isDemoAddress(user.email) && (
                <form action={setPasswordAction} className="flex items-end gap-2">
                  <input type="hidden" name="id" value={user.id} />
                  <div className="space-y-1">
                    <Label htmlFor={`pw-${user.id}`}>סיסמה חדשה</Label>
                    <Input id={`pw-${user.id}`} name="password" type="text" dir="ltr" minLength={6} required />
                  </div>
                  <Button type="submit" variant="outline" size="sm">עדכון סיסמה</Button>
                </form>
              )}
              {user.id !== me?.id && user.active && (
                <form action={impersonateAction}>
                  <input type="hidden" name="id" value={user.id} />
                  <Button type="submit" variant="outline" size="sm">היכנס כמשתמש הזה</Button>
                </form>
              )}
            </div>

            {user.role !== "admin" && (
              <form action={savePermissionsAction} className="space-y-2">
                <input type="hidden" name="userId" value={user.id} />
                <fieldset className="space-y-1.5 pb-2">
                  <legend className="text-sm font-medium">הרשאות נוספות</legend>
                  <div className="grid gap-1.5 text-sm sm:grid-cols-2">
                    {GRANT_KEYS.map((k) => (
                      <label key={k} className="flex items-center gap-2">
                        <Checkbox name={`grant.${k}`} defaultChecked={grants[k]} /> {GRANT_LABELS[k]}
                      </label>
                    ))}
                  </div>
                </fieldset>
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
                <fieldset className="space-y-2 pt-2">
                  <legend className="text-sm font-medium">עמותות ועסקים</legend>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="orgScope" value="all" defaultChecked={!limited} className="size-4 accent-primary" /> כל העמותות והעסקים
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="orgScope" value="some" defaultChecked={limited} className="size-4 accent-primary" /> רק המסומנים
                    </label>
                  </div>
                  <div className="grid gap-1.5 text-sm sm:grid-cols-2">
                    {orgs.map((o) => (
                      <div key={o.id} className="space-y-1">
                      <label className="flex items-center gap-2">
                        <Checkbox name="orgs" value={o.id} defaultChecked={tickedOrgs.has(o.id)} aria-label={`עמותה / עסק – ${o.name}`} />
                        {o.name}{!o.active && <span className="text-muted-foreground"> (לא פעיל)</span>}
                      </label>
                      {projects.filter((p) => p.organizationId === o.id).length > 0 && (
                        <div className="ms-6 space-y-1 text-muted-foreground">
                          <p className="text-xs">פרויקטים (ללא סימון = כל הפרויקטים של העמותה)</p>
                          {projects.filter((p) => p.organizationId === o.id).map((p) => (
                            <label key={p.id} className="flex items-center gap-2">
                              <Checkbox name="projects" value={p.id} defaultChecked={myProjects.includes(p.id)} aria-label={`פרויקט – ${o.name} – ${p.name}`} />
                              {p.name}
                            </label>
                          ))}
                        </div>
                      )}
                      </div>
                    ))}
                  </div>
                </fieldset>
                <Button type="submit" size="sm">{u === user.id && saved ? "נשמר ✓" : "שמירת הרשאות"}</Button>
              </form>
            )}
          </Card>
        );
      })}
    </main>
  );
}

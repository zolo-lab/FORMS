import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GRANT_KEYS, GRANT_LABELS, isAdmin, normalizeGrants, normalizeRole } from "@/lib/auth/permissions";
import { listPackages } from "@/server/dashboard-store";
import { listProjects } from "@/server/orgs-store";
import { listOrganizations } from "@/server/requests-store";
import { getUser, userContacts } from "@/server/user-admin";
import { currentUser, listAllOrgAccess, listAllPermissions, listAllProjectAccess } from "@/server/users-store";
import { impersonateAction } from "@/app/admin/settings/users/actions";
import { saveUserAction } from "../actions";
import { RoleFields } from "./RoleFields";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  name: "יש להזין שם",
  email: "כתובת המייל לא תקינה",
  phone: "מספר הטלפון לא תקין",
  exists: "כבר יש משתמש עם המייל הזה",
  self: "אי אפשר להוריד מעצמך את סוג אדמין או להפוך את עצמך ללא פעיל",
  orgs: "בחרת \"רק המסומנים\" בלי לסמן אף עמותה או עסק",
  input: "קלט לא תקין",
};

export default async function UserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const me = await currentUser();
  if (!isAdmin(me)) redirect("/admin/inbox");
  const isNew = id === "new";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = isNew ? null : await getUser(id);
  if (!isNew && !user) notFound();

  const [packages, orgs, projects, perms, orgAccess, projectAccess, contacts] = await Promise.all([
    listPackages(), listOrganizations(), listProjects(), listAllPermissions(), listAllOrgAccess(), listAllProjectAccess(), user ? userContacts([user]) : Promise.resolve(new Map()),
  ]);
  const mine = perms.filter((p) => p.userId === id);
  const myOrgs = orgAccess.filter((a) => a.userId === id).map((a) => a.organizationId);
  const myProjects = projectAccess.filter((a) => a.userId === id).map((a) => a.projectId);
  const tickedOrgs = new Set([...myOrgs, ...projects.filter((p) => myProjects.includes(p.id)).map((p) => p.organizationId)]);
  const grants = normalizeGrants(user?.grants ?? {});
  const role = user ? normalizeRole(user.role) : "manager";
  const email = user && !user.email.endsWith("@users.invalid") ? user.email : "";

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <div className="space-y-1">
        <Link href="/admin/users" className="text-sm text-muted-foreground hover:text-foreground">→ כל המשתמשים</Link>
        <h1 className="text-2xl font-bold tracking-tight">{isNew ? "משתמש חדש" : user!.name}</h1>
      </div>
      {saved && <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">נשמר</p>}
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error] ?? ERRORS.input}</p>}

      <form action={saveUserAction} className="space-y-5">
        <input type="hidden" name="id" value={isNew ? "" : id} />
        <Card className="space-y-4 p-4 sm:p-6">
          <h2 className="text-lg font-semibold">פרטים</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="u-name">שם מלא <span className="text-destructive" aria-hidden>*</span></Label>
              <Input id="u-name" name="name" required autoComplete="off" defaultValue={user?.name ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="u-email">מייל <span className="text-destructive" aria-hidden>*</span></Label>
              <Input id="u-email" name="email" type="email" dir="ltr" required autoComplete="off" defaultValue={email} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="u-phone">טלפון נייד</Label>
              <Input id="u-phone" name="phone" type="tel" dir="ltr" inputMode="tel" defaultValue={contacts.get(id)?.phone ?? ""} />
            </div>
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <Checkbox name="active" defaultChecked={user?.active ?? true} />
            משתמש פעיל
          </label>
        </Card>

        <RoleFields initialRole={role}>
          <Card className="space-y-3 p-4 sm:p-6">
            <h2 className="text-lg font-semibold">הרשאות</h2>
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {GRANT_KEYS.map((k) => (
                <label key={k} className="flex min-h-10 items-center gap-2 text-sm">
                  <Checkbox name={`grant.${k}`} defaultChecked={grants[k]} /> {GRANT_LABELS[k]}
                </label>
              ))}
            </div>
          </Card>

          <Card className="space-y-3 p-4 sm:p-6">
            <h2 className="text-lg font-semibold">טפסים</h2>
            <p className="text-sm text-muted-foreground">אילו טפסים המנהל רשאי לשלוח, ובאילו הוא רואה את כל מה שנשלח (לא רק את מה ששלח או אישר).</p>
            {packages.length === 0 ? <p className="text-sm text-muted-foreground">אין טפסים עדיין.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th scope="col" className="py-2 text-start font-medium">טופס</th>
                      <th scope="col" className="w-28 py-2 text-center font-medium">שולח</th>
                      <th scope="col" className="w-28 py-2 text-center font-medium">רואה הכול</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {packages.map((p) => {
                      const row = mine.find((m) => m.packageTemplateId === p.id);
                      return (
                        <tr key={p.id}>
                          <td className="py-2"><input type="hidden" name="packages" value={p.id} />{p.name}</td>
                          <td className="py-2 text-center"><Checkbox name={`${p.id}.open`} defaultChecked={row?.canOpen ?? false} aria-label={`שולח – ${p.name}`} /></td>
                          <td className="py-2 text-center"><Checkbox name={`${p.id}.view`} defaultChecked={row?.canViewAll ?? false} aria-label={`רואה הכול – ${p.name}`} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="space-y-3 p-4 sm:p-6">
            <h2 className="text-lg font-semibold">עמותות ועסקים</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex min-h-10 items-center gap-2"><input type="radio" name="orgScope" value="all" defaultChecked={tickedOrgs.size === 0} className="size-4 accent-primary" /> כל העמותות והעסקים</label>
              <label className="flex min-h-10 items-center gap-2"><input type="radio" name="orgScope" value="some" defaultChecked={tickedOrgs.size > 0} className="size-4 accent-primary" /> רק המסומנים</label>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              {orgs.map((o) => {
                const own = projects.filter((p) => p.organizationId === o.id);
                return (
                  <div key={o.id} className="space-y-1">
                    <label className="flex min-h-10 items-center gap-2">
                      <Checkbox name="orgs" value={o.id} defaultChecked={tickedOrgs.has(o.id)} aria-label={`עמותה / עסק – ${o.name}`} />
                      {o.name}{!o.active && <span className="text-muted-foreground"> (לא פעיל)</span>}
                    </label>
                    {own.length > 0 && (
                      <div className="ms-6 space-y-1 text-muted-foreground">
                        <p className="text-xs">פרויקטים (בלי סימון = כל הפרויקטים)</p>
                        {own.map((p) => (
                          <label key={p.id} className="flex items-center gap-2">
                            <Checkbox name="projects" value={p.id} defaultChecked={myProjects.includes(p.id)} aria-label={`פרויקט – ${o.name} – ${p.name}`} />
                            {p.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </RoleFields>

        <div className="sticky bottom-0 -mx-4 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
          <Button type="submit">{isNew ? "יצירת המשתמש" : "שמירה"}</Button>
          <Link href="/admin/users" className="inline-flex h-10 items-center px-4 text-sm text-muted-foreground hover:text-foreground">ביטול</Link>
        </div>
      </form>

      {user && user.active && user.id !== me?.id && (
        <form action={impersonateAction} className="border-t pt-4">
          <input type="hidden" name="id" value={user.id} />
          <Button type="submit" variant="outline" size="sm">כניסה למערכת כמשתמש הזה</Button>
        </form>
      )}
    </main>
  );
}

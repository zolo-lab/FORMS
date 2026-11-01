import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { ROLE_LABELS, isAdmin, normalizeRole } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { listUserGroups, userContacts } from "@/server/user-admin";
import { currentUser, listUsers } from "@/server/users-store";
import { createUserGroupAction, updateUserGroupAction } from "./actions";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const shownEmail = (email: string) => (email.endsWith("@users.invalid") ? "—" : email);

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; role?: string; saved?: string; error?: string }> }) {
  const { tab, q = "", role = "", saved, error } = await searchParams;
  if (!isAdmin(await currentUser())) redirect("/admin/inbox");
  const all = await listUsers();
  const groupsTab = tab === "groups";

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <PageHeader
        title="משתמשים"
        description="אדמין: יכול לעשות הכול במערכת. מנהל: שולח טפסים ומאשר שלבים, לפי ההרשאות שהוגדרו לו. משתמשים וקבוצות אפשר לבחור בשלבי כל טופס."
        actions={!groupsTab && <Link href="/admin/users/new" className={buttonVariants()}><Plus className="size-4" aria-hidden />הוספת משתמש</Link>}
      />
      <nav aria-label="משתמשים" className="flex gap-1 border-b">
        {[{ href: "/admin/users", label: "משתמשים", on: !groupsTab }, { href: "/admin/users?tab=groups", label: "קבוצות מנהלים", on: groupsTab }].map((t) => (
          <Link key={t.href} href={t.href} aria-current={t.on ? "page" : undefined} className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium", t.on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {saved && <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">נשמר</p>}
      {error === "group" && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">יש לתת שם לקבוצה</p>}
      {groupsTab ? <Groups users={all} /> : <UserList users={all} q={q} role={role} />}
    </main>
  );
}

async function UserList({ users, q, role }: { users: Awaited<ReturnType<typeof listUsers>>; q: string; role: string }) {
  const contacts = await userContacts(users);
  const needle = q.trim().toLowerCase();
  const rows = users
    .filter((u) => !role || normalizeRole(u.role) === role)
    .filter((u) => !needle || `${u.name} ${u.email} ${contacts.get(u.id)?.phone ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "he"));
  return (
    <section className="space-y-3" aria-label="רשימת משתמשים">
      <form className="flex flex-wrap items-end gap-2" role="search">
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="u-q">חיפוש</Label>
          <Input id="u-q" name="q" defaultValue={q} placeholder="שם, מייל או טלפון" />
        </div>
        <div className="w-40 space-y-1">
          <Label htmlFor="u-role">סוג משתמש</Label>
          <Select id="u-role" name="role" defaultValue={role}>
            <option value="">הכול</option>
            <option value="admin">{ROLE_LABELS.admin}</option>
            <option value="manager">{ROLE_LABELS.manager}</option>
          </Select>
        </div>
        <Button type="submit" variant="outline">הצגה</Button>
      </form>
      <p className="text-sm text-muted-foreground">{rows.length} משתמשים</p>
      {rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">אין משתמשים להצגה.</Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y md:hidden">
            {rows.map((u) => (
              <li key={u.id}>
                <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 p-3 hover:bg-accent">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{u.name}</div>
                    <div className="truncate text-sm text-muted-foreground" dir="ltr">{shownEmail(u.email)}</div>
                  </div>
                  <Badge tone={normalizeRole(u.role) === "admin" ? "default" : "muted"}>{ROLE_LABELS[normalizeRole(u.role)]}</Badge>
                  {!u.active && <Badge tone="warning">לא פעיל</Badge>}
                </Link>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium">שם</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">סוג משתמש</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">מייל</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">טלפון</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">פעיל</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">עודכן</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">עריכה</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((u) => (
                <tr key={u.id} className={cn(!u.active && "text-muted-foreground")}>
                  <td className="px-3 py-2 font-medium">{u.name}</td>
                  <td className="px-3 py-2">{ROLE_LABELS[normalizeRole(u.role)]}</td>
                  <td className="px-3 py-2" dir="ltr">{shownEmail(u.email)}</td>
                  <td className="px-3 py-2" dir="ltr">{contacts.get(u.id)?.phone ?? ""}</td>
                  <td className="px-3 py-2">{u.active ? "כן" : "לא"}</td>
                  <td className="px-3 py-2">{fmt(u.updatedAt)}</td>
                  <td className="px-3 py-2 text-end">
                    <Link href={`/admin/users/${u.id}`} className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label={`עריכת ${u.name}`}><Pencil className="size-4" aria-hidden /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

async function Groups({ users }: { users: Awaited<ReturnType<typeof listUsers>> }) {
  const groups = await listUserGroups(users);
  const people = users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name, "he"));
  const memberPicker = (prefix: string, chosen: string[]) => (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">חברי הקבוצה</legend>
      {people.length === 0 ? <p className="text-sm text-muted-foreground">אין משתמשים פעילים.</p> : (
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((u) => (
            <label key={u.id} className="flex min-h-10 items-center gap-2 text-sm">
              <Checkbox name="members" value={u.id} defaultChecked={chosen.includes(u.id)} aria-label={`${u.name} – ${prefix}`} />
              <span>{u.name} <span className="text-muted-foreground">· {ROLE_LABELS[normalizeRole(u.role)]}</span></span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
  return (
    <section className="space-y-4" aria-label="קבוצות מנהלים">
      <p className="text-sm text-muted-foreground">קבוצה מאגדת כמה מנהלים. בשלבי הטופס אפשר להעביר שלב לקבוצה, וכל חבריה מקבלים אותו במקביל.</p>
      <Card className="p-4">
        <form action={createUserGroupAction} className="space-y-3">
          <h2 className="font-semibold">קבוצה חדשה</h2>
          <div className="max-w-sm space-y-1">
            <Label htmlFor="g-new">שם הקבוצה</Label>
            <Input id="g-new" name="name" required placeholder="למשל: מנהלי פרויקטים" />
          </div>
          {memberPicker("קבוצה חדשה", [])}
          <Button type="submit"><Plus className="size-4" aria-hidden />יצירת קבוצה</Button>
        </form>
      </Card>
      {groups.length === 0 && <p className="text-sm text-muted-foreground">עדיין אין קבוצות.</p>}
      {groups.map((g) => (
        <Card key={g.id} className="p-4">
          <form action={updateUserGroupAction} className="space-y-3">
            <input type="hidden" name="id" value={g.id} />
            {g.otherContactIds.map((c) => <input key={c} type="hidden" name="keep" value={c} />)}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1 space-y-1">
                <Label htmlFor={`g-${g.id}`}>שם הקבוצה</Label>
                <Input id={`g-${g.id}`} name="name" defaultValue={g.name} required />
              </div>
              <Badge tone="muted">{g.userIds.length + g.otherContactIds.length} חברים</Badge>
            </div>
            {memberPicker(g.name, g.userIds)}
            <div className="flex gap-2">
              <Button type="submit" name="intent" value="save">שמירה</Button>
              <Button type="submit" name="intent" value="delete" variant="ghost" className="text-destructive"><Trash2 className="size-4" aria-hidden />מחיקת הקבוצה</Button>
            </div>
          </form>
        </Card>
      ))}
    </section>
  );
}

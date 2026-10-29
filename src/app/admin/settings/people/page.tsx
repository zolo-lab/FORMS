import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listOrgs } from "@/server/orgs-store";
import { listContacts, listGroups } from "@/server/people-store";
import { createContactAction, createGroupAction, updateContactAction, updateGroupAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  name: "יש להזין שם לאיש הקשר",
  email: "כתובת מייל לא תקינה",
  phone: "מספר טלפון לא תקין",
  group: "יש להזין שם לקבוצה",
};

const KIND_LABELS = { internal: "עובד/ת הארגון", external: "איש קשר חיצוני" } as const;

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const [contacts, groups, orgs] = await Promise.all([listContacts(true), listGroups(), listOrgs()]);
  const active = contacts.filter((c) => c.active);
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-6">
      <PageHeader title="משתמשים לשלבים" description={<>מי שאפשר להעביר אליו שלב בטופס: מזכירות, מנהלים, חשבות שכר, ספקים. קבוצה מאגדת כמה מהם: שלב יכול לעבור לכולם במקביל,
          או שהמבקש בוחר אחד מהם ברשימה נפתחת בטופס (מקור הרשימה &quot;קבוצה&quot;).</>} />
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error] ?? "שגיאה"}</p>}
      {saved && <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">נשמר</p>}

      <section className="space-y-3" aria-labelledby="contacts-h">
        <h2 id="contacts-h" className="text-lg font-semibold">אנשי קשר ({active.length})</h2>
        <Card className="p-4">
          <form action={createContactAction} className="grid gap-3 sm:grid-cols-6">
            <ContactFields orgs={orgs} />
            <div className="sm:col-span-6"><Button type="submit" size="sm">הוספת איש קשר</Button></div>
          </form>
        </Card>
        {contacts.map((c) => (
          <Card key={c.id} className={c.active ? "p-4" : "p-4 opacity-60"}>
            <form action={updateContactAction} className="grid gap-3 sm:grid-cols-6">
              <input type="hidden" name="id" value={c.id} />
              <ContactFields orgs={orgs} contact={c} />
              <div className="flex gap-2 sm:col-span-6">
                <Button type="submit" name="intent" value="save" size="sm" variant="outline">שמירה</Button>
                <Button type="submit" name="intent" value={c.active ? "deactivate" : "activate"} size="sm" variant="ghost">{c.active ? "השבתה" : "הפעלה מחדש"}</Button>
              </div>
            </form>
          </Card>
        ))}
      </section>

      <section className="space-y-3" aria-labelledby="groups-h">
        <h2 id="groups-h" className="text-lg font-semibold">קבוצות ({groups.length})</h2>
        <Card className="p-4">
          <form action={createGroupAction} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="new-group">שם הקבוצה</Label>
              <Input id="new-group" name="name" placeholder='למשל "מזכירות ארצנו"' />
            </div>
            <Button type="submit" size="sm">הוספת קבוצה</Button>
          </form>
        </Card>
        {groups.map((g) => (
          <Card key={g.id} className="p-4">
            <form action={updateGroupAction} className="space-y-3">
              <input type="hidden" name="id" value={g.id} />
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`g-${g.id}`}>שם הקבוצה</Label>
                  <Input id={`g-${g.id}`} name="name" defaultValue={g.name} />
                </div>
                <p className="text-xs text-muted-foreground" dir="ltr">group:{g.id}</p>
              </div>
              <fieldset className="space-y-1">
                <legend className="text-sm font-medium">חברי הקבוצה</legend>
                {active.length === 0 && <p className="text-sm text-muted-foreground">אין אנשי קשר פעילים עדיין.</p>}
                <ul className="grid gap-1 sm:grid-cols-3">
                  {active.map((c) => (
                    <li key={c.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox name="members" value={c.id} defaultChecked={g.memberIds.includes(c.id)} />
                        {c.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
              <div className="flex gap-2">
                <Button type="submit" name="intent" value="save" size="sm" variant="outline">שמירת הקבוצה</Button>
                <Button type="submit" name="intent" value="delete" size="sm" variant="ghost">מחיקת הקבוצה</Button>
              </div>
            </form>
          </Card>
        ))}
      </section>
    </main>
  );
}

function ContactFields({ orgs, contact }: { orgs: { id: string; name: string }[]; contact?: { id: string; name: string; email: string | null; phone: string | null; kind: string; organizationId: string | null } }) {
  const p = contact ? `c-${contact.id}` : "c-new";
  return (
    <>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${p}-name`}>שם</Label>
        <Input id={`${p}-name`} name="name" defaultValue={contact?.name ?? ""} required />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${p}-email`}>מייל</Label>
        <Input id={`${p}-email`} name="email" type="email" dir="ltr" defaultValue={contact?.email ?? ""} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${p}-phone`}>נייד</Label>
        <Input id={`${p}-phone`} name="phone" type="tel" dir="ltr" defaultValue={contact?.phone ?? ""} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${p}-kind`}>סוג</Label>
        <Select id={`${p}-kind`} name="kind" defaultValue={contact?.kind ?? "internal"}>
          {Object.entries(KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${p}-org`}>ארגון</Label>
        <Select id={`${p}-org`} name="organizationId" defaultValue={contact?.organizationId ?? ""}>
          <option value="">כל הארגונים</option>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      </div>
    </>
  );
}

import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { isPlaceholderEmail } from "@/lib/notifications/channels";
import { PREF_GROUPS, type GroupPref } from "@/lib/notifications/user-prefs";
import { DEFAULT_REMINDER_POLICY } from "@/lib/workflow/types";
import { currentUser } from "@/server/users-store";
import { getPrefs } from "@/server/user-notification-prefs";
import { savePrefsAction } from "./actions";

export const dynamic = "force-dynamic";

const triValue = (v: boolean | undefined) => (v === true ? "on" : v === false ? "off" : "");

/** One hour field: empty = keep whatever the organization set, with that number shown as the placeholder. */
function Hours({ name, label, value, fallback, max, suffix }: { name: string; label: string; value?: number; fallback: number; max: number; suffix?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={name} name={name} type="number" min={0} max={max} inputMode="numeric" defaultValue={value ?? ""} placeholder={`${fallback}`} className="w-28" />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

export default async function MyNotificationsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const me = await currentUser();
  if (!me) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <PageHeader title="ההתראות שלי" />
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">המסך הזה זמין רק למי שמחובר עם משתמש אישי. התחברו עם המשתמש שלכם כדי להגדיר את ההתראות.</p>
      </main>
    );
  }
  const prefs = await getPrefs(me.id);
  const hasEmail = !isPlaceholderEmail(me.email);
  const t = prefs.reminderTiming;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <PageHeader
        title="ההתראות שלי"
        description="כאן נקבע מה יגיע אליכם ואיך. ההגדרה האישית הזו גוברת על ההגדרות של כל טופס ושל העמותה. היא חלה רק עליכם ולא על אף אחד אחר."
      />
      {saved && (
        <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">
          ההגדרות נשמרו.
        </p>
      )}
      {!hasEmail && <p className="rounded-md bg-warning/15 p-3 text-sm">למשתמש שלכם לא מוגדרת כתובת מייל, ולכן יגיעו אליכם רק הודעות סמס.</p>}

      <form action={savePrefsAction} className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">מה לשלוח לי</h2>
          <Card className="divide-y">
            {PREF_GROUPS.map((group) => {
              const pref: GroupPref = prefs.groups[group.key] ?? {};
              return (
                <fieldset key={group.key} className="space-y-3 p-4">
                  <legend className="sr-only">{group.label}</legend>
                  <div>
                    <p className="font-medium">{group.label}</p>
                    <p className="text-sm text-muted-foreground">{group.when}</p>
                  </div>
                  <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                    {group.required ? (
                      <p className="text-sm text-muted-foreground">נשלח תמיד – אפשר לבחור רק באיזה ערוץ.</p>
                    ) : (
                      <div className="space-y-1">
                        <Label htmlFor={`${group.key}.enabled`}>לשלוח?</Label>
                        <Select id={`${group.key}.enabled`} name={`${group.key}.enabled`} defaultValue={triValue(pref.enabled)} className="w-56">
                          <option value="">לפי ההגדרה של הטופס</option>
                          <option value="on">כן, תמיד לשלוח לי</option>
                          <option value="off">לא, אל תשלחו לי</option>
                        </Select>
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <Checkbox name={`${group.key}.email`} value="1" defaultChecked={pref.email ?? true} disabled={!hasEmail} />
                        מייל
                      </label>
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <Checkbox name={`${group.key}.sms`} value="1" defaultChecked={pref.sms ?? true} />
                        סמס
                      </label>
                    </div>
                  </div>
                </fieldset>
              );
            })}
          </Card>
          <p className="text-sm text-muted-foreground">קוד הכניסה לחתימה נשלח תמיד, ואי אפשר לכבות אותו.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">מתי לשלוח לי תזכורת</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            תזכורת נשלחת כשבקשה ממתינה לכם ולא זזה הלאה. שדה שנשאר ריק נשאר לפי ההגדרה של העמותה – המספר האפור הוא מה שחל עליכם היום.
          </p>
          <Card className="grid gap-4 p-4 sm:grid-cols-2">
            <Hours name="firstAfterHours" label="תזכורת ראשונה אחרי" value={t.firstAfterHours} fallback={DEFAULT_REMINDER_POLICY.firstAfterHours} max={720} suffix="שעות" />
            <Hours name="everyHours" label="ואחר כך כל" value={t.everyHours} fallback={DEFAULT_REMINDER_POLICY.everyHours} max={720} suffix="שעות" />
            <Hours name="maxCount" label="מקסימום תזכורות לבקשה" value={t.maxCount} fallback={DEFAULT_REMINDER_POLICY.maxCount} max={50} suffix="0 = בלי הגבלה" />
            <div className="space-y-1">
              <Label htmlFor="skipShabbat">שבת וחג</Label>
              <Select id="skipShabbat" name="skipShabbat" defaultValue={triValue(t.skipShabbat)} className="w-full">
                <option value="">לפי ההגדרה של העמותה</option>
                <option value="on">לא לשלוח בשבת</option>
                <option value="off">לשלוח גם בשבת</option>
              </Select>
            </div>
            <Hours name="quietFromHour" label="שעות שקט – מ" value={t.quietFromHour} fallback={DEFAULT_REMINDER_POLICY.quietFromHour} max={23} suffix="בערב" />
            <Hours name="quietToHour" label="שעות שקט – עד" value={t.quietToHour} fallback={DEFAULT_REMINDER_POLICY.quietToHour} max={23} suffix="בבוקר" />
          </Card>
        </section>

        <div className="flex items-center gap-3">
          <SubmitButton>שמירה</SubmitButton>
          <span className="text-sm text-muted-foreground">השינוי חל מיד על ההודעות הבאות.</span>
        </div>
      </form>
    </main>
  );
}

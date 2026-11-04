"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PREF_GROUPS, type GroupPref, type PrefGroup, type ReminderTiming } from "@/lib/notifications/user-prefs";
import { currentUser } from "@/server/users-store";
import { savePrefs } from "@/server/user-notification-prefs";

/** "" (the "as the form decides" option) stays undefined, so the level below keeps deciding. */
const tri = (v: FormDataEntryValue | null): boolean | undefined => (v === "on" ? true : v === "off" ? false : undefined);
const num = (v: FormDataEntryValue | null): number | undefined => {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export async function savePrefsAction(formData: FormData) {
  const me = await currentUser();
  if (!me) redirect("/login");

  const groups: Partial<Record<PrefGroup, GroupPref>> = {};
  for (const g of PREF_GROUPS) {
    const pref: GroupPref = {
      enabled: g.required ? undefined : tri(formData.get(`${g.key}.enabled`)),
      email: formData.get(`${g.key}.email`) === "1",
      sms: formData.get(`${g.key}.sms`) === "1",
    };
    groups[g.key] = pref;
  }

  const reminderTiming: ReminderTiming = {
    firstAfterHours: num(formData.get("firstAfterHours")),
    everyHours: num(formData.get("everyHours")),
    maxCount: num(formData.get("maxCount")),
    quietFromHour: num(formData.get("quietFromHour")),
    quietToHour: num(formData.get("quietToHour")),
    skipShabbat: tri(formData.get("skipShabbat")),
  };

  await savePrefs(me.id, { groups, reminderTiming });
  revalidatePath("/admin/notifications");
  redirect("/admin/notifications?saved=1");
}

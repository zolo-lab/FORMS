"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/permissions";
import { parseEmailList, parseTriggerForm } from "@/lib/notifications/triggers";
import { resetTriggerSetting, saveOrgAddresses, saveTriggerSetting } from "@/server/mail-triggers";
import { currentUser } from "@/server/users-store";

const PATH = "/admin/mail/triggers";
const UUID = /^[0-9a-f-]{36}$/i;

async function requireAdmin() {
  const me = await currentUser();
  if (!isAdmin(me)) redirect("/admin/inbox");
  return me!;
}

/** "" = all organizations; otherwise a valid organization id (anything else is rejected). */
function scopeOf(formData: FormData): string | null {
  const org = String(formData.get("org") ?? "");
  if (org && !UUID.test(org)) redirect(`${PATH}?error=org`);
  return org || null;
}

const back = (org: string | null, extra: string) => `${PATH}?${org ? `org=${org}&` : ""}${extra}`;

export async function saveTriggerAction(formData: FormData) {
  const me = await requireAdmin();
  const org = scopeOf(formData);
  const key = String(formData.get("key") ?? "");
  const parsed = parseTriggerForm(key, (n) => (formData.get(n) as string | null) ?? null, (n) => formData.getAll(n).map(String));
  if (!parsed.ok) redirect(back(org, `error=${parsed.error}&key=${encodeURIComponent(key)}`));
  await saveTriggerSetting(org, key, parsed.value, me.id);
  revalidatePath(PATH);
  redirect(back(org, `saved=${encodeURIComponent(key)}`));
}

export async function resetTriggerAction(formData: FormData) {
  await requireAdmin();
  const org = scopeOf(formData);
  const key = String(formData.get("key") ?? "");
  await resetTriggerSetting(org, key);
  revalidatePath(PATH);
  redirect(back(org, `saved=${encodeURIComponent(key)}`));
}

export async function saveOrgAddressesAction(formData: FormData) {
  await requireAdmin();
  const org = scopeOf(formData);
  if (!org) redirect(`${PATH}?error=org`);
  await saveOrgAddresses(org, parseEmailList(String(formData.get("secretariat") ?? "")), parseEmailList(String(formData.get("bookkeeping") ?? "")));
  revalidatePath(PATH);
  redirect(back(org, "saved=addresses"));
}

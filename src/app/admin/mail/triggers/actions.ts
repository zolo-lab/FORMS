"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/permissions";
import { effectiveTrigger, parseEmailList, parseTemplateForm, parseTriggerForm, triggerDef } from "@/lib/notifications/triggers";
import { loadTriggerSettings, resetTemplate, resetTriggerSetting, saveOrgAddresses, saveTemplate, saveTriggerSetting } from "@/server/mail-triggers";
import { currentUser } from "@/server/users-store";
import { runOpenSummary } from "@/server/open-summary";
import { OPEN_SUMMARY_KEY } from "@/lib/notifications/open-summary";

const PATH = "/admin/mail/triggers";
const UUID = /^[0-9a-f-]{36}$/i;

async function requireAdmin() {
  const me = await currentUser();
  if (!isAdmin(me)) redirect("/admin/inbox");
  return me;
}

/** "" = all organizations; otherwise a valid organization id (anything else is rejected). */
function scopeOf(formData: FormData): string | null {
  const org = String(formData.get("org") ?? "");
  if (org && !UUID.test(org)) redirect(`${PATH}?error=org`);
  return org || null;
}

/** Back to the list, keeping the organization and – when saved from the edit panel – the panel open. */
function back(formData: FormData, org: string | null, extra: string) {
  const key = String(formData.get("key") ?? "");
  const edit = formData.get("edit") === "1" && triggerDef(key) ? `&edit=${encodeURIComponent(key)}` : "";
  return `${PATH}?${org ? `org=${org}&` : ""}${extra}${edit}`;
}

export async function saveTriggerAction(formData: FormData) {
  const me = await requireAdmin();
  const org = scopeOf(formData);
  const key = String(formData.get("key") ?? "");
  const parsed = parseTriggerForm(key, (n) => (formData.get(n) as string | null) ?? null, (n) => formData.getAll(n).map(String));
  if (!parsed.ok) redirect(back(formData, org, `error=${parsed.error}&key=${encodeURIComponent(key)}`));
  await saveTriggerSetting(org, key, parsed.value, me?.id);
  revalidatePath(PATH);
  redirect(back(formData, org, `saved=${encodeURIComponent(key)}`));
}

/** The switch in the list: on/off only, keeping whom it goes to and when. */
export async function toggleTriggerAction(formData: FormData) {
  const me = await requireAdmin();
  const org = scopeOf(formData);
  const key = String(formData.get("key") ?? "");
  const def = triggerDef(key);
  if (!def || def.locked) redirect(back(formData, org, `error=locked&key=${encodeURIComponent(key)}`));
  const eff = effectiveTrigger(key, (await loadTriggerSettings(org)).settings, org);
  const enabled = formData.get("enabled") === "on";
  // Switching on a trigger that has nobody to send to would do nothing: it gets its default recipients back.
  const recipients = enabled && !eff.recipients.length ? def!.defaults : eff.recipients;
  await saveTriggerSetting(org, key, { enabled, recipients, fixedRecipients: eff.fixedRecipients, ...(def!.periodic ? { schedule: eff.schedule } : {}) }, me?.id);
  revalidatePath(PATH);
  redirect(back(formData, org, `saved=${encodeURIComponent(key)}`));
}

export async function resetTriggerAction(formData: FormData) {
  await requireAdmin();
  const org = scopeOf(formData);
  const key = String(formData.get("key") ?? "");
  await resetTriggerSetting(org, key);
  revalidatePath(PATH);
  redirect(back(formData, org, `saved=${encodeURIComponent(key)}`));
}

export async function saveOrgAddressesAction(formData: FormData) {
  await requireAdmin();
  const org = scopeOf(formData);
  if (!org) redirect(`${PATH}?error=org`);
  await saveOrgAddresses(org, parseEmailList(String(formData.get("secretariat") ?? "")), parseEmailList(String(formData.get("bookkeeping") ?? "")));
  revalidatePath(PATH);
  redirect(back(formData, org, "saved=addresses"));
}

export async function saveTemplateAction(formData: FormData) {
  await requireAdmin();
  const org = scopeOf(formData);
  const key = String(formData.get("key") ?? "");
  const parsed = parseTemplateForm(key, String(formData.get("subject") ?? ""), String(formData.get("body") ?? ""));
  if (!parsed.ok) redirect(back(formData, org, `error=text_${parsed.error}&key=${encodeURIComponent(key)}`));
  await saveTemplate(org, key, parsed.value);
  revalidatePath(PATH);
  redirect(back(formData, org, `saved=text-${encodeURIComponent(key)}`));
}

export async function resetTemplateAction(formData: FormData) {
  await requireAdmin();
  const org = scopeOf(formData);
  const key = String(formData.get("key") ?? "");
  await resetTemplate(org, key);
  revalidatePath(PATH);
  redirect(back(formData, org, `saved=text-${encodeURIComponent(key)}`));
}

/** "שליחה עכשיו": the open-requests summary of one organization, right now (to check the recipients and the text). */
export async function sendSummaryNowAction(formData: FormData) {
  await requireAdmin();
  const org = scopeOf(formData);
  if (!org) redirect(`${PATH}?error=org`);
  const n = await runOpenSummary(new Date(), { force: true, organizationId: org });
  revalidatePath("/admin/mail");
  redirect(back(formData, org, n ? "saved=now" : `error=nothing&key=${OPEN_SUMMARY_KEY}`));
}

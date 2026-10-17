"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeHex } from "@/lib/branding";
import { parseReminderPolicy } from "@/lib/workflow/reminder-policy";
import { createOrg, setOrgActive, updateOrg, updateOrgBasics } from "@/server/orgs-store";
import { isAdmin } from "@/lib/auth/permissions";
import { parseOrgInput } from "@/lib/orgs/input";
import { currentUser } from "@/server/users-store";

const PATH = "/admin/settings/organizations";
const UUID = /^[0-9a-f-]{36}$/i;

async function requireAdmin() {
  if (!isAdmin(await currentUser())) redirect("/admin/forms");
}

/** New row in the nonprofits / businesses table. */
export async function createOrgAction(formData: FormData) {
  await requireAdmin();
  const parsed = parseOrgInput(Object.fromEntries(formData));
  if (!parsed.ok) redirect(`${PATH}?error=${parsed.error}`);
  const row = await createOrg(parsed.value);
  if (!row) redirect(`${PATH}?error=exists`);
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

/** Inline edit of one row: name, ח"פ, project, active. */
export async function updateOrgBasicsAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) redirect(`${PATH}?error=name`);
  const parsed = parseOrgInput(Object.fromEntries(formData));
  if (!parsed.ok) redirect(`${PATH}?error=${parsed.error}`);
  if (!(await updateOrgBasics(id, parsed.value))) redirect(`${PATH}?error=exists`);
  await setOrgActive(id, !!formData.get("active"));
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}
import { putFile } from "@/server/storage";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO = 1024 * 1024;

const clean = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

/** Branding, sender and reminders of one organization (the name is edited in the table). */
export async function updateOrgAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));

  const colorRaw = clean(formData.get("primaryColor"));
  const primaryColor = colorRaw ? normalizeHex(colorRaw) : null;
  if (colorRaw && !primaryColor) redirect("/admin/settings/organizations?error=color");

  const email = clean(formData.get("senderEmail"));
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/admin/settings/organizations?error=email");

  let logoFileId: string | null | undefined;
  const logo = formData.get("logo");
  if (formData.get("removeLogo") === "1") logoFileId = null;
  else if (logo instanceof File && logo.size > 0) {
    if (!LOGO_TYPES.includes(logo.type) || logo.size > MAX_LOGO) redirect("/admin/settings/organizations?error=logo");
    logoFileId = (await putFile({ name: logo.name, mime: logo.type, bytes: new Uint8Array(await logo.arrayBuffer()) })).id;
  }

  await updateOrg(id, {
    primaryColor,
    senderName: clean(formData.get("senderName")),
    senderEmail: email,
    reminderPolicy: parseReminderPolicy(Object.fromEntries(formData)),
    ...(logoFileId !== undefined ? { logoFileId } : {}),
  });
  revalidatePath("/admin/settings/organizations");
  redirect("/admin/settings/organizations?saved=1");
}

"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeHex } from "@/lib/branding";
import { parseReminderPolicy } from "@/lib/workflow/reminder-policy";
import { updateOrg } from "@/server/orgs-store";
import { putFile } from "@/server/storage";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO = 1024 * 1024;

const clean = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

export async function updateOrgAction(formData: FormData) {
  const id = String(formData.get("id"));
  const name = clean(formData.get("name"));
  if (!name) redirect("/admin/settings/organizations?error=name");

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
    name,
    primaryColor,
    senderName: clean(formData.get("senderName")),
    senderEmail: email,
    reminderPolicy: parseReminderPolicy(Object.fromEntries(formData)),
    ...(logoFileId !== undefined ? { logoFileId } : {}),
  });
  revalidatePath("/admin/settings/organizations");
  redirect("/admin/settings/organizations?saved=1");
}

"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeHex } from "@/lib/branding";
import { createOrg, createOrgFieldDef, createProject, deleteOrgFieldDef, deleteProject, renameOrgFieldDef, setOrgActive, setOrgFieldValues, setOrgsActive, updateOrg, updateOrgBasics, updateProject } from "@/server/orgs-store";
import { isAdmin } from "@/lib/auth/permissions";
import { parseOrgInput, parseProjectName } from "@/lib/orgs/input";
import { currentUser } from "@/server/users-store";
import type { AutoSaveResult } from "@/components/ui/auto-save-form";

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
  redirect(`${PATH}?edit=${row!.id}&saved=new`);
}

/** A new project under an organization. */
export async function createProjectAction(formData: FormData) {
  await requireAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");
  const name = parseProjectName(formData.get("name"));
  if (!UUID.test(organizationId)) redirect(`${PATH}?error=project`);
  if (!name) redirect(`${PATH}?edit=${organizationId}&error=project`);
  if (!(await createProject(organizationId, name))) redirect(`${PATH}?edit=${organizationId}&error=projectExists`);
  revalidatePath(PATH);
  redirect(`${PATH}?edit=${organizationId}&saved=newproj-${organizationId}`);
}

/** Autosave of one project row (name, active). Returns a result instead of redirecting. */
export async function updateProjectAction(formData: FormData): Promise<AutoSaveResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = parseProjectName(formData.get("name"));
  if (!UUID.test(id) || !name) return { ok: false, error: "project" };
  if (!(await updateProject(id, { name, active: !!formData.get("active") }))) return { ok: false, error: "projectExists" };
  revalidatePath(PATH);
  return { ok: true };
}

/** Autosave of the details: name, ח"פ, active. */
export async function updateOrgBasicsAction(formData: FormData): Promise<AutoSaveResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, error: "name" };
  const parsed = parseOrgInput(Object.fromEntries(formData));
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (!(await updateOrgBasics(id, parsed.value))) return { ok: false, error: "exists" };
  await setOrgActive(id, !!formData.get("active"));
  revalidatePath(PATH);
  return { ok: true };
}
import { putFile } from "@/server/storage";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO = 1024 * 1024;

const clean = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

/** Branding and sender of one organization (the name is edited in the table). */
export async function updateOrgAction(formData: FormData): Promise<AutoSaveResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, error: "name" };

  const colorRaw = clean(formData.get("primaryColor"));
  const primaryColor = colorRaw ? normalizeHex(colorRaw) : null;
  if (colorRaw && !primaryColor) return { ok: false, error: "color" };

  const email = clean(formData.get("senderEmail"));
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "email" };

  let logoFileId: string | null | undefined;
  const logo = formData.get("logo");
  if (formData.get("removeLogo") === "1") logoFileId = null;
  else if (logo instanceof File && logo.size > 0) {
    if (!LOGO_TYPES.includes(logo.type) || logo.size > MAX_LOGO) return { ok: false, error: "logo" };
    logoFileId = (await putFile({ name: logo.name, mime: logo.type, bytes: new Uint8Array(await logo.arrayBuffer()) })).id;
  }

  await updateOrg(id, {
    primaryColor,
    senderName: clean(formData.get("senderName")),
    senderEmail: email,
    ...(logoFileId !== undefined ? { logoFileId } : {}),
  });
  revalidatePath(PATH);
  return { ok: true };
}

/** A project nothing is filed under is deleted; one in use is only reported (it can be switched off instead). */
export async function deleteProjectAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const org = String(formData.get("org") ?? "");
  if (!UUID.test(id) || !UUID.test(org)) redirect(`${PATH}?error=project`);
  const r = await deleteProject(id);
  revalidatePath(PATH);
  redirect(r.ok ? `${PATH}?edit=${org}&saved=projdel` : `${PATH}?edit=${org}&error=projectInUse&n=${r.inUse}`);
}

/** The table's bulk action: switch the ticked organizations on or off. */
export async function bulkOrgsActiveAction(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll("ids").map(String).filter((v) => UUID.test(v));
  const active = formData.get("do") === "on";
  await setOrgsActive(ids, active);
  revalidatePath(PATH);
  redirect(`${PATH}?saved=bulk`);
}

/** A new organization field, added for every organization at once; each fills in its own value. */
export async function createOrgFieldAction(formData: FormData) {
  await requireAdmin();
  const org = String(formData.get("org") ?? "");
  const back = UUID.test(org) ? `${PATH}?edit=${org}` : PATH;
  const res = await createOrgFieldDef(String(formData.get("key") ?? ""));
  if (!res.ok) redirect(`${back}${back.includes("?") ? "&" : "?"}error=${res.reason === "exists" ? "orgFieldExists" : "orgFieldKey"}`);
  revalidatePath(PATH);
  redirect(`${back}&saved=orgfield`);
}

/**
 * The one save of the whole section: the names of the fields (for every organization) and this organization's own
 * values, together, and then the panel closes – nothing here saves itself behind the admin's back.
 */
export async function saveOrgFieldsAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) redirect(PATH);

  // Renames first, and only the ones this admin actually changed: `was.` carries what the panel was opened with,
  // so saving values from a panel opened earlier cannot put an old name back for everyone.
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("key.") || typeof v !== "string") continue;
    const defId = k.slice("key.".length);
    if (!UUID.test(defId) || v === String(formData.get(`was.${defId}`) ?? "")) continue;
    const res = await renameOrgFieldDef(defId, v);
    if (!res.ok) redirect(`${PATH}?edit=${id}&error=${res.reason === "exists" ? "orgFieldExists" : "orgFieldKey"}`);
  }

  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (k.startsWith("f.") && typeof v === "string") values[k.slice(2)] = v;
  await setOrgFieldValues(id, values);
  revalidatePath(PATH);
  // The panel stays open: closing is the admin's own button next to this one.
  redirect(`${PATH}?edit=${id}&saved=orgfields`);
}


/** Drops an organization field everywhere, with the values every organization filled in for it. */
export async function deleteOrgFieldAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const org = String(formData.get("org") ?? "");
  if (UUID.test(id)) await deleteOrgFieldDef(id);
  revalidatePath(PATH);
  redirect(UUID.test(org) ? `${PATH}?edit=${org}&saved=orgfielddel` : PATH);
}

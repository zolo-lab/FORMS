"use server";
import { requireAdmin } from "@/server/guards";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isValidEmail, isValidIsraeliPhone, normalizeIsraeliPhone } from "@/lib/validators/israeli";
import { createContact, createGroup, deleteGroup, renameGroup, setGroupMembers, updateContact } from "@/server/people-store";

const UUID = /^[0-9a-f-]{36}$/i;
const PATH = "/admin/settings/people";
const back = (q = "") => redirect(`${PATH}${q}`);
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function contactInput(fd: FormData) {
  const name = str(fd, "name");
  const email = str(fd, "email");
  const phone = str(fd, "phone");
  if (!name) back("?error=name");
  if (email && !isValidEmail(email)) back("?error=email");
  if (phone && !isValidIsraeliPhone(phone)) back("?error=phone");
  const org = str(fd, "organizationId");
  return { name, email: email || null, phone: phone ? normalizeIsraeliPhone(phone) : null, kind: str(fd, "kind") === "external" ? ("external" as const) : ("internal" as const), organizationId: UUID.test(org) ? org : null };
}

export async function createContactAction(fd: FormData) {
  await requireAdmin();
  await createContact(contactInput(fd));
  revalidatePath(PATH);
  back("?saved=1");
}

export async function updateContactAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  if (!UUID.test(id)) back();
  const intent = str(fd, "intent");
  if (intent === "deactivate" || intent === "activate") {
    await updateContact(id, { active: intent === "activate" });
  } else {
    await updateContact(id, contactInput(fd));
  }
  revalidatePath(PATH);
  back("?saved=1");
}

export async function createGroupAction(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  if (!name) back("?error=group");
  await createGroup(name);
  revalidatePath(PATH);
  back("?saved=1");
}

export async function updateGroupAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  if (!UUID.test(id)) back();
  const intent = str(fd, "intent");
  if (intent === "delete") {
    await deleteGroup(id);
  } else {
    const name = str(fd, "name");
    if (!name) back("?error=group");
    await renameGroup(id, name);
    await setGroupMembers(id, fd.getAll("members").map(String).filter((m) => UUID.test(m)));
  }
  revalidatePath(PATH);
  back("?saved=1");
}

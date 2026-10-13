"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseStepForm } from "@/lib/workflow/step-form";
import { validateWorkflow } from "@/lib/workflow/validate-workflow";
import { addDocument, createPackage, getPackage, moveDocument, removeDocument, setArchived, setDocumentRequired, setWorkflow, updatePackage } from "@/server/packages-store";

const UUID = /^[0-9a-f-]{36}$/i;
const back = (id: string, q = "") => redirect(`/admin/packages/${id}${q}`);

function pkgId(fd: FormData): string {
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) redirect("/admin/packages");
  return id;
}

export async function createPackageAction(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  if (!name) redirect("/admin/packages?error=name");
  const id = await createPackage(name);
  revalidatePath("/admin/packages");
  back(id);
}

export async function savePackageAction(fd: FormData) {
  const id = pkgId(fd);
  const name = String(fd.get("name") ?? "").trim();
  if (!name) back(id, "?error=name");
  const org = String(fd.get("organizationId") ?? "");
  await updatePackage(id, { name, description: String(fd.get("description") ?? "").trim() || null, organizationId: UUID.test(org) ? org : null });
  revalidatePath(`/admin/packages/${id}`);
  back(id, "?saved=1");
}

export async function archivePackageAction(fd: FormData) {
  const id = pkgId(fd);
  await setArchived(id, fd.get("archive") === "1");
  revalidatePath("/admin/packages");
  redirect("/admin/packages");
}

export async function documentAction(fd: FormData) {
  const id = pkgId(fd);
  const intent = String(fd.get("intent") ?? "");
  const item = String(fd.get("itemId") ?? "");
  if (intent === "add") {
    const t = String(fd.get("templateId") ?? "");
    if (UUID.test(t)) await addDocument(id, t);
  } else if (UUID.test(item)) {
    if (intent === "remove") await removeDocument(id, item);
    else if (intent === "up") await moveDocument(id, item, -1);
    else if (intent === "down") await moveDocument(id, item, 1);
    else if (intent === "optional") await setDocumentRequired(id, item, false);
    else if (intent === "required") await setDocumentRequired(id, item, true);
  }
  revalidatePath(`/admin/packages/${id}`);
  back(id);
}

export async function stepAction(fd: FormData) {
  const id = pkgId(fd);
  const data = await getPackage(id);
  if (!data) redirect("/admin/packages");
  const steps = [...data.pkg.workflow.steps];
  const intent = String(fd.get("intent") ?? "");
  const index = Number(fd.get("index"));

  if (intent === "add") {
    const next = steps.reduce((m, s) => Math.max(m, s.order), 0) + 1;
    steps.push({ order: next, role: "employee", action: "fill_and_sign" });
  } else if (Number.isInteger(index) && index >= 0 && index < steps.length) {
    if (intent === "delete") steps.splice(index, 1);
    else if (intent === "save") steps[index] = parseStepForm(fd);
  }
  const errors = intent === "save" ? validateWorkflow({ steps: [steps[index]!] }) : [];
  if (errors.length) back(id, `?stepError=${encodeURIComponent(errors.join(" · "))}`);
  await setWorkflow(id, { steps });
  revalidatePath(`/admin/packages/${id}`);
  back(id, "?saved=1");
}

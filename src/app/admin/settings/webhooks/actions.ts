"use server";
import { requireAdmin } from "@/server/guards";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { WEBHOOK_EVENTS, isSafeWebhookUrl, parseEvents } from "@/lib/webhooks/events";
import { createWebhook, deleteWebhook, deliverWebhook, listWebhooks, setWebhookActive } from "@/server/webhooks";

const UUID = /^[0-9a-f-]{36}$/i;
const BASE = "/admin/settings/webhooks";

export async function createWebhookAction(fd: FormData) {
  await requireAdmin();
  const organizationId = String(fd.get("organizationId") ?? "");
  const templateId = String(fd.get("templateId") ?? "");
  const url = String(fd.get("url") ?? "").trim();
  const events = parseEvents(fd.getAll("events").map(String));
  if (!UUID.test(organizationId)) redirect(`${BASE}?error=org`);
  if (!isSafeWebhookUrl(url)) redirect(`${BASE}?error=url`);
  if (events.length === 0) redirect(`${BASE}?error=events`);
  await createWebhook({ organizationId, templateId: UUID.test(templateId) ? templateId : null, url, events });
  revalidatePath(BASE);
  redirect(`${BASE}?saved=1`);
}

export async function toggleWebhookAction(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  if (UUID.test(id)) await setWebhookActive(id, fd.get("active") === "1");
  revalidatePath(BASE);
  redirect(BASE);
}

export async function deleteWebhookAction(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  if (UUID.test(id)) await deleteWebhook(id);
  revalidatePath(BASE);
  redirect(BASE);
}

/** Sends a `ping` event to the receiver so the URL and the signature check can be tried without a real request. */
export async function testWebhookAction(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const hook = (await listWebhooks()).find((h) => h.id === id);
  if (!hook) redirect(BASE);
  const r = await deliverWebhook(hook, "ping", { event: "ping", createdAt: new Date().toISOString(), message: "בדיקת חיבור מטפסים וחתימות", knownEvents: WEBHOOK_EVENTS }, { delays: [0] });
  redirect(`${BASE}?test=${r.ok ? "ok" : "fail"}&status=${r.status ?? ""}`);
}

"use server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createToken } from "@/lib/auth/tokens";
import { parseFiller, publicStart } from "@/lib/forms/public-link";
import { createRequest, sendRequest } from "@/server/requests-store";
import { formPackageId } from "@/server/packages-store";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The form's public link: whoever opened it becomes the request's subject and fills its first step on the usual
 * signing page (signature, filling on the document…). The rest of the steps go on from there by themselves.
 */
export async function startPublicFillAction(fd: FormData) {
  const formId = String(fd.get("formId") ?? "");
  const back = (q: string) => redirect(`/f/${formId}?${q}`);
  if (!UUID.test(formId)) redirect("/");
  // A field people never see: bots fill it, people do not.
  if (String(fd.get("website") ?? "")) back("error=input");
  const [form] = await db.select().from(schema.formTemplates).where(eq(schema.formTemplates.id, formId));
  if (!form?.publishedVersion) back("error=unpublished");
  const packageId = await formPackageId(formId);
  const [pkg] = await db.select().from(schema.packageTemplates).where(eq(schema.packageTemplates.id, packageId));
  const start = publicStart(pkg?.workflow.steps ?? []);
  if (!pkg || pkg.archivedAt || !start.ok) back("error=closed");
  const filler = parseFiller({ name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? ""), phone: String(fd.get("phone") ?? "") });
  if (!filler.ok) back(`error=${filler.error}`);
  const orgId = pkg!.organizationId ?? String(fd.get("organizationId") ?? "");
  const [org] = UUID.test(orgId) ? await db.select().from(schema.organizations).where(and(eq(schema.organizations.id, orgId), eq(schema.organizations.active, true))) : [];
  if (!org) back("error=org");
  const f = filler as Extract<typeof filler, { ok: true }>;
  const requestId = await createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name: f.name, email: f.email, phone: f.phone } });
  const sent = await sendRequest(requestId, { type: "api" }, { requesterByLink: (start as Extract<typeof start, { ok: true }>).role === "requester" });
  // The first open step is the one this person fills now. The sender step gets no mailed link, so make one here.
  const [first] = await db
    .select()
    .from(schema.signingSteps)
    .where(and(eq(schema.signingSteps.requestId, requestId), eq(schema.signingSteps.status, "active")))
    .orderBy(schema.signingSteps.order)
    .limit(1);
  if (!first) back("error=closed");
  let token = sent.tokens.find((t) => t.stepId === first!.id)?.token;
  if (!token) {
    const made = createToken();
    const [req] = await db.select({ expiresAt: schema.requests.expiresAt }).from(schema.requests).where(eq(schema.requests.id, requestId));
    await db.insert(schema.stepTokens).values({ stepId: first!.id, tokenHash: made.hash, expiresAt: req?.expiresAt ?? null });
    token = made.token;
  }
  redirect(`/s/${token}`);
}

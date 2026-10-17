/** Who may download a stored file: admins always; others only files tied to a request they may see. */
import { and, eq, exists, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasGrant, isAdmin } from "@/lib/auth/permissions";
import { scopeCondition } from "./dashboard-store";
import { currentUser, viewerScope } from "./users-store";

const { requests, packageDocuments, signingSteps, signatures, submissions, organizations } = schema;

export async function canReadFile(fileId: string): Promise<boolean> {
  const user = await currentUser();
  if (isAdmin(user)) return true;
  // Form builders work with the PDFs and uploads behind forms.
  if (hasGrant(user, "manageForms")) return true;
  // Organization logos and stamps are branding, shown on pages every signed-in user sees.
  const [brand] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(or(eq(organizations.logoFileId, fileId), eq(organizations.stampImageFileId, fileId)))
    .limit(1);
  if (brand) return true;
  const scope = await viewerScope();
  const tied = or(
    exists(db.select({ one: sql`1` }).from(packageDocuments).where(and(eq(packageDocuments.requestId, requests.id), eq(packageDocuments.finalFileId, fileId)))),
    exists(
      db
        .select({ one: sql`1` })
        .from(signatures)
        .innerJoin(signingSteps, eq(signingSteps.id, signatures.stepId))
        .where(and(eq(signingSteps.requestId, requests.id), eq(signatures.fileId, fileId))),
    ),
    exists(db.select({ one: sql`1` }).from(submissions).where(and(eq(submissions.requestId, requests.id), sql`${submissions.answers}::text like ${"%" + fileId + "%"}`))),
  )!;
  const [row] = await db
    .select({ id: requests.id })
    .from(requests)
    .where(and(tied, scopeCondition(scope)))
    .limit(1);
  return !!row;
}

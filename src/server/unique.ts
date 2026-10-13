/** "Unique" fields: no other request built from the same templates may already hold the value. */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Answers } from "@/lib/forms/conditions";
import type { FieldErrors } from "@/lib/forms/validate";
import { allFields, type FormDefinition } from "@/lib/forms/schema";

const { submissions, packageDocuments, formTemplateVersions, requests } = schema;

export const DUPLICATE_MESSAGE = "ערך זה כבר קיים במערכת";

/** Errors for `unique` fields of `definition` whose value in `answers` is already used by another request. */
export async function duplicateErrors(requestId: string, definition: FormDefinition, answers: Answers): Promise<FieldErrors> {
  const fields = allFields(definition).filter((f) => f.unique && typeof answers[f.id] === "string" && answers[f.id] !== "");
  if (fields.length === 0) return {};

  const mine = await db
    .select({ templateId: formTemplateVersions.templateId })
    .from(packageDocuments)
    .innerJoin(formTemplateVersions, eq(formTemplateVersions.id, packageDocuments.templateVersionId))
    .where(eq(packageDocuments.requestId, requestId));
  const templateIds = [...new Set(mine.map((m) => m.templateId))];
  if (templateIds.length === 0) return {};

  const errors: FieldErrors = {};
  for (const f of fields) {
    const clash = await db
      .select({ id: submissions.id })
      .from(submissions)
      .innerJoin(requests, eq(requests.id, submissions.requestId))
      .innerJoin(packageDocuments, eq(packageDocuments.requestId, submissions.requestId))
      .innerJoin(formTemplateVersions, eq(formTemplateVersions.id, packageDocuments.templateVersionId))
      .where(
        and(
          ne(submissions.requestId, requestId),
          eq(submissions.status, "submitted"),
          ne(requests.status, "cancelled"),
          inArray(formTemplateVersions.templateId, templateIds),
          sql`${submissions.answers} ->> ${f.id} = ${String(answers[f.id])}`,
        ),
      )
      .limit(1);
    if (clash.length) errors[f.id] = DUPLICATE_MESSAGE;
  }
  return errors;
}

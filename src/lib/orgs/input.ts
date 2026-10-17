/** Adding / editing a nonprofit or business: name, registration number (ח"פ / ח"צ) and an optional project name. Pure, so it is unit tested. */
export interface OrgInput {
  name: string;
  registrationNumber: string;
  projectName: string | null;
}

export type OrgInputError = "name" | "regnum" | "project";
export type OrgInputResult = { ok: true; value: OrgInput } | { ok: false; error: OrgInputError };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parseOrgInput(raw: { name?: unknown; registrationNumber?: unknown; projectName?: unknown }): OrgInputResult {
  const name = str(raw.name);
  if (!name || name.length > 120) return { ok: false, error: "name" };
  // Spaces and dashes are typed by people; the number itself is 9 digits.
  const registrationNumber = str(raw.registrationNumber).replace(/[\s-]/g, "");
  if (!/^\d{9}$/.test(registrationNumber)) return { ok: false, error: "regnum" };
  const project = str(raw.projectName);
  if (project.length > 120) return { ok: false, error: "project" };
  return { ok: true, value: { name, registrationNumber, projectName: project || null } };
}

/** "שם העמותה – שם הפרויקט", or just the name when there is no project. */
export const orgLabel = (o: { name: string; projectName?: string | null }): string => (o.projectName ? `${o.name} – ${o.projectName}` : o.name);

export const ORG_ERRORS: Record<OrgInputError | "exists", string> = {
  name: "יש להזין שם (עד 120 תווים)",
  regnum: 'מספר ח"פ / עמותה חייב להכיל 9 ספרות',
  project: "שם הפרויקט ארוך מדי (עד 120 תווים)",
  exists: 'כבר קיים ארגון עם מספר ח"פ הזה',
};

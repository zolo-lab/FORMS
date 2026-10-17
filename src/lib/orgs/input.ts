/**
 * Adding / editing a nonprofit or business (name + registration number ח"פ) and its projects
 * (each project has its own name under the organization). Pure, so it is unit tested.
 */
export interface OrgInput {
  name: string;
  registrationNumber: string;
}

export type OrgInputError = "name" | "regnum" | "project";
export type OrgInputResult = { ok: true; value: OrgInput } | { ok: false; error: OrgInputError };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parseOrgInput(raw: { name?: unknown; registrationNumber?: unknown }): OrgInputResult {
  const name = str(raw.name);
  if (!name || name.length > 120) return { ok: false, error: "name" };
  // Spaces and dashes are typed by people; the number itself is 9 digits.
  const registrationNumber = str(raw.registrationNumber).replace(/[\s-]/g, "");
  if (!/^\d{9}$/.test(registrationNumber)) return { ok: false, error: "regnum" };
  return { ok: true, value: { name, registrationNumber } };
}

/** A project name: required, up to 120 characters. */
export function parseProjectName(raw: unknown): string | null {
  const name = str(raw);
  return name && name.length <= 120 ? name : null;
}

/** "שם העמותה – שם הפרויקט", or just the organization's name when there is no project. */
export const orgLabel = (orgName: string, projectName?: string | null): string => (projectName ? `${orgName} – ${projectName}` : orgName);

export const ORG_ERRORS: Record<OrgInputError | "exists" | "projectExists", string> = {
  name: "יש להזין שם (עד 120 תווים)",
  regnum: 'מספר ח"פ / עמותה חייב להכיל 9 ספרות',
  project: "יש להזין שם פרויקט (עד 120 תווים)",
  exists: 'כבר קיים ארגון עם מספר ח"פ הזה',
  projectExists: "כבר יש פרויקט בשם הזה בעמותה",
};

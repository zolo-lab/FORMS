/**
 * The name of an organization field. An admin types it in English and it is both the name shown everywhere and the
 * key the forms point at (`org.fields.<key>`), so it never changes behind a form's back. Pure, unit tested.
 */

/** Letters, digits, `_` and `-`, starting with a letter: the same shape a form field id has, plus the hyphen. */
export const ORG_FIELD_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
export const ORG_FIELD_KEY_MAX = 40;

/** The typed name, cleaned up, or `null` when it does not follow the rules. */
export function normalizeOrgFieldKey(input: string): string | null {
  const key = input.trim();
  if (!key || key.length > ORG_FIELD_KEY_MAX || !ORG_FIELD_KEY_RE.test(key)) return null;
  return key;
}

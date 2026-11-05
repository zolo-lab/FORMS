/**
 * The stable key of an organization field, derived from the label an admin types ("מספר תיק ניכויים" →
 * "org_f_<hash>"). Forms point at the key, so it must stay the same when the label is later reworded; a Hebrew
 * label has no usable ASCII form, hence the hash rather than a slug. Pure, unit tested.
 */
export function orgFieldKeyFromLabel(label: string): string {
  const clean = label.trim().replace(/\s+/g, " ");
  // A short, stable, case-insensitive digest of the label: enough to tell apart the handful of fields an admin adds.
  let h = 5381;
  for (const ch of clean.toLowerCase()) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0;
  const ascii = clean.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
  return `${ascii || "field"}_${h.toString(36)}`;
}

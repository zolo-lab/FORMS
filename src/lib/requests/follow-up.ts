/**
 * Handling steps after signing ("עודכן בשכר", "הוקם בפריוריטי"): defined per package, ticked by staff on the request.
 * Pure helpers, unit tested.
 */
export interface FollowUpStatus {
  key: string;
  label: string;
}

export type FollowUpState = Record<string, { at: string; byUserId?: string; byName?: string }>;

/** Editor text (one label per line) → statuses with stable keys. Existing labels keep their key. */
export function parseFollowUpStatuses(text: string, existing: FollowUpStatus[] = []): FollowUpStatus[] {
  const out: FollowUpStatus[] = [];
  const used = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const label = raw.trim().slice(0, 60);
    if (!label || out.some((s) => s.label === label)) continue;
    const prev = existing.find((s) => s.label === label);
    let key = prev?.key ?? `f${out.length + 1}`;
    while (used.has(key) || (!prev && existing.some((s) => s.key === key))) key = `${key}_`;
    used.add(key);
    out.push({ key, label });
  }
  return out.slice(0, 10);
}

export function normalizeFollowUpStatuses(raw: unknown): FollowUpStatus[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is FollowUpStatus => !!x && typeof x === "object" && typeof (x as FollowUpStatus).key === "string" && typeof (x as FollowUpStatus).label === "string")
    .slice(0, 10);
}

/** The first status of the package that is not done yet (what the request is "waiting for" after signing); null = all done. */
export function pendingFollowUp(statuses: FollowUpStatus[], state: FollowUpState | null | undefined): FollowUpStatus | null {
  return statuses.find((s) => !state?.[s.key]) ?? null;
}

/** Tick or untick one status. */
export function setFollowUp(state: FollowUpState | null | undefined, key: string, done: boolean, by: { id?: string; name?: string }, now = new Date()): FollowUpState {
  const next: FollowUpState = { ...(state ?? {}) };
  if (done) next[key] = { at: now.toISOString(), ...(by.id ? { byUserId: by.id } : {}), ...(by.name ? { byName: by.name } : {}) };
  else delete next[key];
  return next;
}

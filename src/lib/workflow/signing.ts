/** Pure helpers for the public signing page. */
import type { RequestStatus, StepStatus } from "./types";

export type TokenState = "ok" | "invalid" | "revoked" | "released" | "expired" | "closed";

export function tokenState(input: {
  token: { revokedAt: Date | null; expiresAt: Date | null } | null;
  stepStatus?: StepStatus;
  requestStatus?: RequestStatus;
  /** The step is one of a group's "any member" steps (group_any). */
  stepAnyOf?: boolean;
  now: Date;
}): TokenState {
  const { token, stepStatus, requestStatus, now } = input;
  if (!token) return "invalid";
  // Another member of the group already signed: say so, rather than "the link was replaced".
  if (input.stepAnyOf && stepStatus === "skipped") return "released";
  if (token.revokedAt) return "revoked";
  if ((token.expiresAt && token.expiresAt < now) || stepStatus === "expired" || requestStatus === "expired") return "expired";
  if (stepStatus !== "active" && stepStatus !== "in_progress") return "closed";
  if (requestStatus === "cancelled" || requestStatus === "declined" || requestStatus === "completed") return "closed";
  return "ok";
}

const SAVE_LOG_INTERVAL_MS = 5 * 60_000;

/** Autosave happens often; the audit log records it at most every 5 minutes. */
export function shouldLogSave(lastLoggedAt: Date | null, now: Date): boolean {
  return !lastLoggedAt || now.getTime() - lastLoggedAt.getTime() >= SAVE_LOG_INTERVAL_MS;
}

/**
 * "כניסה כמשתמש לבדיקה" (/dev-login): one click to act as any user, to walk a signing chain through each person's eyes.
 * In open mode (AUTH_DISABLED=1) every active user is offered. With only DEMO_LOGIN=1 (after open mode is turned off)
 * only demo users on reserved addresses are offered, so a real account can never be entered without its password.
 */
import { authDisabled } from "./open-mode";
import { isDemoAddress } from "./password";

type Env = Record<string, string | undefined>;

export function devLoginEnabled(env: Env = process.env): boolean {
  return authDisabled(env) || env.DEMO_LOGIN === "1";
}

/** May this user be entered from the test login screen? */
export function devLoginAllows(user: { email: string; active: boolean }, env: Env = process.env): boolean {
  if (!user.active) return false;
  if (authDisabled(env)) return true;
  return env.DEMO_LOGIN === "1" && isDemoAddress(user.email);
}

export type DevLoginGroup = "admin" | "manager" | "track";

export const DEV_LOGIN_GROUP_LABELS: Record<DevLoginGroup, string> = {
  admin: "אדמין",
  manager: "מנהלים",
  track: "מעקב בלבד",
};

export function devLoginGroup(user: { role: string; grants?: { trackOnly?: boolean } | null }): DevLoginGroup {
  if (user.role === "admin") return "admin";
  return user.grants?.trackOnly ? "track" : "manager";
}

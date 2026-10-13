/**
 * Temporary "open" mode requested by the owner: with AUTH_DISABLED=1 the admin area needs no password.
 * Only acceptable while the system holds no real employee data; turn it off (remove the env var) before go-live.
 */
export function authDisabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AUTH_DISABLED === "1";
}

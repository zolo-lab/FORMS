/**
 * SMS sending behind a small interface. The real Israeli provider (InforU or 019) is chosen by the owner and
 * added as another case in `getSmsProvider`; until then (and in dev/CI) the console provider only logs.
 */
export interface SmsResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface SmsProvider {
  name: string;
  /** `to` is international digits without "+", e.g. 972501234567. */
  send(to: string, text: string): Promise<SmsResult>;
}

const consoleProvider: SmsProvider = {
  name: "console",
  async send(to, text) {
    console.log(`[sms] (console provider, not sent) to ${to}: ${text}`);
    return { ok: true, id: "console" };
  },
};

export function getSmsProvider(env: Record<string, string | undefined> = process.env): SmsProvider {
  const name = env.SMS_PROVIDER?.trim();
  if (!name || name === "console") return consoleProvider;
  throw new Error(`unknown SMS_PROVIDER "${name}" (supported: console)`);
}

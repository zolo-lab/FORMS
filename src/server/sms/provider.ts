/**
 * SMS sending behind a small interface. SMS_PROVIDER=sms4free sends through SMS4Free (production only);
 * without it (dev/CI/preview) the console provider only logs.
 */
import { sms4freeProvider } from "./sms4free";

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
  if (name === "sms4free") return sms4freeProvider({ env });
  throw new Error(`unknown SMS_PROVIDER "${name}" (supported: console, sms4free)`);
}

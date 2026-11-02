/**
 * SMS through SMS4Free (sms4free.co.il), ported from the elections app (zolo-lab/elections, src/lib/sms4free.ts)
 * without its delivery-report tracking. One JSON POST with the account's API key, user (the registered mobile)
 * and password, the sender (English letters up to 11, e.g. "FORMS") and the recipient. The answer is
 * {status, message}: a positive status is the number of messages accepted.
 * Credentials come from SMS4FREE_API_KEY / SMS4FREE_USERNAME / SMS4FREE_PASSWORD, the sender from SMS4FREE_SENDER;
 * none of them is ever logged or returned.
 */
import { normalizeIsraeliPhone } from "@/lib/validators/israeli";
import type { SmsProvider, SmsResult } from "./provider";

export const SMS4FREE_SEND_URL = "https://api.sms4free.co.il/ApiSMS/v2/SendSMS";
const KEYS = ["SMS4FREE_API_KEY", "SMS4FREE_USERNAME", "SMS4FREE_PASSWORD", "SMS4FREE_SENDER"] as const;

type Env = Record<string, string | undefined>;

export function sms4freeConfigured(env: Env = process.env): boolean {
  return KEYS.every((k) => !!env[k]?.trim());
}

/** Our recipients are international digits (972501234567); SMS4Free wants the local mobile (0501234567). */
export function toSms4freeMobile(to: string): string | null {
  const d = normalizeIsraeliPhone(to);
  return /^05\d{8}$/.test(d) ? d : null;
}

/** The provider's codes, in Hebrew for the screens. */
const CODES: Record<string, string> = {
  "0": "שגיאה כללית אצל SMS4Free",
  "-1": "מפתח, שם משתמש או סיסמה שגויים",
  "-2": "מזהה שולח לא תקין (שם השולח צריך אישור ב-SMS4Free)",
  "-3": "לא נמצאו נמענים",
  "-4": "יתרת ההודעות בחבילה נמוכה – צריך לרכוש חבילה",
  "-5": "תוכן ההודעה לא מתאים לשליחה",
  "-6": "מספר השולח לא עבר אימות ראשוני (שליחה אחת מדף השליחה באתר שלהם)",
};

function statusText(status: number, message: string): string {
  return CODES[String(status)] ?? (message ? `${message} (קוד ${status})` : `קוד ${status}`);
}

type Attempt = { ok: true } | { ok: false; error: string; retry: boolean };

export interface Sms4freeOptions {
  env?: Env;
  fetchImpl?: typeof fetch;
  /** Waits before the retries of a passing glitch (tests pass zeros). */
  retryWaits?: number[];
  timeoutMs?: number;
}

/**
 * A passing glitch (a 5xx with no answer of theirs, or a network error) is tried again twice, because nothing was
 * accepted. A timeout is NOT retried (the SMS may have gone out; a second try could send it twice), nor any answer
 * of theirs (bad number, balance…).
 */
export function sms4freeProvider(opts: Sms4freeOptions = {}): SmsProvider {
  const env = opts.env ?? process.env;
  const doFetch = opts.fetchImpl ?? fetch;
  const waits = opts.retryWaits ?? [1500, 4000];
  const timeoutMs = opts.timeoutMs ?? 60_000;

  async function sendOnce(phone: string, text: string): Promise<Attempt> {
    const secrets = [env.SMS4FREE_API_KEY!.trim(), env.SMS4FREE_PASSWORD!.trim()];
    try {
      const res = await doFetch(SMS4FREE_SEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          key: secrets[0],
          user: env.SMS4FREE_USERNAME!.trim(),
          pass: secrets[1],
          sender: env.SMS4FREE_SENDER!.trim(),
          recipient: phone,
          msg: text,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      let raw = (await res.text()).slice(0, 300);
      for (const s of secrets) if (s) raw = raw.split(s).join("");
      let status = Number.NaN;
      let message = "";
      try {
        const d = JSON.parse(raw) as { status?: unknown; message?: unknown };
        status = Number(d.status);
        message = typeof d.message === "string" ? d.message : "";
      } catch {
        status = Number(raw.trim());
      }
      if (!res.ok || !Number.isFinite(status) || status <= 0) {
        return {
          ok: false,
          error: `שליחת SMS נכשלה (${res.status}): ${Number.isFinite(status) ? statusText(status, message) : raw.trim() || "תשובה לא מוכרת"}`,
          retry: res.status >= 500 && !Number.isFinite(status),
        };
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? `${e.name} ${e.message}` : "";
      if (/abort|timeout/i.test(msg)) return { ok: false, error: "שליחת SMS נכשלה (timeout)", retry: false };
      return { ok: false, error: "שגיאת רשת מול SMS4Free", retry: true };
    }
  }

  return {
    name: "sms4free",
    async send(to, text): Promise<SmsResult> {
      if (!sms4freeConfigured(env)) return { ok: false, error: "הגדרות SMS4Free חסרות" };
      const phone = toSms4freeMobile(to);
      if (!phone) return { ok: false, error: "מספר נייד לא תקין (נדרש נייד ישראלי)" };
      let last = await sendOnce(phone, text);
      for (const ms of waits) {
        if (last.ok || !last.retry) break;
        console.warn("[sms] SMS4Free glitch, trying again:", last.error);
        if (ms > 0) await new Promise((r) => setTimeout(r, ms));
        last = await sendOnce(phone, text);
      }
      return last.ok ? { ok: true, id: "sms4free" } : { ok: false, error: last.error };
    },
  };
}

import { describe, expect, it, vi } from "vitest";
import { getSmsProvider } from "@/server/sms/provider";
import { SMS4FREE_SEND_URL, sms4freeConfigured, sms4freeProvider, toSms4freeMobile } from "@/server/sms/sms4free";

const ENV = {
  SMS_PROVIDER: "sms4free",
  SMS4FREE_API_KEY: "KEY-123",
  SMS4FREE_USERNAME: "0500000000",
  SMS4FREE_PASSWORD: "PASS-456",
  SMS4FREE_SENDER: "FORMS",
};

const answer = (body: string, status = 200) => new Response(body, { status });

function provider(fetchImpl: typeof fetch, env: Record<string, string | undefined> = ENV) {
  return sms4freeProvider({ env, fetchImpl, retryWaits: [0, 0] });
}

describe("toSms4freeMobile", () => {
  it("turns our international digits into a local mobile", () => {
    expect(toSms4freeMobile("972501234567")).toBe("0501234567");
    expect(toSms4freeMobile("+972-50-123-4567")).toBe("0501234567");
    expect(toSms4freeMobile("050-1234567")).toBe("0501234567");
  });
  it("refuses a landline or garbage", () => {
    expect(toSms4freeMobile("97221234567")).toBeNull();
    expect(toSms4freeMobile("123")).toBeNull();
  });
});

describe("sms4free provider", () => {
  it("is chosen by SMS_PROVIDER=sms4free", () => {
    expect(getSmsProvider(ENV).name).toBe("sms4free");
  });

  it("sends one JSON POST with the sender and the local mobile", async () => {
    const f = vi.fn(async () => answer('{"status":1,"message":"ok"}'));
    const r = await provider(f as unknown as typeof fetch).send("972501234567", "קוד: 123456");
    expect(r).toEqual({ ok: true, id: "sms4free" });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SMS4FREE_SEND_URL);
    expect(JSON.parse(String(init.body))).toMatchObject({ key: "KEY-123", user: "0500000000", pass: "PASS-456", sender: "FORMS", recipient: "0501234567", msg: "קוד: 123456" });
  });

  it("reports missing settings clearly instead of crashing", async () => {
    const f = vi.fn();
    expect(sms4freeConfigured({ ...ENV, SMS4FREE_PASSWORD: " " })).toBe(false);
    const r = await provider(f as unknown as typeof fetch, { ...ENV, SMS4FREE_PASSWORD: undefined }).send("972501234567", "x");
    expect(r).toEqual({ ok: false, error: "הגדרות SMS4Free חסרות" });
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses a non-mobile number without calling the provider", async () => {
    const f = vi.fn();
    const r = await provider(f as unknown as typeof fetch).send("97221234567", "x");
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("explains their negative codes in Hebrew and does not retry them", async () => {
    for (const [code, text] of [
      ["-1", "שגויים"],
      ["-4", "יתרת ההודעות"],
      ["-2", "מזהה שולח"],
    ]) {
      const f = vi.fn(async () => answer(`{"status":${code},"message":""}`));
      const r = await provider(f as unknown as typeof fetch).send("972501234567", "x");
      expect(r.ok).toBe(false);
      expect(r.error).toContain(text);
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it("retries a 503 with no answer of theirs, then succeeds", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(answer("upstream connect error", 503))
      .mockResolvedValueOnce(answer('{"status":1}'));
    const r = await provider(f as unknown as typeof fetch).send("972501234567", "x");
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("gives up after two retries of a network error", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const r = await provider(f as unknown as typeof fetch).send("972501234567", "x");
    expect(r).toEqual({ ok: false, error: "שגיאת רשת מול SMS4Free" });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("does not retry a timeout (the SMS may have gone out)", async () => {
    const f = vi.fn().mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    const r = await provider(f as unknown as typeof fetch).send("972501234567", "x");
    expect(r).toEqual({ ok: false, error: "שליחת SMS נכשלה (timeout)" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("never returns the key or the password in an error", async () => {
    const f = vi.fn(async () => answer("bad request for KEY-123 / PASS-456", 400));
    const r = await provider(f as unknown as typeof fetch).send("972501234567", "x");
    expect(r.ok).toBe(false);
    expect(r.error).not.toContain("KEY-123");
    expect(r.error).not.toContain("PASS-456");
  });
});

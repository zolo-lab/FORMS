import { describe, expect, it } from "vitest";
import { isSafeWebhookUrl, parseEvents, toWebhookEvent } from "@/lib/webhooks/events";
import { signFileLink, signWebhook, verifyFileLink, verifyWebhook, webhookHeaders } from "@/lib/webhooks/sign";

describe("webhook signature", () => {
  const body = JSON.stringify({ hello: "עולם" });
  it("headers verify with the shared secret", () => {
    const now = Date.UTC(2026, 9, 14, 12, 0, 0);
    const h = webhookHeaders("s3cret", body, "request.completed", "d1", now);
    expect(h["x-forms-event"]).toBe("request.completed");
    expect(verifyWebhook("s3cret", { timestamp: h["x-forms-timestamp"]!, signature: h["x-forms-signature"]! }, body, now)).toBe(true);
  });
  it("rejects a wrong secret, a tampered body and a stale timestamp", () => {
    const now = Date.UTC(2026, 9, 14, 12, 0, 0);
    const h = webhookHeaders("s3cret", body, "x", "d", now);
    const sig = { timestamp: h["x-forms-timestamp"]!, signature: h["x-forms-signature"]! };
    expect(verifyWebhook("other", sig, body, now)).toBe(false);
    expect(verifyWebhook("s3cret", sig, body + " ", now)).toBe(false);
    expect(verifyWebhook("s3cret", sig, body, now + 10 * 60_000)).toBe(false);
  });
  it("the signature binds the timestamp", () => {
    expect(signWebhook("k", 1, "b")).not.toBe(signWebhook("k", 2, "b"));
  });
});

describe("temporary file links", () => {
  it("verify until they expire and only for their document", () => {
    const exp = Math.floor(Date.UTC(2026, 9, 15) / 1000);
    const sig = signFileLink("k", "doc-1", exp);
    expect(verifyFileLink("k", "doc-1", exp, sig, Date.UTC(2026, 9, 14))).toBe(true);
    expect(verifyFileLink("k", "doc-2", exp, sig, Date.UTC(2026, 9, 14))).toBe(false);
    expect(verifyFileLink("k", "doc-1", exp, sig, Date.UTC(2026, 9, 16))).toBe(false);
    expect(verifyFileLink("", "doc-1", exp, sig, Date.UTC(2026, 9, 14))).toBe(false);
  });
});

describe("events and urls", () => {
  it("maps engine events and ignores the others", () => {
    expect(toWebhookEvent("request_completed")).toBe("request.completed");
    expect(toWebhookEvent("step_completed")).toBe("step.completed");
    expect(toWebhookEvent("request_declined")).toBe("request.declined");
    expect(toWebhookEvent("step_opened")).toBeNull();
    expect(parseEvents(["request.completed", "bogus"])).toEqual(["request.completed"]);
  });
  it("accepts public https URLs only", () => {
    expect(isSafeWebhookUrl("https://hook.eu1.make.com/abc")).toBe(true);
    expect(isSafeWebhookUrl("http://hook.example.com")).toBe(false);
    expect(isSafeWebhookUrl("https://localhost/x")).toBe(false);
    expect(isSafeWebhookUrl("https://127.0.0.1/x")).toBe(false);
    expect(isSafeWebhookUrl("https://192.168.1.5/x")).toBe(false);
    expect(isSafeWebhookUrl("https://172.20.0.1/x")).toBe(false);
    expect(isSafeWebhookUrl("not a url")).toBe(false);
  });
});

/** Webhook signing (pure). The receiver recomputes HMAC-SHA256 over `${timestamp}.${body}` with the shared secret. */
import { createHmac, timingSafeEqual } from "node:crypto";

export function signWebhook(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function webhookHeaders(secret: string, body: string, event: string, deliveryId: string, now = Date.now()): Record<string, string> {
  const ts = Math.floor(now / 1000);
  return {
    "content-type": "application/json",
    "x-forms-event": event,
    "x-forms-delivery": deliveryId,
    "x-forms-timestamp": String(ts),
    "x-forms-signature": `sha256=${signWebhook(secret, ts, body)}`,
  };
}

/** For receivers (and our tests): constant-time check, rejecting timestamps older than `toleranceSec`. */
export function verifyWebhook(secret: string, headers: { timestamp: string; signature: string }, body: string, nowMs = Date.now(), toleranceSec = 300): boolean {
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > toleranceSec) return false;
  const expected = Buffer.from(signWebhook(secret, ts, body), "hex");
  const got = Buffer.from(headers.signature.replace(/^sha256=/, ""), "hex");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Temporary download link for a final PDF: `${docId}.${exp}` signed with the server secret. */
export function signFileLink(secret: string, docId: string, expiresAtSec: number): string {
  return createHmac("sha256", secret).update(`file:${docId}.${expiresAtSec}`).digest("hex");
}

export function verifyFileLink(secret: string, docId: string, expiresAtSec: number, sig: string, nowMs = Date.now()): boolean {
  if (!secret || !Number.isFinite(expiresAtSec) || expiresAtSec * 1000 < nowMs) return false;
  const expected = Buffer.from(signFileLink(secret, docId, expiresAtSec), "hex");
  const got = Buffer.from(sig, "hex");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

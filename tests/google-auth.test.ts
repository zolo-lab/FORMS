import { describe, expect, it } from "vitest";
import { buildAuthUrl, checkIdTokenClaims, decodeJwtPayload, googleConfigured, isAllowedEmail, parseEmailList, safeNext } from "@/lib/auth/google";
import { createSessionToken, createUserSessionToken, sessionEmail, verifySessionToken } from "@/lib/auth/session";

const good = { iss: "https://accounts.google.com", aud: "cid", exp: 2000, nonce: "n1", email: "A@B.org", email_verified: true, name: "דנה" };
const o = { clientId: "cid", nonce: "n1", now: 1_000_000 };

describe("buildAuthUrl", () => {
  it("carries client, redirect, state, nonce and openid scope", () => {
    const u = new URL(buildAuthUrl({ clientId: "cid", redirectUri: "https://x.test/cb", state: "s", nonce: "n" }));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("redirect_uri")).toBe("https://x.test/cb");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("scope")).toContain("openid");
    expect(u.searchParams.get("state")).toBe("s");
    expect(u.searchParams.get("nonce")).toBe("n");
  });
});

describe("checkIdTokenClaims", () => {
  it("accepts good claims and lower-cases the email", () => {
    expect(checkIdTokenClaims(good, o)).toEqual({ ok: true, email: "a@b.org", name: "דנה" });
  });
  it.each([
    ["bad_issuer", { iss: "https://evil.test" }],
    ["bad_audience", { aud: "other" }],
    ["expired", { exp: 100 }],
    ["bad_nonce", { nonce: "zzz" }],
    ["no_email", { email: "" }],
    ["email_not_verified", { email_verified: false }],
  ])("rejects %s", (reason, patch) => {
    expect(checkIdTokenClaims({ ...good, ...patch }, o)).toEqual({ ok: false, reason });
  });
  it("rejects non-objects", () => {
    expect(checkIdTokenClaims(null, o)).toEqual({ ok: false, reason: "bad_token" });
  });
});

describe("decodeJwtPayload", () => {
  it("decodes the middle part, and returns null on garbage", () => {
    const p = Buffer.from(JSON.stringify({ a: 1 })).toString("base64url");
    expect(decodeJwtPayload(`h.${p}.s`)).toEqual({ a: 1 });
    expect(decodeJwtPayload("nope")).toBeNull();
    expect(decodeJwtPayload("h.!!!.s")).toBeNull();
  });
});

describe("allowlist", () => {
  it("parses separators and case", () => {
    expect(parseEmailList(" A@x.org, b@y.org;\n@Z.org ")).toEqual(["a@x.org", "b@y.org", "@z.org"]);
    expect(parseEmailList(undefined)).toEqual([]);
  });
  it("matches exact addresses and domains, nothing else", () => {
    const l = ["a@x.org", "@z.org"];
    expect(isAllowedEmail("A@x.org", l)).toBe(true);
    expect(isAllowedEmail("q@z.org", l)).toBe(true);
    expect(isAllowedEmail("q@evilz.org", l)).toBe(false);
    expect(isAllowedEmail("b@x.org", l)).toBe(false);
    expect(isAllowedEmail("a@x.org", [])).toBe(false);
  });
});

describe("safeNext / googleConfigured", () => {
  it("only follows same-site paths", () => {
    expect(safeNext("/admin/x")).toBe("/admin/x");
    expect(safeNext("//evil.test")).toBe("/admin/requests");
    expect(safeNext("https://evil.test")).toBe("/admin/requests");
    expect(safeNext("/\\evil")).toBe("/admin/requests");
    expect(safeNext(null)).toBe("/admin/requests");
  });
  it("needs id and secret", () => {
    expect(googleConfigured({ GOOGLE_CLIENT_ID: "a" })).toBe(false);
    expect(googleConfigured({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" })).toBe(true);
  });
});

describe("user session token", () => {
  const secret = "s3cret";
  it("round-trips the email and verifies", async () => {
    const t = await createUserSessionToken(secret, "A@B.org", 1000);
    expect(await verifySessionToken(secret, t, 2000)).toBe(true);
    expect(await sessionEmail(secret, t, 2000)).toBe("a@b.org");
  });
  it("rejects expiry, wrong secret and a swapped email", async () => {
    const t = await createUserSessionToken(secret, "a@b.org", 1000);
    expect(await sessionEmail(secret, t, 1000 + 13 * 3600_000)).toBeNull();
    expect(await sessionEmail("other", t, 2000)).toBeNull();
    const [exp, , sig] = t.split(".");
    const forged = `${exp}.${Buffer.from("boss@b.org").toString("base64url")}.${sig}`;
    expect(await verifySessionToken(secret, forged, 2000)).toBe(false);
  });
  it("keeps the password session valid, with no email", async () => {
    const t = await createSessionToken(secret, 1000);
    expect(await verifySessionToken(secret, t, 2000)).toBe(true);
    expect(await sessionEmail(secret, t, 2000)).toBeNull();
  });
});

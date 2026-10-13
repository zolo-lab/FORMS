import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES, afterAttempt, renderTemplate, renderDefault, MAX_ATTEMPTS } from "@/lib/notifications/templates";

describe("renderTemplate", () => {
  it("replaces known variables, tolerating spaces", () => {
    expect(renderTemplate("שלום {{name}}, {{ link }}", { name: "דנה", link: "https://x/s/1" })).toBe("שלום דנה, https://x/s/1");
  });
  it("replaces missing variables with an empty string, never the raw placeholder", () => {
    expect(renderTemplate("עד {{dueDate}}.", {})).toBe("עד .");
  });
  it("does not re-expand placeholders inside values", () => {
    expect(renderTemplate("{{name}}", { name: "{{link}}", link: "SECRET" })).toBe("{{link}}");
  });
});

describe("default templates", () => {
  const keys = ["step_invite", "reminder", "completed", "declined", "returned", "otp"];
  it("has an email template for every key, with subject and body", () => {
    for (const k of keys) {
      const t = DEFAULT_TEMPLATES[k];
      expect(t, k).toBeTruthy();
      expect(t!.subject.length).toBeGreaterThan(0);
      expect(t!.body.length).toBeGreaterThan(0);
    }
  });
  it("invite carries name, org and link", () => {
    const m = renderDefault("step_invite", { name: "דנה כהן", org: "פנימה", link: "https://x/s/abc" });
    expect(m.subject).toContain("פנימה");
    expect(m.body).toContain("דנה כהן");
    expect(m.body).toContain("https://x/s/abc");
  });
  it("otp carries the code", () => {
    expect(renderDefault("otp", { code: "123456" }).body).toContain("123456");
  });
  it("throws on an unknown key", () => {
    expect(() => renderDefault("nope", {})).toThrow();
  });
});

describe("afterAttempt", () => {
  it("success → sent", () => {
    expect(afterAttempt(0, true)).toEqual({ status: "sent", attempts: 1 });
  });
  it("failure keeps it queued until the third attempt", () => {
    expect(afterAttempt(0, false)).toEqual({ status: "queued", attempts: 1 });
    expect(afterAttempt(1, false)).toEqual({ status: "queued", attempts: 2 });
    expect(afterAttempt(MAX_ATTEMPTS - 1, false)).toEqual({ status: "failed", attempts: MAX_ATTEMPTS });
  });
});

describe("realMailAllowed", () => {
  it("allows local runs (no VERCEL_ENV) and production, blocks preview/development unless forced", async () => {
    const { realMailAllowed } = await import("@/server/notifications");
    const save = { v: process.env.VERCEL_ENV, a: process.env.ALLOW_REAL_EMAIL };
    try {
      delete process.env.ALLOW_REAL_EMAIL;
      process.env.VERCEL_ENV = "preview";
      expect(realMailAllowed()).toBe(false);
      process.env.VERCEL_ENV = "development";
      expect(realMailAllowed()).toBe(false);
      process.env.VERCEL_ENV = "production";
      expect(realMailAllowed()).toBe(true);
      process.env.VERCEL_ENV = "preview";
      process.env.ALLOW_REAL_EMAIL = "1";
      expect(realMailAllowed()).toBe(true);
    } finally {
      if (save.v === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = save.v;
      if (save.a === undefined) delete process.env.ALLOW_REAL_EMAIL; else process.env.ALLOW_REAL_EMAIL = save.a;
    }
  });
});

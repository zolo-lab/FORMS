import { describe, expect, it } from "vitest";
import { devLoginAllows, devLoginEnabled, devLoginGroup } from "@/lib/auth/dev-login";

describe("test login screen", () => {
  const real = { email: "secretary@misrad.org.il", active: true };
  const demo = { email: "dana@demo.test", active: true };

  it("is off unless open mode or demo login is on", () => {
    expect(devLoginEnabled({})).toBe(false);
    expect(devLoginEnabled({ AUTH_DISABLED: "1" })).toBe(true);
    expect(devLoginEnabled({ DEMO_LOGIN: "1" })).toBe(true);
  });

  it("offers every active user in open mode", () => {
    expect(devLoginAllows(real, { AUTH_DISABLED: "1" })).toBe(true);
    expect(devLoginAllows({ ...real, active: false }, { AUTH_DISABLED: "1" })).toBe(false);
  });

  it("offers only demo addresses once open mode is off", () => {
    expect(devLoginAllows(real, { DEMO_LOGIN: "1" })).toBe(false);
    expect(devLoginAllows(demo, { DEMO_LOGIN: "1" })).toBe(true);
    expect(devLoginAllows(demo, {})).toBe(false);
  });

  it("groups users by what they do", () => {
    expect(devLoginGroup({ role: "admin" })).toBe("admin");
    expect(devLoginGroup({ role: "manager", grants: { trackOnly: true } })).toBe("track");
    expect(devLoginGroup({ role: "manager", grants: {} })).toBe("manager");
  });
});

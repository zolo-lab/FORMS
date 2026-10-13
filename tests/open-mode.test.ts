import { describe, expect, it } from "vitest";
import { authDisabled } from "@/lib/auth/open-mode";

describe("open mode", () => {
  it("is off unless AUTH_DISABLED is exactly 1", () => {
    expect(authDisabled({})).toBe(false);
    expect(authDisabled({ AUTH_DISABLED: "true" })).toBe(false);
    expect(authDisabled({ AUTH_DISABLED: "1" })).toBe(true);
  });
});

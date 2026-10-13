import { describe, expect, it } from "vitest";
import { delegateError } from "@/lib/workflow/delegate";

describe("delegateError", () => {
  it("accepts a name with email or phone", () => {
    expect(delegateError({ name: "דנה", email: "d@example.org" })).toBeNull();
    expect(delegateError({ name: "דנה", phone: "050-123-4567" })).toBeNull();
  });
  it("needs a name and a way to reach the person", () => {
    expect(delegateError({ name: " " })).toBe("name_required");
    expect(delegateError({ name: "דנה" })).toBe("contact_required");
  });
  it("rejects malformed contact details", () => {
    expect(delegateError({ name: "דנה", email: "nope" })).toBe("bad_email");
    expect(delegateError({ name: "דנה", phone: "abc" })).toBe("bad_phone");
  });
});

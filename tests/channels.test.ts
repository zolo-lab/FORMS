import { describe, expect, it } from "vitest";
import { deliveryTargets } from "@/lib/notifications/channels";

describe("deliveryTargets", () => {
  it("sends to both email and SMS when both are known", () => {
    expect(deliveryTargets({ email: "a@x.org", phone: "050-1234567" })).toEqual([
      { channel: "email", to: "a@x.org" },
      { channel: "sms", to: "972501234567" },
    ]);
  });
  it("email only / SMS only", () => {
    expect(deliveryTargets({ email: "a@x.org" })).toEqual([{ channel: "email", to: "a@x.org" }]);
    expect(deliveryTargets({ phone: "+972501234567" })).toEqual([{ channel: "sms", to: "972501234567" }]);
  });
  it("ignores blanks and an invalid phone", () => {
    expect(deliveryTargets({ email: " ", phone: "123" })).toEqual([]);
    expect(deliveryTargets({})).toEqual([]);
    expect(deliveryTargets({ email: "a@x.org", phone: "abc" })).toEqual([{ channel: "email", to: "a@x.org" }]);
  });
  it("trims the email", () => {
    expect(deliveryTargets({ email: " a@x.org " })).toEqual([{ channel: "email", to: "a@x.org" }]);
  });
});

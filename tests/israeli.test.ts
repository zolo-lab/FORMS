import { describe, expect, it } from "vitest";
import { formatIsraeliPhone, isValidBankAccount, isValidIsraeliId, isValidIsraeliPhone } from "@/lib/validators/israeli";

describe("isValidIsraeliId", () => {
  it.each(["000000018", "18", "123456782", "039337423"])("valid %s", (id) => expect(isValidIsraeliId(id)).toBe(true));
  it.each(["123456789", "000000000", "12345678a", "1234567890", ""])("invalid %s", (id) => expect(isValidIsraeliId(id)).toBe(false));
});

describe("phones", () => {
  it.each(["050-1234567", "0501234567", "+972501234567", "02-6234567", "077-1234567"])("valid %s", (p) => expect(isValidIsraeliPhone(p)).toBe(true));
  it.each(["12345", "0601234567", "05012345"])("invalid %s", (p) => expect(isValidIsraeliPhone(p)).toBe(false));
  it("formats mobile", () => expect(formatIsraeliPhone("+972501234567")).toBe("050-1234567"));
});

describe("bank account", () => {
  it("valid", () => expect(isValidBankAccount({ bank: "10", branch: "912", account: "12-345678" })).toBe(true));
  it("invalid", () => expect(isValidBankAccount({ bank: "10", branch: "", account: "1" })).toBe(false));
});

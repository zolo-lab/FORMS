import { describe, expect, it } from "vitest";
import { getSmsProvider } from "@/server/sms/provider";

describe("getSmsProvider", () => {
  it("defaults to the console provider, which never sends", async () => {
    const p = getSmsProvider({});
    expect(p.name).toBe("console");
    expect(await p.send("972501234567", "שלום")).toEqual({ ok: true, id: "console" });
  });
  it("rejects an unknown provider name instead of silently dropping messages", () => {
    expect(() => getSmsProvider({ SMS_PROVIDER: "nope" })).toThrow(/nope/);
  });
});

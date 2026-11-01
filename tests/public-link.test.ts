import { describe, expect, it } from "vitest";
import { parseFiller, publicFillPath, publicStart } from "@/lib/forms/public-link";

describe("form's public link", () => {
  it("is /f/<form id>", () => {
    expect(publicFillPath("abc")).toBe("/f/abc");
  });

  it("opens on the sender or the employee, not on someone else's step", () => {
    expect(publicStart([{ role: "requester" }, { role: "employee" }])).toEqual({ ok: true, role: "requester" });
    expect(publicStart([{ role: "employee" }, { role: "approver" }])).toEqual({ ok: true, role: "employee" });
    expect(publicStart([{ role: "approver" }])).toEqual({ ok: false, reason: "first_step_is_someone" });
    expect(publicStart([])).toEqual({ ok: false, reason: "no_steps" });
  });

  it("needs a name and a valid e-mail from whoever opens it", () => {
    expect(parseFiller({ name: " דנה ", email: "Dana@Example.test " })).toEqual({ ok: true, name: "דנה", email: "dana@example.test" });
    expect(parseFiller({ name: "", email: "a@b.co" })).toEqual({ ok: false, error: "name" });
    expect(parseFiller({ name: "דנה", email: "nope" })).toEqual({ ok: false, error: "email" });
  });
});

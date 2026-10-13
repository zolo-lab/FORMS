import { describe, expect, it } from "vitest";
import { PAGE_SIZE, daysSince, nearestDue, eventLabel, filtersToQuery, median, parseFilters, progress } from "@/lib/requests/list";

const UUID = "11111111-2222-3333-4444-555555555555";

describe("parseFilters", () => {
  it("returns defaults for an empty query", () => {
    expect(parseFilters({})).toEqual({ page: 1 });
  });
  it("accepts valid values and ignores invalid ones", () => {
    const f = parseFilters({ org: UUID, status: "in_progress", role: "approver", pkg: "nope", from: "2026-10-01", to: "bad", overdue: "1", q: "  דנה ", page: "3" });
    expect(f).toEqual({ org: UUID, status: "in_progress", role: "approver", from: "2026-10-01", overdue: true, q: "דנה", page: 3 });
  });
  it("clamps nonsense pages to 1 and takes the first of repeated params", () => {
    expect(parseFilters({ page: "-4" }).page).toBe(1);
    expect(parseFilters({ page: "abc" }).page).toBe(1);
    expect(parseFilters({ status: ["completed", "draft"] }).status).toBe("completed");
  });
});

describe("filtersToQuery", () => {
  it("round-trips and omits defaults", () => {
    const f = parseFilters({ org: UUID, overdue: "1", page: "2", q: "דנה כהן" });
    const qs = filtersToQuery(f);
    expect(parseFilters(Object.fromEntries(new URLSearchParams(qs)))).toEqual(f);
    expect(filtersToQuery({ page: 1 })).toBe("");
  });
  it("can reset the page when a filter changes", () => {
    expect(filtersToQuery({ page: 4, status: "completed" }, { page: 1 })).toBe("status=completed");
  });
});

describe("progress / daysSince / median", () => {
  it("counts completed and skipped steps as done", () => {
    expect(progress([{ status: "completed" }, { status: "skipped" }, { status: "active" }, { status: "pending" }])).toEqual({ done: 2, total: 4 });
    expect(progress([])).toEqual({ done: 0, total: 0 });
  });
  it("counts whole days", () => {
    expect(daysSince(new Date("2026-10-10T08:00:00Z"), new Date("2026-10-13T07:00:00Z"))).toBe(2);
    expect(daysSince(new Date("2026-10-14T00:00:00Z"), new Date("2026-10-13T00:00:00Z"))).toBe(0);
  });
  it("median handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("eventLabel", () => {
  it("has Hebrew text for every event type the engine writes", () => {
    const types = ["request_created", "request_sent", "request_completed", "request_declined", "request_cancelled", "request_expired", "step_activated", "step_opened", "step_saved", "step_completed", "step_declined", "step_returned", "step_delegated", "step_skipped", "step_expired", "otp_sent", "otp_verified", "request_extended", "step_assignee_changed"];
    for (const t of types) expect(eventLabel(t, {}), t).toMatch(/[א-ת]/);
  });
  it("includes the reason or role when the payload has one", () => {
    expect(eventLabel("step_declined", { reason: "חסר מסמך" })).toContain("חסר מסמך");
    expect(eventLabel("step_activated", { role: "approver" })).toContain("מאשר");
  });
  it("falls back to the raw type for unknown events", () => {
    expect(eventLabel("something_new", {})).toBe("something_new");
  });
  it("page size is sane", () => {
    expect(PAGE_SIZE).toBeGreaterThanOrEqual(10);
  });
});

describe("board columns", () => {
  const row = (id: string, status: string, roles: string[] = []) => ({ id, status, waitingFor: roles.map((role) => ({ role })) });
  it("groups by waiting role, then idle, completed and stopped", async () => {
    const { boardColumns } = await import("@/lib/requests/list");
    const cols = boardColumns([
      row("a", "in_progress", ["employee"]),
      row("b", "in_progress", ["approver", "payroll"]),
      row("c", "in_progress", ["employee"]),
      row("d", "draft"),
      row("e", "completed"),
      row("f", "cancelled"),
    ]);
    expect(cols.map((c) => [c.key, c.rows.map((r) => r.id)])).toEqual([
      ["employee", ["a", "c"]],
      ["approver", ["b"]],
      ["payroll", ["b"]],
      ["idle", ["d"]],
      ["completed", ["e"]],
      ["stopped", ["f"]],
    ]);
  });
  it("parses and writes the view param", async () => {
    const { parseFilters, filtersToQuery } = await import("@/lib/requests/list");
    expect(parseFilters({ view: "board" }).view).toBe("board");
    expect(parseFilters({ view: "x" }).view).toBeUndefined();
    expect(filtersToQuery({ page: 1, view: "board" })).toBe("view=board");
  });
});

describe("nearestDue", () => {
  it("returns the earliest date, ignoring steps without a due date", () => {
    const a = new Date("2026-10-15T10:00:00Z");
    const b = new Date("2026-10-14T10:00:00Z");
    expect(nearestDue([a, null, b])).toEqual(b);
    expect(nearestDue([null, null])).toBeNull();
    expect(nearestDue([])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { ariaSort, filtersToQuery, nextSort, parseFilters } from "@/lib/requests/list";

describe("requests table sorting", () => {
  it("parses only known columns, direction only with a column", () => {
    expect(parseFilters({ sort: "name", dir: "desc" })).toMatchObject({ sort: "name", dir: "desc" });
    expect(parseFilters({ sort: "drop table" }).sort).toBeUndefined();
    expect(parseFilters({ dir: "asc" }).dir).toBeUndefined();
  });

  it("round-trips through the query string", () => {
    expect(filtersToQuery({ page: 1, sort: "due", dir: "asc" })).toBe("sort=due&dir=asc");
  });

  it("default is newest first; clicking flips, a new column starts ascending (dates descending)", () => {
    expect(ariaSort({}, "created")).toBe("descending");
    expect(ariaSort({}, "name")).toBe("none");
    expect(nextSort({}, "created")).toEqual({ sort: "created", dir: "asc" });
    expect(nextSort({}, "name")).toEqual({ sort: "name", dir: "asc" });
    expect(nextSort({ sort: "name", dir: "asc" }, "name")).toEqual({ sort: "name", dir: "desc" });
    expect(nextSort({ sort: "name" }, "due")).toEqual({ sort: "due", dir: "desc" });
    expect(ariaSort({ sort: "name" }, "name")).toBe("ascending");
  });
});

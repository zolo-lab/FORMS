import { describe, expect, it } from "vitest";
import { splitPasted } from "@/lib/lists/kinds";

describe("splitPasted", () => {
  it("splits an Excel column (and a row of cells) into options", () => {
    expect(splitPasted("עגבניה\r\nמלפפון\r\n\r\nעגבניה\r\n")).toEqual(["עגבניה", "מלפפון"]);
    expect(splitPasted("א\tב  ג")).toEqual(["א", "ב ג"]);
    expect(splitPasted("שורה אחת")).toEqual(["שורה אחת"]);
  });
});

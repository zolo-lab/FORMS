import { describe, expect, it } from "vitest";
import { describePath, resolveFileName, resolvePath } from "@/lib/processing/path";

const ctx = {
  organization: "שיבת ציון",
  project: "פנימה",
  form: "קליטת עובד",
  type: "101",
  subject: "דנה כהן",
  idNumber: "123456782",
  signedAt: new Date("2026-03-07T12:00:00Z"),
  requestId: "41306ebf-c7a2-4032-b9ef-571902b0ddbf",
  answers: { cost_center: "מחלקת חינוך", empty: "" },
};

describe("resolvePath", () => {
  it("fills the variables and splits on slashes", () => {
    expect(resolvePath("שכר {עמותה}/{שנה}/101_{שנה}", ctx).segments).toEqual(["שכר שיבת ציון", "2026", "101_2026"]);
  });

  it("knows the date parts, in Israel time", () => {
    expect(resolvePath("{שנה}/{חודש}/{תאריך}", ctx).segments).toEqual(["2026", "03", "2026-03-07"]);
  });

  it("takes a value from an answer", () => {
    expect(resolvePath("{שדה:cost_center}", ctx).segments).toEqual(["מחלקת חינוך"]);
  });

  it("strips the dashes from an id number and shortens the request id", () => {
    expect(resolvePath('{ת"ז}/{מספר בקשה}', { ...ctx, idNumber: "12-345-6782" }).segments).toEqual(["123456782", "41306ebf"]);
  });

  it("reports a variable it does not know instead of inventing a folder", () => {
    const r = resolvePath("{עמותה}/{שטויות}", ctx);
    expect(r.unknown).toEqual(["שטויות"]);
    expect(r.segments).toEqual(["שיבת ציון"]);
  });

  it("reports a known variable that has no value, and never writes an empty folder", () => {
    const r = resolvePath("{עמותה}/{פרויקט}/{שנה}", { ...ctx, project: undefined });
    expect(r.missing).toEqual(["פרויקט"]);
    expect(r.segments).toEqual(["שיבת ציון", "2026"]);
  });

  it("treats an empty answer as missing", () => {
    expect(resolvePath("{שדה:empty}", ctx).missing).toEqual(["שדה:empty"]);
  });

  it("makes every segment safe for Drive", () => {
    const r = resolvePath("{עמותה}", { ...ctx, organization: 'שיבת/ציון: "א"' });
    expect(r.segments[0]).not.toMatch(/[/:"]/);
  });

  it("drops empty segments from doubled or trailing slashes", () => {
    expect(resolvePath("a//b/", ctx).segments).toEqual(["a", "b"]);
  });

  it("survives an empty template", () => {
    expect(resolvePath("", ctx)).toEqual({ segments: [], unknown: [], missing: [] });
  });
});

describe("resolveFileName", () => {
  it("uses the default when none is given", () => {
    expect(resolveFileName(undefined, ctx)).toBe("101 - דנה כהן 123456782.pdf");
  });

  it("uses a template, and never doubles the extension", () => {
    expect(resolveFileName("{סוג}_{עובד}", ctx)).toBe("101_דנה כהן.pdf");
    expect(resolveFileName("{סוג}.pdf", ctx)).toBe("101.pdf");
  });

  it("never writes a slash into a file name", () => {
    expect(resolveFileName("{עמותה}/{סוג}", ctx)).not.toMatch(/\//);
  });

  it("falls back to a name rather than producing '.pdf'", () => {
    expect(resolveFileName("{פרויקט}", { signedAt: ctx.signedAt })).toBe("מסמך.pdf");
  });
});

describe("describePath", () => {
  it("shows what the template becomes", () => {
    expect(describePath("שכר {עמותה}/{שנה}", ctx)).toBe("שכר שיבת ציון / 2026");
  });

  it("names a missing value without hiding the rest", () => {
    expect(describePath("{עמותה}/{פרויקט}", { ...ctx, project: undefined })).toBe("שיבת ציון (חסר ערך ל-{פרויקט})");
  });

  it("leads with an unknown variable, which is a mistake to fix", () => {
    expect(describePath("{עמותה}/{שטויות}", ctx)).toBe("משתנה לא מוכר: {שטויות}");
  });

  it("says when nothing is left", () => {
    expect(describePath("", ctx)).toBe("הנתיב ריק");
  });
});

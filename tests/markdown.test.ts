import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Markdown } from "@/components/forms/Markdown";
import { parseInline, parseMarkdown } from "@/lib/forms/markdown";
import { pipeText } from "@/lib/forms/piping";
import { parseFormDefinition } from "@/lib/forms/schema";

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe("markdown subset", () => {
  it("parses bold, italic and links", () => {
    expect(parseInline("a **b** *c* [d](https://x.co)")).toEqual([
      { t: "text", v: "a " },
      { t: "bold", c: [{ t: "text", v: "b" }] },
      { t: "text", v: " " },
      { t: "italic", c: [{ t: "text", v: "c" }] },
      { t: "text", v: " " },
      { t: "link", href: "https://x.co", c: [{ t: "text", v: "d" }] },
    ]);
  });

  it("builds paragraphs and lists", () => {
    const b = parseMarkdown("שלום\nעולם\n\n- אחד\n- שניים\n\n1. א\n2. ב");
    expect(b.map((x) => x.t)).toEqual(["p", "ul", "ol"]);
    expect(html("- אחד\n- שניים")).toBe("<div><ul class=\"mb-2 list-disc ps-5 last:mb-0\"><li>אחד</li><li>שניים</li></ul></div>");
  });

  it("does not let scripts or unsafe links through", () => {
    const out = html('<script>alert(1)</script> [x](javascript:alert(1)) [ok](https://a.co) **<img src=x onerror=alert(1)>**');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain('href="https://a.co"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("leaves unclosed markers as text", () => {
    expect(html("2 * 3 = 6 ו-**לא נסגר")).toContain("2 * 3 = 6");
  });
});

describe("answer piping", () => {
  const def = parseFormDefinition({
    schemaVersion: 1, title: "t",
    pages: [{ id: "p", title: "", fields: [
      { id: "firstName", type: "short_text", label: "שם" },
      { id: "status", type: "radio", label: "מצב", options: [{ value: "single", label: "רווק/ה" }] },
    ] }],
  }).data!;

  it("inserts formatted answers and blanks unknown ones", () => {
    expect(pipeText("שלום {{firstName}}!", { firstName: "דנה" }, def)).toBe("שלום דנה!");
    expect(pipeText("מצב: {{ status }}", { status: "single" }, def)).toBe("מצב: רווק/ה");
    expect(pipeText("{{nope}}x{{firstName}}", {}, def)).toBe("x");
    expect(pipeText("no tokens", {}, def)).toBe("no tokens");
  });
});

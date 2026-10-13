/**
 * A deliberately tiny Markdown subset for explanation text: **bold**, *italic*, [link](https://…), "- " / "1. " lists,
 * blank line = new paragraph, single newline = line break. Output is a node tree (never HTML strings), so
 * rendering through React cannot inject markup or scripts; unsafe link targets degrade to plain text.
 */
export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; c: Inline[] }
  | { t: "italic"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "br" };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] };

const SAFE_URL = /^(https?:\/\/|mailto:|tel:)/i;

export function safeHref(url: string): string | null {
  const u = url.trim();
  return SAFE_URL.test(u) ? u : null;
}

/** Parse inline markup. Unclosed markers stay as literal text. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("**", i)) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: "bold", c: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if ((src[i] === "*" || src[i] === "_") && src[i + 1] !== " " && src[i + 1] !== undefined) {
      const m = src[i]!;
      const end = src.indexOf(m, i + 1);
      if (end > i + 1 && src[end - 1] !== " ") {
        flush();
        out.push({ t: "italic", c: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (src[i] === "[") {
      const close = src.indexOf("](", i);
      const endUrl = close > 0 ? src.indexOf(")", close + 2) : -1;
      if (close > i && endUrl > close) {
        const label = src.slice(i + 1, close);
        const href = safeHref(src.slice(close + 2, endUrl));
        flush();
        if (href) out.push({ t: "link", href, c: parseInline(label) });
        else out.push({ t: "text", v: label }); // unsafe target: keep the words, drop the link
        i = endUrl + 1;
        continue;
      }
    }
    if (src[i] === "\n") {
      flush();
      out.push({ t: "br" });
      i++;
      continue;
    }
    buf += src[i];
    i++;
  }
  flush();
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const paragraphs = src.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/);
  for (const para of paragraphs) {
    if (!para.trim()) continue;
    const lines = para.split("\n");
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      blocks.push({ t: "ul", items: lines.map((l) => parseInline(l.replace(/^\s*[-*•]\s+/, ""))) });
    } else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      blocks.push({ t: "ol", items: lines.map((l) => parseInline(l.replace(/^\s*\d+[.)]\s+/, ""))) });
    } else {
      blocks.push({ t: "p", c: parseInline(para) });
    }
  }
  return blocks;
}

import { parseMarkdown, type Inline } from "@/lib/forms/markdown";

function renderInline(nodes: Inline[]): React.ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text": return n.v;
      case "bold": return <strong key={i}>{renderInline(n.c)}</strong>;
      case "italic": return <em key={i}>{renderInline(n.c)}</em>;
      case "link": return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{renderInline(n.c)}</a>;
      case "br": return <br key={i} />;
    }
  });
}

/** Renders the limited Markdown subset as React elements (no raw HTML is ever injected). */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {parseMarkdown(text).map((b, i) =>
        b.t === "p" ? <p key={i} className="mb-2 last:mb-0">{renderInline(b.c)}</p>
        : b.t === "ul" ? <ul key={i} className="mb-2 list-disc ps-5 last:mb-0">{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ul>
        : <ol key={i} className="mb-2 list-decimal ps-5 last:mb-0">{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ol>,
      )}
    </div>
  );
}

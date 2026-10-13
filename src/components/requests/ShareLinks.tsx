"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { whatsappUrl } from "@/lib/whatsapp";

export interface ShareLinkView {
  stepId: string;
  roleLabel: string;
  who: string;
  url: string;
  message: string;
  phone?: string;
}

/** Copy-link and WhatsApp buttons for each outside signer of a request. */
export function ShareLinks({ links }: { links: ShareLinkView[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(link: ShareLinkView) {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(link.stepId);
      setTimeout(() => setCopied((c) => (c === link.stepId ? null : c)), 2000);
    } catch {
      // Clipboard can be blocked; the link stays selectable in the field below.
    }
  }

  if (links.length === 0) return <p className="text-sm text-muted-foreground">אין כרגע שלב פתוח עם קישור.</p>;
  return (
    <div className="space-y-3">
      {links.map((l) => (
        <Card key={l.stepId} className="space-y-2 p-3">
          <p className="text-sm font-medium">
            {l.roleLabel}: {l.who}
          </p>
          <Input readOnly dir="ltr" value={l.url} aria-label={`קישור ל${l.roleLabel}`} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => copy(l)}>
              {copied === l.stepId ? "הועתק ✓" : "העתק קישור"}
            </Button>
            <a
              href={whatsappUrl(l.phone, l.message)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center rounded-md border bg-card px-3 text-sm font-medium hover:bg-accent"
            >
              שתף בוואטסאפ
            </a>
          </div>
        </Card>
      ))}
    </div>
  );
}

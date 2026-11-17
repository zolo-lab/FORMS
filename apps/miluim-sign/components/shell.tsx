"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LayoutTemplate, Plus, Settings } from "lucide-react";
import type { ReactNode } from "react";

const links = [
  { href: "/", label: "טפסים", icon: FileText },
  { href: "/new", label: "חדש", icon: Plus },
  { href: "/templates", label: "תבניות", icon: LayoutTemplate },
  { href: "/settings", label: "הגדרות", icon: Settings },
];

function Item({ href, label, icon: Icon, current }: { href: string; label: string; icon: typeof FileText; current: boolean }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`inline-flex min-h-11 min-w-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg px-3 text-xs font-medium md:flex-row md:gap-2 md:text-sm ${current ? "bg-primary text-primary-foreground" : "text-foreground"}`}
    >
      <Icon aria-hidden="true" className="size-5" />
      {label}
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const active = (href: string) => href === "/" ? path === "/" : path.startsWith(href);
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-semibold">חתימות מילואים</Link>
          <nav className="hidden gap-2 md:flex" aria-label="ראשי">
            {links.map((link) => <Item key={link.href} {...link} current={active(link.href)} />)}
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-4 py-4 pb-28 md:pb-10">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card md:hidden" style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }} aria-label="ראשי">
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1 px-2 py-1">
          {links.map((link) => <Item key={link.href} {...link} current={active(link.href)} />)}
        </div>
      </nav>
    </div>
  );
}

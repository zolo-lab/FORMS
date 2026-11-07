"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/fields", label: "שדות", exact: true },
  { href: "/admin/fields/types", label: "סוגי רשימות", exact: false },
];

/** The two screens of the identifying-fields area, as tabs. */
export function FieldsTabs() {
  const path = usePathname();
  return (
    <nav aria-label="שדות מזהים" className="flex gap-1 border-b px-4 lg:px-8">
      {TABS.map((t) => {
        const on = t.exact ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn("-mb-px min-h-11 border-b-2 px-3 py-2.5 text-sm font-medium", on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

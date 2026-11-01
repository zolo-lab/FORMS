import Link from "next/link";
import { cn } from "@/lib/utils";

/** The two parts of the mail center: the messages themselves and the triggers that send them. */
export function MailTabs({ current }: { current: "messages" | "triggers" }) {
  const tabs = [
    { id: "messages", href: "/admin/mail", label: "הודעות שנשלחו" },
    { id: "triggers", href: "/admin/mail/triggers", label: "טריגרים" },
  ] as const;
  return (
    <nav aria-label="מרכז מיילים" className="flex gap-1 border-b">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={current === t.id ? "page" : undefined}
          className={cn(
            "-mb-px flex min-h-11 items-center border-b-2 px-4 text-sm font-medium",
            current === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

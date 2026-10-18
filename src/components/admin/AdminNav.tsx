"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItem { href: string; label: string; /** Other path prefixes that also mark this item as current. */ also?: string[]; /** Pending count shown next to the label. */ badge?: number }
export interface NavGroup { title: string; items: NavItem[] }

const isOn = (path: string, it: NavItem) => [it.href, ...(it.also ?? [])].some((h) => path === h || path.startsWith(`${h}/`));

function Label({ item }: { item: NavItem }) {
  return (
    <>
      {item.label}
      {!!item.badge && <span className="ms-2 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground" aria-label={`${item.badge} ממתינים`}>{item.badge}</span>}
    </>
  );
}

const linkCls = (on: boolean) =>
  cn("flex min-h-11 items-center rounded-md px-3 text-sm transition-colors hover:bg-accent hover:text-foreground md:min-h-9", on ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground");

/** Everyday items in a row, the rarely used admin pages in a "הגדרות" menu. On a phone everything folds into one menu. */
export function AdminNav({ items, settings }: { items: NavItem[]; settings: NavGroup[] }) {
  const path = usePathname();
  // Menus are open for the page they were opened on, so navigating closes them without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [menuAt, setMenuAt] = useState<string | null>(null);
  const open = openAt === path;
  const menu = menuAt === path;
  const setOpen = (f: (v: boolean) => boolean) => setOpenAt(f(open) ? path : null);
  const setMenu = (f: boolean | ((v: boolean) => boolean)) => setMenuAt((typeof f === "function" ? f(menu) : f) ? path : null);
  const box = useRef<HTMLDivElement>(null);
  // Close the settings menu on a click elsewhere or Escape, wherever focus is.
  useEffect(() => {
    if (!menu) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setMenuAt(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuAt(null); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [menu]);
  const settingsOn = settings.some((g) => g.items.some((i) => isOn(path, i)));

  const settingsList = settings.map((g) => (
    <div key={g.title} className="space-y-0.5">
      <p className="px-3 pt-1 text-xs font-semibold tracking-wide text-muted-foreground">{g.title}</p>
      {g.items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={isOn(path, i) ? "page" : undefined} className={linkCls(isOn(path, i))}>{i.label}</Link>
      ))}
    </div>
  ));

  return (
    <>
      <button
        type="button"
        className="ms-auto flex min-h-11 items-center gap-1 rounded-md border px-3 text-sm md:hidden"
        aria-expanded={open}
        aria-controls="admin-menu"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}תפריט
      </button>

      <nav aria-label="ראשי" className="hidden min-w-0 flex-1 items-center gap-1 md:flex">
        {items.map((i) => (
          <Link key={i.href} href={i.href} aria-current={isOn(path, i) ? "page" : undefined} className={cn(linkCls(isOn(path, i)), "whitespace-nowrap")}><Label item={i} /></Link>
        ))}
        {settings.length > 0 && (
          <div ref={box} className="relative ms-auto">
            <button
              type="button"
              aria-expanded={menu}
                            onClick={() => setMenu((v) => !v)}
              className={cn("flex min-h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-accent", settingsOn && "border-primary text-primary")}
            >
              הגדרות<ChevronDown className="size-4" />
            </button>
            {menu && (
              <div className="absolute end-0 top-full z-20 mt-1 w-64 space-y-2 rounded-lg border bg-card p-2 shadow-lg">
                {settingsList}
              </div>
            )}
          </div>
        )}
      </nav>

      {open && (
        <nav id="admin-menu" aria-label="ראשי" className="order-last w-full space-y-1 border-t pt-2 md:hidden">
          {items.map((i) => (
            <Link key={i.href} href={i.href} aria-current={isOn(path, i) ? "page" : undefined} className={linkCls(isOn(path, i))}><Label item={i} /></Link>
          ))}
          {settingsList}
        </nav>
      )}
    </>
  );
}

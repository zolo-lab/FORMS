"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import { bulkOrgsActiveAction } from "./actions";

export interface OrgRow {
  id: string;
  name: string;
  registrationNumber: string;
  slug: string | null;
  active: boolean;
  projects: { name: string; active: boolean }[];
}

/** The organizations as a table: tick rows to switch them on/off together; "עריכה" opens the side panel. */
export function OrgsTable({ rows, editing }: { rows: OrgRow[]; editing?: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const all = picked.length === rows.length && rows.length > 0;
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  return (
    <form action={bulkOrgsActiveAction} className="space-y-2">
      {picked.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
      <div className="flex min-h-11 flex-wrap items-center gap-2" aria-live="polite">
        {picked.length > 0 ? (
          <>
            <span className="text-sm font-medium">{picked.length} נבחרו</span>
            <SubmitButton size="sm" variant="outline" name="do" value="on">הפעלה</SubmitButton>
            <SubmitButton size="sm" variant="outline" name="do" value="off">השבתה</SubmitButton>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">סמנו שורות כדי להפעיל או להשבית כמה יחד.</span>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 px-3 py-2 text-start">
                <Checkbox aria-label="בחירת כל העמותות" checked={all} onChange={(e) => setPicked(e.target.checked ? rows.map((r) => r.id) : [])} />
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">שם</th>
              <th scope="col" className="hidden px-3 py-2 text-start font-medium sm:table-cell">ח&quot;פ</th>
              <th scope="col" className="hidden px-3 py-2 text-start font-medium md:table-cell">קיצור בקישור</th>
              <th scope="col" className="hidden px-3 py-2 text-start font-medium lg:table-cell">פרויקטים</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">מצב</th>
              <th scope="col" className="w-24 px-3 py-2"><span className="sr-only">פעולות</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className={cn("border-t", editing === o.id && "bg-primary/5", !o.active && "text-muted-foreground")}>
                <td className="px-3 py-2">
                  <Checkbox aria-label={`בחירה – ${o.name}`} checked={picked.includes(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} />
                </td>
                <td className="px-3 py-2 font-medium">{o.name}</td>
                <td className="hidden px-3 py-2 sm:table-cell"><bdi dir="ltr">{o.registrationNumber}</bdi></td>
                <td className="hidden px-3 py-2 md:table-cell"><bdi dir="ltr" className="font-mono text-xs">{o.slug ?? "—"}</bdi></td>
                <td className="hidden px-3 py-2 lg:table-cell">
                  {o.projects.length ? (
                    <span className="flex flex-wrap gap-1">
                      {o.projects.map((p) => <Badge key={p.name} tone={p.active ? "default" : "muted"}>{p.name}</Badge>)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2"><Badge tone={o.active ? "success" : "muted"}>{o.active ? "פעילה" : "מושבתת"}</Badge></td>
                <td className="px-3 py-2 text-end">
                  <Link href={`/admin/settings/organizations?edit=${o.id}`} scroll={false} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label={`עריכה – ${o.name}`}>עריכה</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}

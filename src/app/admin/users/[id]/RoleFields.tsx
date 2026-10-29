"use client";

import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TYPES = [
  { value: "admin", label: "אדמין", hint: "יכול לעשות הכול במערכת: טפסים, משתמשים והגדרות." },
  { value: "manager", label: "מנהל", hint: "שולח טפסים ומאשר שלבים. רואה ועושה רק מה שמסומן לו למטה." },
] as const;

/** The user type, and the manager-only permissions under it (an admin has all of them, so they are hidden). */
export function RoleFields({ initialRole, children }: { initialRole: "admin" | "manager"; children: ReactNode }) {
  const [role, setRole] = useState(initialRole);
  return (
    <>
      <Card className="space-y-3 p-4 sm:p-6">
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">סוג משתמש</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {TYPES.map((t) => (
              <label key={t.value} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors", role === t.value ? "border-primary bg-primary/5" : "hover:bg-accent")}>
                <input type="radio" name="role" value={t.value} checked={role === t.value} onChange={() => setRole(t.value)} className="mt-1 size-4 accent-primary" />
                <span>
                  <span className="block font-medium">{t.label}</span>
                  <span className="block text-sm text-muted-foreground">{t.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>
      {/* Hidden, not removed: the fields keep their values if the type is switched back before saving. */}
      <div className={cn("space-y-5", role === "admin" && "hidden")}>{children}</div>
    </>
  );
}

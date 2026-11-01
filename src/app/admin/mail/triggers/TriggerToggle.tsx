"use client";
import { useRef, useState } from "react";
import { Switch } from "@/components/ui/checkbox";
import { toggleTriggerAction } from "./actions";

/** The on/off switch of one row: flips at once and saves in the background (the page then reloads with the result). */
export function TriggerToggle({ triggerKey, org, enabled, label, locked }: { triggerKey: string; org: string; enabled: boolean; label: string; locked?: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const [on, setOn] = useState(enabled);
  return (
    <form ref={form} action={toggleTriggerAction} className="flex min-h-11 items-center">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="key" value={triggerKey} />
      {on && <input type="hidden" name="enabled" value="on" />}
      <Switch
        checked={on}
        disabled={locked}
        label={`${label}: ${on ? "פעיל" : "כבוי"}`}
        onCheckedChange={(v) => {
          setOn(v);
          // Let the hidden field render first, then send.
          requestAnimationFrame(() => form.current?.requestSubmit());
        }}
      />
    </form>
  );
}

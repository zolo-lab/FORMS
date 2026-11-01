"use client";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormDefinition } from "@/lib/forms/schema";

type Settings = NonNullable<FormDefinition["settings"]>;

const LAYOUTS = [
  ["wizard", "עמוד אחרי עמוד"],
  ["single", "הכול בעמוד אחד"],
  ["card", "שאלה אחת בכל מסך + סיכום לפני שליחה (נוח בנייד)"],
] as const;

/** Settings of the whole form: shown in the side panel when no field or page is selected. */
export function FormSettings({ def, onPatch }: { def: FormDefinition; onPatch: (patch: Partial<FormDefinition>) => void }) {
  const s = def.settings ?? {};
  const setS = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch } as Settings;
    for (const k of Object.keys(next) as (keyof Settings)[]) if (next[k] === undefined || next[k] === "") delete next[k];
    onPatch({ settings: next });
  };
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">הגדרות הטופס</p>
      <div className="space-y-1">
        <Label>הסבר בראש הטופס</Label>
        <Textarea rows={3} aria-label="הסבר בראש הטופס" value={def.description ?? ""} onChange={(e) => onPatch({ description: e.target.value || undefined })} />
      </div>
      <div className="space-y-1">
        <Label>אופן המילוי</Label>
        <Select aria-label="אופן המילוי" value={s.layout ?? "wizard"} onChange={(e) => setS({ layout: e.target.value as Settings["layout"] })}>
          {LAYOUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </div>
      <div className="space-y-1">
        <Label>טקסט כפתור השליחה</Label>
        <Input aria-label="טקסט כפתור השליחה" value={s.submitLabel ?? ""} placeholder="שליחה" onChange={(e) => setS({ submitLabel: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>הודעה אחרי השליחה</Label>
        <Textarea rows={3} aria-label="הודעה אחרי השליחה" value={s.thankYou ?? ""} placeholder="תודה, הטופס התקבל." onChange={(e) => setS({ thankYou: e.target.value })} />
      </div>
      <p className="text-xs text-muted-foreground">בחרו שדה או עמוד בעורך כדי לערוך אותם.</p>
    </div>
  );
}

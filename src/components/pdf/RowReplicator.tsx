"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** "Fill the rest of the table": repeat the selected row's cells on the next rows of a printed table. */
export function RowReplicator({ row, maxRows, pitch, cells, onApply }: { row: number; maxRows: number; pitch: number; cells: number; onApply: (count: number, pitch: number) => void }) {
  const [count, setCount] = useState(Math.max(1, maxRows - row - 1));
  const [gap, setGap] = useState(pitch);
  return (
    <section aria-label="שורות נוספות בטבלה" className="space-y-2 rounded-md border p-2">
      <p className="text-xs text-muted-foreground">
        {cells} תאים משורה {row + 1} מסומנים. אפשר להעתיק אותם לשורות הבאות של הטבלה המודפסת.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="rep-count" className="text-muted-foreground">מספר שורות</Label>
          <Input id="rep-count" type="number" dir="ltr" className="h-9 text-start" min={1} max={Math.max(1, maxRows - row - 1)} value={count} onChange={(e) => setCount(Math.max(1, Math.min(maxRows - row - 1, Number(e.target.value) || 1)))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rep-pitch" className="text-muted-foreground">גובה שורה (pt)</Label>
          <Input id="rep-pitch" type="number" dir="ltr" className="h-9 text-start" step={0.5} min={1} value={gap} onChange={(e) => setGap(Number(e.target.value) || 1)} />
        </div>
      </div>
      <Button size="sm" variant="outline" disabled={maxRows - row - 1 < 1} onClick={() => onApply(count, gap)}>העתקה לשורות הבאות</Button>
    </section>
  );
}

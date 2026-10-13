"use client";
import { Checkbox, Radio } from "@/components/ui/checkbox";
import type { FieldProps } from "./types";

type Item = { value: string; label: string };

/** radio_grid (one answer per row) and checkbox_grid (many per row). */
export function GridInput({ field, domId, value, onChange, disabled }: FieldProps) {
  const rows = (field.settings?.rows as Item[] | undefined) ?? [];
  const cols = (field.settings?.columns as Item[] | undefined) ?? [];
  const multi = field.type === "checkbox_grid";
  const answers = (typeof value === "object" && value !== null && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const setRow = (row: string, v: unknown) => onChange({ ...answers, [row]: v });
  return (
    <div id={domId} className="overflow-x-auto">
      <table className="w-full min-w-96 text-sm">
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c.value} className="px-2 pb-2 text-center font-medium">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cur = answers[r.value];
            const list = Array.isArray(cur) ? (cur as string[]) : [];
            return (
              <tr key={r.value} className="border-t">
                <th scope="row" className="py-2 pe-2 text-start font-normal">{r.label}</th>
                {cols.map((c) => (
                  <td key={c.value} className="text-center">
                    {multi ? (
                      <Checkbox
                        aria-label={`${r.label} – ${c.label}`}
                        checked={list.includes(c.value)}
                        disabled={disabled}
                        onChange={(e) => setRow(r.value, e.target.checked ? [...list, c.value] : list.filter((x) => x !== c.value))}
                      />
                    ) : (
                      <Radio
                        aria-label={`${r.label} – ${c.label}`}
                        name={`${domId}-${r.value}`}
                        checked={cur === c.value}
                        disabled={disabled}
                        onChange={() => setRow(r.value, c.value)}
                      />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

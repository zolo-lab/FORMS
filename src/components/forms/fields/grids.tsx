"use client";
import { Checkbox, Radio } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { gridColumns, gridRows, isGridAnswer, type GridAnswer, type GridColumn } from "@/lib/forms/grid";
import type { FieldOption } from "@/lib/forms/schema";
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

/** `grid`: fixed rows × typed columns. A table on wide screens, one card per row on phones. */
export function TypedGridInput({ field, domId, value, onChange, disabled }: FieldProps) {
  const rows = gridRows(field);
  const cols = gridColumns(field);
  const answers = (isGridAnswer(value) ? value : {}) as GridAnswer;
  const setCell = (row: string, col: string, v: string) => {
    const cur = { ...(answers[row] ?? {}) };
    if (v === "") delete cur[col]; else cur[col] = v;
    onChange({ ...answers, [row]: cur });
  };
  const cell = (r: FieldOption, c: GridColumn) => {
    const v = answers[r.value]?.[c.value];
    const shown = v === undefined ? "" : String(v);
    const label = `${r.label} – ${c.label}`;
    const cls = "h-9 w-full";
    if (c.type === "dropdown") {
      return (
        <Select aria-label={label} className={cls} value={shown} disabled={disabled} onChange={(e) => setCell(r.value, c.value, e.target.value)}>
          <option value="">בחר…</option>
          {(c.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      );
    }
    const type = c.type === "date" ? "date" : "text";
    const inputMode = c.type === "number" ? ("decimal" as const) : undefined;
    return <Input aria-label={label} className={cls} type={type} inputMode={inputMode} dir={c.type === "number" || c.type === "date" ? "ltr" : undefined} value={shown} disabled={disabled} onChange={(e) => setCell(r.value, c.value, e.target.value)} />;
  };
  return (
    <div id={domId}>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th />
              {cols.map((c) => <th key={c.value} className="px-1 pb-2 text-start font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.value} className="border-t">
                <th scope="row" className="py-1 pe-2 text-start font-normal">{r.label}</th>
                {cols.map((c) => <td key={c.value} className="px-1 py-1">{cell(r, c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 sm:hidden">
        {rows.map((r) => (
          <div key={r.value} className="space-y-2 rounded-md border bg-card p-3">
            <p className="font-medium">{r.label}</p>
            {cols.map((c) => (
              <label key={c.value} className="block space-y-1 text-sm">
                <span className="text-muted-foreground">{c.label}</span>
                {cell(r, c)}
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

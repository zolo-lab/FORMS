"use client";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveOptions } from "@/lib/forms/lookups";
import { isKnownBranch } from "@/lib/forms/bank-branches";
import { BranchPicker } from "./BranchPicker";
import type { FieldProps } from "./types";

/** A new bank keeps the branch only if that bank has it. */
const keepBranch = (bank: string, branch?: string) => (branch && bank && isKnownBranch(bank, branch) ? branch : "");

type Part = { key: string; label: string; ltr?: boolean; inputMode?: "numeric"; maxLength?: number; span?: string };

const ADDRESS_PARTS: Part[] = [
  { key: "city", label: "יישוב", span: "sm:col-span-3" },
  { key: "street", label: "רחוב", span: "sm:col-span-3" },
  { key: "house", label: "מספר בית", ltr: true, span: "sm:col-span-2" },
  { key: "apartment", label: "דירה", ltr: true, span: "sm:col-span-2" },
  { key: "zip", label: "מיקוד", ltr: true, inputMode: "numeric", maxLength: 7, span: "sm:col-span-2" },
];

function asObject(v: unknown): Record<string, string> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, string>) : {};
}

export function AddressInput({ domId, value, onChange, disabled, invalid }: FieldProps) {
  const obj = asObject(value);
  return (
    <div id={domId} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
      {ADDRESS_PARTS.map((p) => (
        <div key={p.key} className={`space-y-1 ${p.span}`}>
          <Label htmlFor={`${domId}-${p.key}`} className="text-muted-foreground">{p.label}</Label>
          <Input
            id={`${domId}-${p.key}`}
            dir={p.ltr ? "ltr" : undefined}
            className={p.ltr ? "text-start" : undefined}
            inputMode={p.inputMode}
            maxLength={p.maxLength}
            value={obj[p.key] ?? ""}
            disabled={disabled}
            aria-invalid={invalid && ["city", "street", "house"].includes(p.key) && !obj[p.key]}
            onChange={(e) => onChange({ ...obj, [p.key]: p.inputMode === "numeric" ? e.target.value.replace(/\D/g, "") : e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

export function BankAccountInput({ field, domId, value, onChange, disabled, invalid, lookups }: FieldProps) {
  const obj = asObject(value);
  const banks = resolveOptions({ optionsSource: "banks" }, lookups);
  const set = (k: string, v: string) => onChange({ ...obj, [k]: v });
  return (
    <div id={domId} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${domId}-bank`} className="text-muted-foreground">בנק</Label>
        <Select id={`${domId}-bank`} value={obj.bank ?? ""} disabled={disabled} aria-invalid={invalid && !obj.bank} onChange={(e) => onChange({ ...obj, bank: e.target.value, branch: keepBranch(e.target.value, obj.branch) })}>
          <option value="">{field.placeholder ?? "בחר בנק…"}</option>
          {banks.map((b) => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${domId}-branch`} className="text-muted-foreground">סניף</Label>
        <BranchPicker id={`${domId}-branch`} bank={obj.bank ?? ""} value={obj.branch ?? ""} disabled={disabled} invalid={invalid && !obj.branch} onChange={(v) => set("branch", v)} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${domId}-account`} className="text-muted-foreground">מספר חשבון</Label>
        <Input id={`${domId}-account`} dir="ltr" className="text-start" inputMode="numeric" maxLength={9} value={obj.account ?? ""} disabled={disabled} aria-invalid={invalid && !obj.account} onChange={(e) => set("account", e.target.value.replace(/\D/g, ""))} />
      </div>
    </div>
  );
}

export function FullNameInput({ domId, value, onChange, disabled, invalid }: FieldProps) {
  const obj = asObject(value);
  return (
    <div id={domId} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {([["first", "שם פרטי"], ["last", "שם משפחה"]] as const).map(([k, label]) => (
        <div key={k} className="space-y-1">
          <Label htmlFor={`${domId}-${k}`} className="text-muted-foreground">{label}</Label>
          <Input id={`${domId}-${k}`} value={obj[k] ?? ""} disabled={disabled} aria-invalid={invalid && !obj[k]} autoComplete={k === "first" ? "given-name" : "family-name"} onChange={(e) => onChange({ ...obj, [k]: e.target.value })} />
        </div>
      ))}
    </div>
  );
}

"use client";
import { evaluateCondition, type Answers } from "@/lib/forms/conditions";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import type { FormField } from "@/lib/forms/schema";
import { fieldIsRequired } from "@/lib/forms/wizard";
import { cn } from "@/lib/utils";
import { CheckboxesInput, ConsentInput, DropdownInput, LinearScaleInput, RadioInput, RatingInput, YesNoInput } from "./choices";
import { AddressInput, FullNameInput, BankAccountInput } from "./composite";
import { FileUploadInput } from "./file";
import { GridInput } from "./grids";
import { LongTextInput, TextLikeInput } from "./inputs";
import { LayoutBlock } from "./layout";
import { FieldShell } from "./shell";
import { SignatureInput } from "./signature";
import { RepeatingTableInput } from "./table";
import type { FieldProps, RenderCtx } from "./types";

const WIDTH = { full: "sm:col-span-6", half: "sm:col-span-3", third: "sm:col-span-2" } as const;

/** type → control. Exhaustive: adding a FieldType without a control is a compile error. */
function Control(props: FieldProps & { renderChild: Parameters<typeof RepeatingTableInput>[0]["renderChild"] }) {
  switch (props.field.type) {
    case "short_text": case "email": case "number": case "currency": case "percent":
    case "phone": case "id_number": case "date": case "time":
      return <TextLikeInput {...props} />;
    case "long_text": return <LongTextInput {...props} />;
    case "radio": return <RadioInput {...props} />;
    case "checkboxes": return <CheckboxesInput {...props} />;
    case "dropdown": return <DropdownInput {...props} />;
    case "yes_no": return <YesNoInput {...props} />;
    case "linear_scale": return <LinearScaleInput {...props} />;
    case "rating": return <RatingInput {...props} />;
    case "consent": return <ConsentInput {...props} />;
    case "radio_grid": case "checkbox_grid": return <GridInput {...props} />;
    case "full_name": return <FullNameInput {...props} />;
    case "bank_account": return <BankAccountInput {...props} />;
    case "address": return <AddressInput {...props} />;
    case "signature": return <SignatureInput {...props} />;
    case "file_upload": return <FileUploadInput {...props} />;
    case "repeating_table": return <RepeatingTableInput {...props} renderChild={props.renderChild} />;
    case "hidden": return null;
    case "heading": case "info_text": case "image": case "divider":
      return <LayoutBlock field={props.field} />;
  }
}

export interface FieldRowProps {
  field: FormField;
  /** Answers of the current scope (top level, or table row). */
  scope: Answers;
  /** Whole-form answers, for conditions that reference top-level fields from inside a row. */
  rootAnswers: Answers;
  onField: (id: string, v: unknown) => void;
  /** Error-key prefix, e.g. "children.0." */
  prefix: string;
  parentDisabled: boolean;
  ctx: RenderCtx;
}

/** One field: visibility, role-based read-only, label/error shell and the control. */
export function FieldRow({ field, scope, rootAnswers, onField, prefix, parentDisabled, ctx }: FieldRowProps) {
  const condScope = { ...rootAnswers, ...scope };
  if (!evaluateCondition(field.visibleIf, condScope)) return null;
  const meta = FIELD_TYPE_META[field.type];
  const key = prefix + field.id;
  const domId = `f-${key}`;
  const disabled = parentDisabled || ctx.readonlyAll || !!field.readOnly || ctx.roleReadOnly(field);
  const error = ctx.errors[key];

  const renderChild: Parameters<typeof RepeatingTableInput>[0]["renderChild"] = (child, row, onRow, childPrefix, dis) => (
    <FieldRow key={child.id} field={child} scope={row} rootAnswers={rootAnswers} onField={onRow} prefix={childPrefix} parentDisabled={dis} ctx={ctx} />
  );

  if (!meta.hasAnswer) {
    return <div className="sm:col-span-6"><LayoutBlock field={field} pipe={(t) => ctx.pipe(t, condScope)} /></div>;
  }
  if (field.type === "hidden") return null;

  return (
    <div className={cn("col-span-1", WIDTH[field.width ?? (field.type === "repeating_table" ? "full" : "half")])}>
      <FieldShell
        domId={domId}
        label={ctx.pipe(field.label, condScope)}
        description={field.description ? ctx.pipe(field.description, condScope) : undefined}
        required={fieldIsRequired(field, condScope)}
        error={error}
        hideLabel={field.type === "consent"}
        style={field.style}
      >
        <Control
          field={field}
          domId={domId}
          value={scope[field.id]}
          onChange={(v) => onField(field.id, v)}
          disabled={disabled}
          invalid={!!error}
          lookups={ctx.lookups}
          onUpload={ctx.onUpload}
          renderChild={renderChild}
        />
      </FieldShell>
    </div>
  );
}

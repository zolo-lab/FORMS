import type { Lookups } from "@/lib/forms/lookups";
import type { FormField } from "@/lib/forms/schema";
import type { FieldErrors } from "@/lib/forms/validate";

export interface UploadedFile {
  url: string;
  name: string;
  size: number;
  mime: string;
}
export type UploadFn = (file: File) => Promise<UploadedFile>;

export interface FieldProps {
  field: FormField;
  /** DOM id base (unique per field instance, e.g. "f-children.0.name"). */
  domId: string;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  invalid: boolean;
  lookups: Lookups;
  onUpload?: UploadFn;
}

export interface RenderCtx {
  lookups: Lookups;
  onUpload?: UploadFn;
  errors: FieldErrors;
  roleReadOnly: (field: FormField) => boolean;
  readonlyAll: boolean;
}

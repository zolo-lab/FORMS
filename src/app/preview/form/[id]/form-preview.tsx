"use client";
import { FormTestFill, type TestFillPdf } from "@/components/forms/FormTestFill";
import type { FormDefinition } from "@/lib/forms/schema";

export function FormPreview({ definition, pdf }: { definition: FormDefinition; pdf?: TestFillPdf }) {
  return <FormTestFill definition={definition} pdf={pdf} />;
}

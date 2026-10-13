"use client";
import { useState } from "react";
import { FormRenderer } from "@/components/forms/FormRenderer";
import type { Answers } from "@/lib/forms/conditions";
import type { FormDefinition } from "@/lib/forms/schema";

export function TemplatePreview({ definition }: { definition: FormDefinition }) {
  const [answers, setAnswers] = useState<Answers>({});
  return <FormRenderer definition={definition} answers={answers} onChange={setAnswers} onUpload={async (f) => ({ url: URL.createObjectURL(f), name: f.name, size: f.size, mime: f.type })} />;
}

"use client";
import { useState } from "react";
import { FormRenderer } from "@/components/forms/FormRenderer";
import type { Answers } from "@/lib/forms/conditions";
import type { FormDefinition } from "@/lib/forms/schema";

export function FormPreview({ definition }: { definition: FormDefinition }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [done, setDone] = useState<Answers | null>(null);
  return (
    <>
      <FormRenderer
        definition={definition}
        answers={answers}
        onChange={setAnswers}
        onSubmit={(cleaned) => setDone(cleaned)}
        onUpload={async (f) => ({ url: URL.createObjectURL(f), name: f.name, size: f.size, mime: f.type })}
      />
      {done && (
        <pre dir="ltr" className="mt-6 overflow-auto rounded-md bg-muted p-3 text-xs" data-testid="result">
          {JSON.stringify(done, null, 2)}
        </pre>
      )}
    </>
  );
}

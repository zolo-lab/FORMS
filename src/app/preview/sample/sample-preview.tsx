"use client";
import { useState } from "react";
import { FormRenderer } from "@/components/forms/FormRenderer";
import type { Answers } from "@/lib/forms/conditions";
import { sampleForm } from "../../../../tests/fixtures/sample-form";

export function SamplePreview() {
  const [answers, setAnswers] = useState<Answers>({});
  const [done, setDone] = useState<Answers | null>(null);
  return (
    <>
      <FormRenderer
        definition={sampleForm}
        answers={answers}
        onChange={setAnswers}
        onSubmit={(cleaned) => setDone(cleaned)}
        onUpload={async (f) => ({ url: URL.createObjectURL(f), name: f.name, size: f.size, mime: f.type })}
      />
      {done && (
        <pre dir="ltr" className="mt-6 overflow-auto rounded-md bg-muted p-3 text-xs" data-testid="result">{JSON.stringify(done, null, 2)}</pre>
      )}
    </>
  );
}

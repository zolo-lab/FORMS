import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { publicForm } from "@/server/public-fill";
import { lookupsFor } from "@/server/people-store";
import { PublicFill } from "./public-fill";

export const dynamic = "force-dynamic";

/** The form's own link (like iForms): the form opens right away on its first step's fields. */
export default async function PublicFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await publicForm(id);
  if (!view.ok) {
    if (view.reason === "not_found") notFound();
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card className="space-y-2 p-6 text-center">
          <h1 className="text-xl font-bold">{view.title}</h1>
          <p className="text-muted-foreground">{view.reason === "not_public" ? "הטופס הזה מתחיל אצל מישהו אחר ולא נפתח למילוי בקישור." : "הטופס לא פתוח כרגע למילוי."}</p>
        </Card>
      </main>
    );
  }
  return (
    <main className={view.pdf ? "mx-auto max-w-5xl px-4 py-6" : "mx-auto max-w-3xl px-4 py-6"}>
      <PublicFill
        formId={view.formId}
        definition={view.definition}
        role={view.role}
        lookups={await lookupsFor([view.definition])}
        pdf={view.pdf ? { url: `/api/f/${view.formId}/pdf`, mapping: view.pdf.mapping } : undefined}
      />
    </main>
  );
}

import { notFound } from "next/navigation";
import { OrgTheme } from "@/components/branding";
import { Card } from "@/components/ui/card";
import { publicForm } from "@/server/public-fill";
import { lookupsFor } from "@/server/people-store";
import { PublicFill } from "./public-fill";

const REASONS: Record<string, string> = {
  not_public: "הטופס הזה מתחיל אצל מישהו אחר ולא נפתח למילוי בקישור.",
  no_fields: "בשלב הראשון של הטופס אין שדות למילוי.",
  choose_org: "הטופס הזה משמש כמה עמותות: צריך את הקישור של העמותה שלכם. אפשר לבקש אותו ממי ששלח לכם את הטופס.",
  org_not_allowed: "הקישור הזה לא פתוח לעמותה הזו. אפשר לבקש את הקישור הנכון ממי ששלח לכם את הטופס.",
  no_organization: "הטופס לא פתוח כרגע לאף עמותה.",
};

/** /f/<form> and /f/<form>/<organization>: the form, for the organization of the link. */
export async function PublicFormView({ id, org: orgSlug }: { id: string; org?: string }) {
  const view = await publicForm(id, orgSlug);
  if (!view.ok) {
    if (view.reason === "not_found") notFound();
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card className="space-y-2 p-6 text-center">
          <h1 className="text-xl font-bold">{view.title}</h1>
          <p className="text-muted-foreground">{REASONS[view.reason] ?? "הטופס לא פתוח כרגע למילוי."}</p>
        </Card>
      </main>
    );
  }
  const q = orgSlug ? `?org=${encodeURIComponent(orgSlug)}` : "";
  return (
    <OrgTheme org={view.org}>
      <main className={view.pdf ? "mx-auto max-w-5xl px-4 py-6" : "mx-auto max-w-3xl px-4 py-6"}>
        <PublicFill
          formId={view.formId}
          org={orgSlug ?? null}
          definition={view.definition}
          role={view.role}
          initialAnswers={view.initialAnswers}
          lookups={await lookupsFor([view.definition])}
          pdf={view.pdf ? { url: `/api/f/${view.formId}/pdf${q}`, mapping: view.pdf.mapping } : undefined}
        />
      </main>
    </OrgTheme>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { FlowSettings, type FlowQuery } from "@/components/packages/FlowSettings";
import { getEditorData } from "@/server/forms-store";
import { formPackageId } from "@/server/packages-store";

export const dynamic = "force-dynamic";

/** "שלבי הטופס": the form's signing route (who fills and signs, in which order) and how it is sent, like in iForms. */
export default async function FormFlowPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlowQuery> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getEditorData(id);
  if (!data) notFound();
  const pkgId = await formPackageId(id, data.template.title);
  const content = await FlowSettings({ id: pkgId, query: await searchParams, formId: id });
  if (!content) notFound();
  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <nav aria-label="עריכת הטופס" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b pb-3 text-sm">
        <h1 className="me-auto text-xl font-bold">{data.template.title}</h1>
        <Link href={`/admin/forms/${id}?tab=pdf`} className="text-muted-foreground hover:text-foreground">מסמך PDF</Link>
        <Link href={`/admin/forms/${id}`} className="text-muted-foreground hover:text-foreground">עריכה (רספונסיבי)</Link>
        <span aria-current="page" className="font-semibold text-primary">שלבי הטופס</span>
      </nav>
      <p className="text-sm text-muted-foreground">
        מי ממלא ומי חותם, ובאיזה סדר. אחרי הגדרת השלבים משייכים כל שדה לשלב שלו ב&quot;מי ממלא&quot; בהגדרות השדה.
      </p>
      {content}
    </main>
  );
}

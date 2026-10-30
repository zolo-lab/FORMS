import { notFound, redirect } from "next/navigation";
import { getPackage } from "@/server/packages-store";

export const dynamic = "force-dynamic";

/** Packages are a form's own steps now: an old link opens the form's "שלבי הטופס" tab. */
export default async function PackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getPackage(id);
  const first = data?.items[0];
  redirect(first ? `/admin/forms/${first.templateId}?tab=steps` : "/admin/forms");
}

import { notFound, redirect } from "next/navigation";

/** "שלבי הטופס" is a tab of the form editor now; old links (and the send-settings forms) land there. */
export default async function FormFlowPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = new URLSearchParams({ tab: "steps" });
  for (const [k, v] of Object.entries(await searchParams)) if (v && ["saved", "error", "settingsError"].includes(k)) q.set(k, v);
  redirect(`/admin/forms/${id}?${q}`);
}

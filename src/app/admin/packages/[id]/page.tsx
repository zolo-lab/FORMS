import { notFound } from "next/navigation";
import { FlowSettings, type FlowQuery } from "@/components/packages/FlowSettings";

export const dynamic = "force-dynamic";

export default async function PackagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlowQuery> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const content = await FlowSettings({ id, query: await searchParams });
  if (!content) notFound();
  return <main className="mx-auto max-w-4xl px-4 py-6">{content}</main>;
}

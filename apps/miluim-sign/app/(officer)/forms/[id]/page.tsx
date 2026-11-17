import { FormDetail } from "@/components/form-detail";

export default async function FormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FormDetail id={id} />;
}

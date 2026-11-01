import { PublicFormView } from "./public-form-view";

export const dynamic = "force-dynamic";

/** The form's own link (like iForms): the form opens right away on its first step's fields. */
export default async function PublicFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicFormView id={id} />;
}


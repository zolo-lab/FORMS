import { PublicFormView } from "../public-form-view";

export const dynamic = "force-dynamic";

/** The form's link for one organization (/f/<form>/pnima): the request belongs to that organization. */
export default async function PublicOrgFormPage({ params }: { params: Promise<{ id: string; org: string }> }) {
  const { id, org } = await params;
  return <PublicFormView id={id} org={org} />;
}

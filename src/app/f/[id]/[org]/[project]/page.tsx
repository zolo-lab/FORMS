import { PublicFormView } from "../../public-form-view";

export const dynamic = "force-dynamic";

/** The form's link for a project of an organization (/f/<form>/shivat-zion/artzenu): filed under the project, its route. */
export default async function PublicProjectFormPage({ params }: { params: Promise<{ id: string; org: string; project: string }> }) {
  const { id, org, project } = await params;
  return <PublicFormView id={id} org={org} project={project} />;
}

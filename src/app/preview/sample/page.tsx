import { OrgTheme, type OrgBrand } from "@/components/branding";
import { getOrgBySlug } from "@/server/orgs-store";
import { SamplePreview } from "./sample-preview";

async function loadOrg(slug: string | undefined): Promise<OrgBrand | null> {
  if (!slug) return null;
  try {
    return await getOrgBySlug(slug);
  } catch {
    return null; // sample page must keep working without a database (e2e)
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await searchParams;
  const brand = await loadOrg(org);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <OrgTheme org={brand}>
        <SamplePreview />
      </OrgTheme>
    </main>
  );
}

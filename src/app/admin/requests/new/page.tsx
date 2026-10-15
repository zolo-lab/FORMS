import { listPackagesForWizard } from "@/server/packages-store";
import { lookupsFor } from "@/server/people-store";
import { listOrganizations } from "@/server/requests-store";
import { NewRequestWizard } from "@/components/requests/NewRequestWizard";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const [packages, orgs] = await Promise.all([listPackagesForWizard(), listOrganizations()]);
  const lookups = await lookupsFor(packages.map((p) => p.requesterDefinition));
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">בקשה חדשה</h1>
      <NewRequestWizard packages={packages} orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} lookups={lookups} />
    </main>
  );
}

import { listPackagesForWizard } from "@/server/packages-store";
import { lookupsFor } from "@/server/people-store";
import { listOrganizations } from "@/server/requests-store";
import { listContacts } from "@/server/people-store";
import { can } from "@/lib/auth/permissions";
import { viewer, viewerOpenablePackages } from "@/server/users-store";
import { NewRequestWizard } from "@/components/requests/NewRequestWizard";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const [all, orgs, allowed, contacts, v] = await Promise.all([listPackagesForWizard(), listOrganizations(), viewerOpenablePackages(), listContacts(), viewer()]);
  const packages = allowed ? all.filter((p) => allowed.includes(p.id)) : all;
  const lookups = await lookupsFor(packages.map((p) => p.requesterDefinition));
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">בקשה חדשה</h1>
      {packages.length === 0 && <p className="text-sm text-muted-foreground">אין לך הרשאה לפתוח בקשות. פנו למנהל המערכת.</p>}
      <NewRequestWizard
        packages={packages}
        orgs={orgs.map((o) => ({ id: o.id, name: o.name }))}
        lookups={lookups}
        contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
        chainEditable={packages.filter((p) => can(v.user, v.perms, p.id, "edit_chain")).map((p) => p.id)}
      />
    </main>
  );
}

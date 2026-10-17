import { listPackagesForWizard } from "@/server/packages-store";
import { lookupsFor } from "@/server/people-store";
import { listOrganizations } from "@/server/requests-store";
import { listContacts } from "@/server/people-store";
import { can, projectLimit, usableOrgIds } from "@/lib/auth/permissions";
import { viewer, viewerOpenablePackages } from "@/server/users-store";
import { listProjects } from "@/server/orgs-store";
import { NewRequestWizard } from "@/components/requests/NewRequestWizard";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const [all, orgs, allowed, contacts, v, projects] = await Promise.all([listPackagesForWizard(), listOrganizations({ activeOnly: true }), viewerOpenablePackages(), listContacts(), viewer(), listProjects()]);
  const packages = allowed ? all.filter((p) => allowed.includes(p.id)) : all;
  const ids = usableOrgIds(v.access);
  const usable = ids ? orgs.filter((o) => ids.includes(o.id)) : orgs;
  const lookups = await lookupsFor(packages.map((p) => p.requesterDefinition));
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">בקשה חדשה</h1>
      {packages.length === 0 && <p className="text-sm text-muted-foreground">אין לך הרשאה לפתוח בקשות. פנו למנהל המערכת.</p>}
      <NewRequestWizard
        packages={packages}
        orgs={usable.map((o) => ({ id: o.id, name: o.name, projectRequired: !!projectLimit(v.access, o.id), projects: projects.filter((p) => p.organizationId === o.id && p.active && (projectLimit(v.access, o.id)?.includes(p.id) ?? true)).map((p) => ({ id: p.id, name: p.name })) }))}
        lookups={lookups}
        contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
        chainEditable={packages.filter((p) => can(v.user, v.perms, p.id, "edit_chain")).map((p) => p.id)}
      />
    </main>
  );
}

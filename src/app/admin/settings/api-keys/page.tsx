import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listOrgs } from "@/server/orgs-store";
import { CreateKeyForm } from "./CreateKeyForm";
import { revokeApiKeyAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const [keys, orgs] = await Promise.all([db.select().from(schema.apiKeys).orderBy(desc(schema.apiKeys.createdAt)), listOrgs()]);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-bold">מפתחות API</h1>
      <p className="text-sm text-muted-foreground">
        מפתח מאפשר למערכת חיצונית (למשל Make) ליצור ולקרוא בקשות של ארגון אחד דרך <code dir="ltr">/api/v1</code>, עם הכותרת <code dir="ltr">Authorization: Bearer fk_…</code>. התיעוד ב-<code dir="ltr">docs/api.md</code>.
      </p>
      <Card className="p-4">
        <CreateKeyForm orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} />
      </Card>
      <Card className="divide-y">
        {keys.length === 0 && <p className="p-4 text-sm text-muted-foreground">עדיין אין מפתחות.</p>}
        {keys.map((k) => (
          <div key={k.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{k.name}</p>
              <p className="text-sm text-muted-foreground">
                {orgName.get(k.organizationId)} · נוצר {fmt.format(k.createdAt)} · {k.lastUsedAt ? `שימוש אחרון ${fmt.format(k.lastUsedAt)}` : "טרם נעשה בו שימוש"}
              </p>
            </div>
            {k.revokedAt ? (
              <Badge tone="muted">בוטל</Badge>
            ) : (
              <form action={revokeApiKeyAction}>
                <input type="hidden" name="id" value={k.id} />
                <Button size="sm" variant="ghost" className="text-destructive" type="submit">ביטול המפתח</Button>
              </form>
            )}
          </div>
        ))}
      </Card>
    </main>
  );
}

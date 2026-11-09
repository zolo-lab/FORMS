import { isAdmin } from "@/lib/auth/permissions";
import { requireGrant } from "@/server/guards";
import { currentUser } from "@/server/users-store";
import { listTypeSummaries, loadSheet, ORG_TYPE } from "@/server/lists-store";
import { PageHeader } from "@/components/ui/page-header";
import { ListsScreen } from "./ListsScreen";

export const dynamic = "force-dynamic";

export default async function ListsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireGrant("manageFields");
  const { type } = await searchParams;
  // The organizations are admins' only, as on the organizations screen.
  const admin = isAdmin(await currentUser());
  const types = (await listTypeSummaries()).filter((t) => admin || t.id !== ORG_TYPE);
  const current = types.find((t) => t.id === type)?.id ?? types[0]?.id;
  const sheet = current ? await loadSheet(current) : null;
  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <PageHeader
        title="רשימות"
        description="כל סוג רשימה הוא טבלה: השדות הם העמודות (שם, ח״פ, מייל…) וכל רשומה היא שורה. שדה שנוסף לסוג נוסף לכל הרשומות שלו. הטפסים יוכלו למשוך מכאן ערכים."
      />
      <ListsScreen types={types} sheet={sheet} />
    </main>
  );
}

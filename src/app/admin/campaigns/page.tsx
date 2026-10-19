import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { percent, summarizeCampaigns } from "@/lib/requests/campaign";
import { campaignCounts } from "@/server/dashboard-store";
import { viewerScope } from "@/server/users-store";

export const dynamic = "force-dynamic";

/** Mass sends ("101 2027"): how many signed, per campaign and organization. */
export default async function CampaignsPage() {
  const scope = await viewerScope();
  const campaigns = summarizeCampaigns(await campaignCounts(scope));
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <PageHeader title="קמפיינים" description={<>שליחה המונית מקובץ עם שם קמפיין (למשל 101 שנתי) מרכזת כאן את ההתקדמות לכל עמותה.</>} />
      {campaigns.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          עדיין אין קמפיינים. ב<Link href="/admin/requests/bulk" className="text-primary underline">שליחה מקובץ</Link> אפשר לתת שם קמפיין לכל הבקשות מהקובץ.
        </Card>
      ) : (
        campaigns.map((c) => (
          <Card key={c.campaign} className="space-y-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{c.campaign}</h2>
              <p className="text-sm text-muted-foreground">
                {c.completed} מתוך {c.total} חתומים ({percent(c.completed, c.total)}%) · {c.open} בתהליך{c.other ? ` · ${c.other} בוטלו/פגו` : ""}
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(c.completed, c.total)} aria-label={`התקדמות ${c.campaign}`}>
              <div className="h-full bg-success" style={{ width: `${percent(c.completed, c.total)}%` }} />
            </div>
            <table className="w-full text-sm">
              <caption className="sr-only">התקדמות לפי עמותה</caption>
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th scope="col" className="px-2 py-1 text-start font-medium">עמותה</th>
                  <th scope="col" className="px-2 py-1 text-start font-medium">חתומים</th>
                  <th scope="col" className="px-2 py-1 text-start font-medium">בתהליך</th>
                  <th scope="col" className="px-2 py-1 text-start font-medium">סה״כ</th>
                  <th scope="col" className="px-2 py-1 text-start font-medium"><span className="sr-only">פעולות</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {c.byOrganization.map((o) => (
                  <tr key={o.organization}>
                    <td className="px-2 py-1.5">{o.organization}</td>
                    <td className="px-2 py-1.5">{o.completed} ({percent(o.completed, o.total)}%)</td>
                    <td className="px-2 py-1.5">{o.open}</td>
                    <td className="px-2 py-1.5">{o.total}</td>
                    <td className="px-2 py-1.5">
                      <Link href={`/admin/track?campaign=${encodeURIComponent(c.campaign)}`} className="text-primary hover:underline">מעקב</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))
      )}
    </main>
  );
}

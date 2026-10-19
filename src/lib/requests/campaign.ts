/** Campaign tags for mass sends ("101 2027"): pure helpers, unit tested. */

export function normalizeCampaign(raw: string | null | undefined): string | null {
  const s = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return s || null;
}

export interface CampaignRow { campaign: string; organization: string; status: string; count: number }

export interface CampaignSummary {
  campaign: string;
  total: number;
  completed: number;
  open: number;
  other: number;
  byOrganization: { organization: string; total: number; completed: number; open: number }[];
}

/** Grouped counts → one summary per campaign, newest-looking name first (campaign names usually carry the year). */
export function summarizeCampaigns(rows: CampaignRow[]): CampaignSummary[] {
  const map = new Map<string, CampaignSummary>();
  for (const r of rows) {
    const c = map.get(r.campaign) ?? { campaign: r.campaign, total: 0, completed: 0, open: 0, other: 0, byOrganization: [] };
    let o = c.byOrganization.find((x) => x.organization === r.organization);
    if (!o) { o = { organization: r.organization, total: 0, completed: 0, open: 0 }; c.byOrganization.push(o); }
    const done = r.status === "completed";
    const open = r.status === "in_progress" || r.status === "returned" || r.status === "draft";
    c.total += r.count; o.total += r.count;
    if (done) { c.completed += r.count; o.completed += r.count; }
    else if (open) { c.open += r.count; o.open += r.count; }
    else c.other += r.count;
    map.set(r.campaign, c);
  }
  return [...map.values()].sort((a, b) => b.campaign.localeCompare(a.campaign, "he")).map((c) => ({ ...c, byOrganization: c.byOrganization.sort((a, b) => a.organization.localeCompare(b.organization, "he")) }));
}

export const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

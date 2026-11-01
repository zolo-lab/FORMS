import { buttonVariants } from "@/components/ui/button";
import { CopyLinkButton } from "@/components/ui/copy-link-button";
import { publicFillPath } from "@/lib/forms/public-link";

type Target = { slug: string; name: string; projects?: { slug: string; name: string }[] };

/**
 * The form's links for filling: a single organization without projects → copy / open its link; otherwise a short list,
 * a link per organization and per project under it (the link without an organization does not open such a form).
 */
export function FormLinks({ formId, title, orgs }: { formId: string; title: string; orgs: Target[] }) {
  const projects = orgs.reduce((n, o) => n + (o.projects?.length ?? 0), 0);
  if (orgs.length <= 1 && !projects) {
    const path = publicFillPath(formId, orgs[0]?.slug);
    return (
      <span className="inline-flex items-center gap-1">
        <CopyLinkButton path={path} variant="outline" size="sm" aria-label={`העתקת קישור למילוי – ${title}`} />
        <a href={path} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`פתיחת הקישור למילוי – ${title}`}>פתיחה</a>
      </span>
    );
  }
  const row = (label: string, path: string, sub = false) => (
    <li key={path} className={sub ? "flex items-center justify-between gap-2 ps-4" : "flex items-center justify-between gap-2"}>
      <span className={sub ? "text-sm text-muted-foreground" : "text-sm font-medium"}>{sub ? `↳ ${label}` : label}</span>
      <span className="inline-flex items-center gap-1">
        <CopyLinkButton path={path} variant="outline" size="sm" aria-label={`העתקת קישור למילוי – ${title} – ${label}`}>העתקה</CopyLinkButton>
        <a href={path} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`פתיחת הקישור למילוי – ${title} – ${label}`}>פתיחה</a>
      </span>
    </li>
  );
  return (
    <details className="relative">
      <summary className={buttonVariants({ variant: "outline", size: "sm" }) + " cursor-pointer list-none"} aria-label={`קישורים למילוי – ${title}`}>
        קישורים למילוי · {orgs.length} עמותות{projects ? ` · ${projects} פרויקטים` : ""}
      </summary>
      <ul className="absolute end-0 z-20 mt-1 w-max min-w-72 space-y-1 rounded-lg border bg-card p-2 shadow-lg">
        {orgs.flatMap((o) => [row(o.name, publicFillPath(formId, o.slug)), ...(o.projects ?? []).map((p) => row(p.name, publicFillPath(formId, o.slug, p.slug), true))])}
      </ul>
    </details>
  );
}

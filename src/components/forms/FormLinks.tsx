import { buttonVariants } from "@/components/ui/button";
import { CopyLinkButton } from "@/components/ui/copy-link-button";
import { publicFillPath } from "@/lib/forms/public-link";

/**
 * The form's links for filling: one organization → copy / open its link; several → a short list, a link per
 * organization (the link without an organization does not open such a form).
 */
export function FormLinks({ formId, title, orgs }: { formId: string; title: string; orgs: { slug: string; name: string }[] }) {
  if (orgs.length <= 1) {
    const path = publicFillPath(formId, orgs[0]?.slug);
    return (
      <span className="inline-flex items-center gap-1">
        <CopyLinkButton path={path} variant="outline" size="sm" aria-label={`העתקת קישור למילוי – ${title}`} />
        <a href={path} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`פתיחת הקישור למילוי – ${title}`}>פתיחה</a>
      </span>
    );
  }
  return (
    <details className="relative">
      <summary className={buttonVariants({ variant: "outline", size: "sm" }) + " cursor-pointer list-none"} aria-label={`קישורים למילוי – ${title}`}>
        קישורים למילוי · {orgs.length} עמותות
      </summary>
      <ul className="absolute end-0 z-20 mt-1 w-max min-w-72 space-y-1 rounded-lg border bg-card p-2 shadow-lg">
        {orgs.map((o) => {
          const path = publicFillPath(formId, o.slug);
          return (
            <li key={o.slug} className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{o.name}</span>
              <span className="inline-flex items-center gap-1">
                <CopyLinkButton path={path} variant="outline" size="sm" aria-label={`העתקת קישור למילוי – ${title} – ${o.name}`}>העתקה</CopyLinkButton>
                <a href={path} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`פתיחת הקישור למילוי – ${title} – ${o.name}`}>פתיחה</a>
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

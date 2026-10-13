import type { CSSProperties } from "react";
import { orgThemeVars } from "@/lib/branding";

export interface OrgBrand {
  name: string;
  slug: string | null;
  primaryColor: string | null;
  logoFileId: string | null;
}

/** Wraps children in the organization's colors and shows its logo + name on top. */
export function OrgTheme({ org, children, header = true }: { org: OrgBrand | null; children: React.ReactNode; header?: boolean }) {
  const vars = orgThemeVars(org?.primaryColor);
  return (
    <div style={vars ? (vars as CSSProperties) : undefined} data-org={org?.slug ?? undefined}>
      {org && header && (
        <div className="mb-4 flex items-center gap-3 border-b pb-3">
          {org.logoFileId && org.slug && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/org-logo/${org.slug}`} alt={org.name} className="h-10 w-auto max-w-40 object-contain" />
          )}
          <span className="text-lg font-bold text-primary">{org.name}</span>
        </div>
      )}
      {children}
    </div>
  );
}

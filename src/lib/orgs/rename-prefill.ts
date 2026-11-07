/**
 * Renaming an organization field: every form that points at the old key must point at the new one, otherwise the
 * fields they fill would quietly go blank. Pure so it can be unit tested and reused for drafts and published
 * versions alike. Published versions are rewritten too – on purpose: the point is that they keep behaving exactly
 * as they did, and leaving them on a key that no longer exists would change their behaviour, not preserve it.
 */
import { ORG_FIELD_PREFIX } from "@/lib/forms/prefill";
import type { FormDefinition } from "@/lib/forms/schema";

/**
 * Returns the definition with every `org.fields.<from>` turned into `org.fields.<to>`, or `null` when it points at
 * the old key nowhere – so the caller writes only the versions that actually change.
 */
export function renameOrgFieldInDefinition(def: FormDefinition, from: string, to: string): FormDefinition | null {
  const oldKey = `${ORG_FIELD_PREFIX}${from}`;
  const newKey = `${ORG_FIELD_PREFIX}${to}`;
  let touched = false;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "prefill" && v === oldKey) {
          out[k] = newKey;
          touched = true;
        } else out[k] = walk(v);
      }
      return out;
    }
    return node;
  };
  const next = walk(def) as FormDefinition;
  return touched ? next : null;
}

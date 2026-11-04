/**
 * Pure model behind the "עיבוד טופס" tab: reading a stored value safely, splitting the completion
 * destination back out to `completion_recipients`, validating a destination and describing it in one line.
 * No DB and no network, so every rule here is unit tested.
 */
import { RECIPIENT_LABELS, type RecipientKind } from "@/lib/notifications/triggers";
import type { Recipient } from "@/lib/requests/recipients";
import { isValidEmail } from "@/lib/validators/israeli";
import type { StepRole } from "@/lib/workflow/types";
import {
  COMPLETION_DESTINATION_ID,
  type CutPart,
  type Destination,
  type Processing,
  type RecipientRef,
  type SendItem,
} from "./types";

export const emptyProcessing = (): Processing => ({ parts: [], destinations: [] });

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function normalizeItem(v: unknown): SendItem | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.kind === "full") return { kind: "full", ...(str(o.documentId) ? { documentId: str(o.documentId)! } : {}) };
  if (o.kind === "part" && str(o.partId)) return { kind: "part", partId: str(o.partId)! };
  if (o.kind === "attachment" && str(o.fieldId)) return { kind: "attachment", fieldId: str(o.fieldId)! };
  return null;
}

function normalizeRef(v: unknown): RecipientRef | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.kind === "role" && str(o.role)) return { kind: "role", role: str(o.role)! as RecipientKind };
  if (o.kind === "user" && str(o.userId)) return { kind: "user", userId: str(o.userId)! };
  if (o.kind === "step" && str(o.role)) return { kind: "step", role: str(o.role)! as StepRole };
  if (o.kind === "field" && str(o.fieldId)) return { kind: "field", fieldId: str(o.fieldId)! };
  if (o.kind === "fixed" && str(o.email)) {
    const email = str(o.email)!.toLowerCase();
    return { kind: "fixed", name: str(o.name) ?? email, email };
  }
  return null;
}

function normalizeDestination(v: unknown): Destination | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id);
  if (!id) return null;
  const items = Array.isArray(o.items) ? o.items.map(normalizeItem).filter((i): i is SendItem => !!i) : [];
  if (o.kind === "drive") {
    return { id, items, kind: "drive", ...(str(o.folderId) ? { folderId: str(o.folderId)! } : {}), ...(str(o.path) ? { path: str(o.path)! } : {}), ...(str(o.fileName) ? { fileName: str(o.fileName)! } : {}) };
  }
  if (o.kind === "email") {
    const to = Array.isArray(o.to) ? o.to.map(normalizeRef).filter((r): r is RecipientRef => !!r) : [];
    return { id, items, kind: "email", to, attach: o.attach !== false, ...(str(o.note) ? { note: str(o.note)! } : {}) };
  }
  if (o.kind === "webhook" && str(o.webhookId)) return { id, items, kind: "webhook", webhookId: str(o.webhookId)! };
  return null;
}

function normalizePart(v: unknown): CutPart | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id);
  if (!id) return null;
  return {
    id,
    name: str(o.name) ?? "",
    pages: str(o.pages) ?? "",
    ...(str(o.documentId) ? { documentId: str(o.documentId)! } : {}),
    ...(str(o.typeId) ? { typeId: str(o.typeId)! } : {}),
  };
}

/**
 * Reads anything shaped like a `Processing` — the jsonb column, or what the tab posts back — without ever
 * throwing. `keepCompletion` is for the save path, where the completion destination still has to be read
 * (and checked) before it is split out to `completion_recipients`.
 */
export function normalizeProcessing(v: unknown, keepCompletion = false): Processing {
  if (!v || typeof v !== "object") return emptyProcessing();
  const o = v as Record<string, unknown>;
  const parts = Array.isArray(o.parts) ? o.parts.map(normalizePart).filter((p): p is CutPart => !!p) : [];
  const destinations = Array.isArray(o.destinations) ? o.destinations.map(normalizeDestination).filter((d): d is Destination => !!d) : [];
  // The completion destination lives in `completion_recipients`, never inside the column: drop a stale copy.
  return { parts, destinations: keepCompletion ? destinations : destinations.filter((d) => d.id !== COMPLETION_DESTINATION_ID) };
}

/**
 * The destination that mirrors "מקבלי המסמכים החתומים בסיום". Built from the package column so the tab and the
 * send settings always show the same addresses; it only ever holds fixed addresses, because that column does.
 */
export function completionDestination(recipients: Recipient[] | null | undefined): Destination {
  return {
    id: COMPLETION_DESTINATION_ID,
    kind: "email",
    attach: true,
    items: [{ kind: "full" }],
    to: (recipients ?? []).map((r) => ({ kind: "fixed", name: r.name || r.email, email: r.email })),
  };
}

/** What the tab shows: the stored processing with the completion destination in front. */
export function viewProcessing(stored: unknown, recipients: Recipient[] | null | undefined): Processing {
  const p = normalizeProcessing(stored);
  return { parts: p.parts, destinations: [completionDestination(recipients), ...p.destinations] };
}

/**
 * The reverse of `viewProcessing`: what gets written where. The completion destination becomes the package's
 * `completionRecipients`; everything else stays in the `processing` column.
 */
export function splitProcessing(view: Processing): { processing: Processing; completionRecipients: Recipient[] } {
  const completion = view.destinations.find((d) => d.id === COMPLETION_DESTINATION_ID);
  const recipients: Recipient[] = [];
  if (completion?.kind === "email") {
    for (const ref of completion.to) {
      // That column holds plain addresses, so only fixed ones can be kept there.
      if (ref.kind !== "fixed") continue;
      const email = ref.email.trim().toLowerCase();
      if (!isValidEmail(email) || recipients.some((r) => r.email === email)) continue;
      recipients.push({ name: ref.name?.trim() || email, email });
    }
  }
  return {
    processing: { parts: view.parts, destinations: view.destinations.filter((d) => d.id !== COMPLETION_DESTINATION_ID) },
    completionRecipients: recipients,
  };
}

/** What the editor knows about the form around a destination, for labels and validation. */
export interface ProcessingContext {
  parts: CutPart[];
  /** Documents of the package; a single-document form may leave this empty. */
  documents?: { id: string; title: string }[];
  /** Upload fields of the form ("צילום ת\"ז"). */
  attachments?: { id: string; label: string }[];
  /** Steps of the form, by role, as "שלבי הטופס" shows them. */
  steps?: { role: string; label: string }[];
  /** E-mail fields of the form, with the step that fills them. */
  emailFields?: { id: string; label: string }[];
  users?: { id: string; label: string }[];
  webhooks?: { id: string; label: string }[];
}

export function itemLabel(item: SendItem, ctx: ProcessingContext): string {
  if (item.kind === "part") return ctx.parts.find((p) => p.id === item.partId)?.name?.trim() || "חלק שנמחק";
  if (item.kind === "attachment") {
    if (item.fieldId === "*") return "כל המסמכים הנלווים";
    return ctx.attachments?.find((a) => a.id === item.fieldId)?.label ?? "שדה שנמחק";
  }
  const doc = item.documentId ? ctx.documents?.find((d) => d.id === item.documentId)?.title : undefined;
  return doc ? `${doc} (המסמך המלא)` : "המסמך החתום המלא";
}

export function recipientLabel(ref: RecipientRef, ctx: ProcessingContext): string {
  switch (ref.kind) {
    case "role":
      return RECIPIENT_LABELS[ref.role] ?? ref.role;
    case "user":
      return ctx.users?.find((u) => u.id === ref.userId)?.label ?? "משתמש שנמחק";
    case "step":
      return ctx.steps?.find((s) => s.role === ref.role)?.label ?? "שלב שנמחק";
    case "field":
      return ctx.emailFields?.find((f) => f.id === ref.fieldId)?.label ?? "שדה שנמחק";
    case "fixed":
      return ref.name && ref.name !== ref.email ? `${ref.name} <${ref.email}>` : ref.email;
  }
}

/** Everything that keeps a destination from running, in Hebrew, for the card itself. */
export function destinationProblems(d: Destination, ctx: ProcessingContext): string[] {
  const out: string[] = [];
  if (d.items.length === 0) out.push("לא נבחר מה נשלח");
  for (const item of d.items) {
    if (item.kind === "part" && !ctx.parts.some((p) => p.id === item.partId)) out.push("אחד החלקים שנבחרו כבר לא קיים");
    if (item.kind === "attachment" && item.fieldId !== "*" && ctx.attachments && !ctx.attachments.some((a) => a.id === item.fieldId)) {
      out.push("שדה ההעלאה שנבחר כבר לא קיים");
    }
  }
  if (d.kind === "email") {
    if (d.to.length === 0) out.push("לא נבחרו נמענים");
    for (const ref of d.to) {
      if (ref.kind === "step" && ctx.steps && !ctx.steps.some((s) => s.role === ref.role)) out.push("אחד הנמענים מצביע על שלב שנמחק");
      if (ref.kind === "field" && ctx.emailFields && !ctx.emailFields.some((f) => f.id === ref.fieldId)) out.push("אחד הנמענים מצביע על שדה שנמחק");
      if (ref.kind === "user" && ctx.users && !ctx.users.some((u) => u.id === ref.userId)) out.push("אחד הנמענים מצביע על משתמש שנמחק");
    }
  }
  if (d.kind === "drive" && !d.folderId && !d.path) out.push("לא נבחרה תיקייה ולא הוזן נתיב");
  if (d.kind === "webhook" && ctx.webhooks && !ctx.webhooks.some((w) => w.id === d.webhookId)) out.push("ה-webhook שנבחר כבר לא קיים");
  return [...new Set(out)];
}

/** One line for the collapsed card: what goes where. */
export function describeDestination(d: Destination, ctx: ProcessingContext): string {
  const what = d.items.length === 0 ? "—" : d.items.map((i) => itemLabel(i, ctx)).join(" + ");
  if (d.kind === "drive") return `${what} → ${d.path || "תיקייה שנבחרה בדרייב"}`;
  if (d.kind === "webhook") return `${what} → ${ctx.webhooks?.find((w) => w.id === d.webhookId)?.label ?? "webhook"}`;
  const to = d.to.length === 0 ? "—" : d.to.map((r) => recipientLabel(r, ctx)).join(", ");
  return `${what} → ${to}`;
}

/** The tab's summary line, for the tab label and the empty state. */
export function describeProcessing(p: Processing): string {
  const parts = p.parts.length ? `חיתוך ל-${p.parts.length} חלקים` : "";
  const dest = p.destinations.length ? `${p.destinations.length} יעדים` : "";
  return [parts, dest].filter(Boolean).join(" · ") || "אין עיבוד";
}

export const newDestinationId = (): string => `d${Math.random().toString(36).slice(2, 10)}`;

/**
 * What each destination of "עיבוד טופס" actually sends, and to whom. Pure and unit tested: the engine does
 * the network and the database, this decides the content, so the rules can be checked without either.
 */
import { isValidEmail } from "@/lib/validators/israeli";
import type { Recipient } from "@/lib/requests/recipients";
import type { Destination, RecipientRef, SendItem } from "./types";

/** A stored file a destination can send: a whole document, a part, or something a signer uploaded. */
export interface SendableFile {
  /** The document row this came from, when it came from one. */
  documentId?: string;
  /** The stored file to read. For a part this is the whole signed document it is cut out of. */
  fileId: string;
  name: string;
  /**
   * Set on a part: the pages to cut out of `fileId` on the way out, and how many pages the document had
   * before its certificate page was appended — so "3-" means "to the end of the form", never the certificate.
   */
  cut?: { pages: string; sourcePages?: number };
}

/** Everything of one request a destination may pick from. */
export interface RequestFiles {
  /** Whole signed documents, by the package item (form template) they belong to. */
  documents: { documentId: string; templateId?: string; fileId: string | null; title: string }[];
  /** Parts the form defines, as cuts of the signed documents — never stored documents of their own. */
  parts: { documentId: string; partId: string; fileId: string | null; name: string; pages: string; sourcePages?: number }[];
  /** Files signers uploaded, by the field they were uploaded in. */
  uploads: { fieldId: string; fileId: string; name: string }[];
}

const seen = <T>(list: T[], key: (t: T) => string): T[] => {
  const out: T[] = [];
  const had = new Set<string>();
  for (const t of list) {
    const k = key(t);
    if (had.has(k)) continue;
    had.add(k);
    out.push(t);
  }
  return out;
};

/**
 * The files one item names. A document or part that has no stored file yet is left out rather than sent as a
 * broken reference — the destination simply has nothing to send until the request is finalized.
 */
export function filesForItem(item: SendItem, files: RequestFiles): SendableFile[] {
  if (item.kind === "full") {
    return files.documents
      .filter((d) => (item.documentId ? d.templateId === item.documentId : true))
      .filter((d) => d.fileId)
      .map((d) => ({ documentId: d.documentId, fileId: d.fileId!, name: `${d.title}.pdf` }));
  }
  if (item.kind === "part") {
    return files.parts
      .filter((p) => p.partId === item.partId && p.fileId)
      .map((p) => ({ documentId: p.documentId, fileId: p.fileId!, name: `${p.name}.pdf`, cut: { pages: p.pages, sourcePages: p.sourcePages } }));
  }
  return files.uploads
    .filter((u) => item.fieldId === "*" || u.fieldId === item.fieldId)
    .map((u) => ({ fileId: u.fileId, name: u.name }));
}

/** Everything a destination sends, each file once even when two items name it. */
export function filesForDestination(d: Destination, files: RequestFiles): SendableFile[] {
  return seen(d.items.flatMap((i) => filesForItem(i, files)), (f) => `${f.fileId}:${f.cut?.pages ?? ""}`);
}

/** The people a `RecipientRef` stands for, looked up by the engine and passed in here. */
export interface PeopleLookup {
  /** By `RecipientKind`: the employee, whoever opened the request, the organization's addresses… */
  byRole: Partial<Record<string, Recipient[]>>;
  /** By step role: whoever signed that step. */
  byStep: Partial<Record<string, Recipient | undefined>>;
  /** By field id: the address filled into that field. */
  byField: Partial<Record<string, string | undefined>>;
  /** By user id. */
  byUser: Partial<Record<string, Recipient | undefined>>;
}

function peopleForRef(ref: RecipientRef, look: PeopleLookup): Recipient[] {
  switch (ref.kind) {
    case "role":
      return look.byRole[ref.role] ?? [];
    case "step": {
      const p = look.byStep[ref.role];
      return p ? [p] : [];
    }
    case "user": {
      const p = look.byUser[ref.userId];
      return p ? [p] : [];
    }
    case "field": {
      const email = look.byField[ref.fieldId];
      return email ? [{ name: email, email }] : [];
    }
    case "fixed":
      return [{ name: ref.name || ref.email, email: ref.email }];
  }
}

/**
 * Who an e-mail destination goes to: every reference resolved, invalid and repeated addresses dropped.
 * One person named twice (as "the employee" and by address) is still mailed once.
 */
export function recipientsFor(refs: RecipientRef[], look: PeopleLookup): Recipient[] {
  const all = refs.flatMap((r) => peopleForRef(r, look));
  const valid = all
    .map((p) => ({ name: (p.name || "").trim() || p.email.trim(), email: p.email.trim().toLowerCase() }))
    .filter((p) => isValidEmail(p.email));
  return seen(valid, (p) => p.email);
}

/** One line naming where a delivery went, stored on the row so the request page needs no second lookup. */
export function describeTarget(d: Destination, to: Recipient[]): string {
  if (d.kind === "drive") return d.path || "תיקייה בדרייב";
  if (d.kind === "webhook") return "webhook";
  return to.map((p) => (p.name && p.name !== p.email ? `${p.name} <${p.email}>` : p.email)).join(", ");
}

/** Why a destination has nothing to do, in Hebrew — recorded instead of a silent no-op. */
export function skipReason(d: Destination, files: SendableFile[], to: Recipient[]): string | null {
  if (files.length === 0) return "אין קבצים לשלוח (החלק לא נוצר או שההעלאה חסרה)";
  if (d.kind === "email" && to.length === 0) return "אין נמען תקין";
  return null;
}

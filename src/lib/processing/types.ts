/**
 * "עיבוד טופס": what happens to the signed documents once every step is done — cutting them into parts,
 * and mailing each piece to whoever should get it.
 * Pure types only (no runtime imports), so `src/db/schema.ts` can import them for the jsonb column.
 */
import type { RecipientKind } from "@/lib/notifications/triggers";
import type { StepRole } from "@/lib/workflow/types";

/** A slice of a signed document, cut out before the certificate page is appended (so parts come out clean). */
export interface CutPart {
  id: string;
  /** What the piece is called, in the UI and as `{סוג}` fallback: "101", "הסכם העסקה". */
  name: string;
  /** Which document of the package is cut; empty = the form's only document. */
  documentId?: string;
  /** Page ranges, 1-based: "1-2,5" or "3-" (to the end). */
  pages: string;
  /** Document type (`document_types`), for consistent folder and file names between organizations. */
  typeId?: string;
}

/** What a destination sends. One destination can carry several of these. */
export type SendItem =
  /** The full signed document, certificate page included. */
  | { kind: "full"; documentId?: string }
  /** One part cut out by `Processing.parts` (no certificate page). */
  | { kind: "part"; partId: string }
  /** A file a signer uploaded; `fieldId: "*"` = every upload of the request. */
  | { kind: "attachment"; fieldId: string };

/** Who an e-mail destination goes to. */
export type RecipientRef =
  /** One of the roles the mail triggers already know ("העובד", "שולח הבקשה"…). */
  | { kind: "role"; role: RecipientKind }
  /** A user of the system. */
  | { kind: "user"; userId: string }
  /** Whoever signed that step of the request. */
  | { kind: "step"; role: StepRole }
  /** The address that was filled into an e-mail field of the form. */
  | { kind: "field"; fieldId: string }
  /** A fixed address typed here. */
  | { kind: "fixed"; name: string; email: string };

export interface EmailDestination {
  kind: "email";
  to: RecipientRef[];
  /** Attach the files themselves; off = a link to the request only. */
  attach: boolean;
  /** A line added to the message body. */
  note?: string;
}

/**
 * A destination is an e-mail and nothing else. Drive filing and webhooks were built and taken out again
 * (5.11.2026): the tool cuts, and sends what it cut to a person.
 */
export type Destination = { id: string; items: SendItem[] } & EmailDestination;

export type DestinationKind = Destination["kind"];

export interface Processing {
  parts: CutPart[];
  destinations: Destination[];
}

/**
 * The id of the destination that mirrors `package_templates.completion_recipients` — the same addresses the
 * send settings call "מקבלי המסמכים החתומים בסיום". It is never stored inside `processing`: it is built from
 * that column on load and written back to it on save, so both screens edit one value.
 */
export const COMPLETION_DESTINATION_ID = "completion";

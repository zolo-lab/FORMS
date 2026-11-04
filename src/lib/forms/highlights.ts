/**
 * "שדה מזהה" and the details block of the messages.
 *
 * A form's builder can mark one field as the request's identifier (`identifier`) and any number of fields as
 * details to show in the messages (`showInMessages`). Both are read here from the definitions plus the answers
 * given so far, so the requests table can show one column for every form and `{{details}}` can be filled in the
 * e-mails and SMS. Internal (staff-only) fields never leave the system, so they are skipped.
 *
 * Pure, unit tested.
 */
import type { Answers } from "./conditions";
import { formatAnswer } from "./format";
import { allFields, type FormDefinition, type FormField } from "./schema";

export interface HighlightLine {
  label: string;
  value: string;
}

export interface Highlights {
  /** The identifying fields of the form, in its own order; empty = the form defines none. */
  identifiers: HighlightLine[];
  /** The identifiers plus every field marked "show in messages", in the order of the form. */
  lines: HighlightLine[];
}

const EMPTY: Highlights = { identifiers: [], lines: [] };

/** What separates several identifying fields wherever they are shown as one value. */
export const IDENTIFIER_SEPARATOR = " · ";

const labelOf = (f: FormField) => f.label?.trim() || f.id;

/** The value of one field as a person reads it ("" when not filled yet). */
function valueOf(field: FormField, answers: Answers): string {
  const raw = answers[field.id];
  if (raw === undefined || raw === null || raw === "") return "";
  return formatAnswer(field, raw).trim();
}

/**
 * Reads the identifying fields and the message details out of one or more form definitions (a package has several)
 * and the answers collected so far. A form may mark several fields as identifying: together they name the request,
 * in the order of the form. A field that appears in two forms of the same package is taken once.
 */
export function highlightsOf(defs: FormDefinition | FormDefinition[], answers: Answers): Highlights {
  const all = Array.isArray(defs) ? defs : [defs];
  if (!all.length) return EMPTY;
  const identifiers: HighlightLine[] = [];
  const lines: HighlightLine[] = [];
  const seen = new Set<string>();
  for (const def of all) {
    for (const f of allFields(def)) {
      if (f.internal || seen.has(f.id)) continue;
      if (f.identifier !== true && f.showInMessages !== true) continue;
      seen.add(f.id);
      const line = { label: labelOf(f), value: valueOf(f, answers) };
      if (f.identifier === true) identifiers.push(line);
      lines.push(line);
    }
  }
  return { identifiers, lines };
}

/** The identifying fields as one label and one value, the way the requests table and the messages show them. */
export function identifierOf(h: Highlights): HighlightLine | null {
  if (!h.identifiers.length) return null;
  return {
    label: h.identifiers.map((l) => l.label).join(IDENTIFIER_SEPARATOR),
    // Only the ones filled so far, so a half-filled request still reads well.
    value: h.identifiers.map((l) => l.value).filter(Boolean).join(IDENTIFIER_SEPARATOR),
  };
}

/** The details block of a message: one "label: value" per line. Fields not filled yet are left out. */
export function detailsText(h: Highlights): string {
  return h.lines
    .filter((l) => l.value)
    .map((l) => `${l.label}: ${l.value}`)
    .join("\n");
}

/** The same block for the designed HTML e-mails (the caller escapes it; `renderHtml` turns the newlines into <br>). */
export const detailsLines = (h: Highlights): HighlightLine[] => h.lines.filter((l) => l.value);

/**
 * What the requests table shows in the "שדה מזהה" column: the identifier's value, and – only for a form that
 * defines no identifier at all – the name typed when the request was opened, so the column is never useless.
 */
export function identifierValue(h: Highlights, fallback: string): string {
  const id = identifierOf(h);
  return id ? id.value : fallback;
}

/**
 * What a tracking screen calls one request: the form's own identifier once it is filled, and the name the request
 * was opened with for a form that defines no identifier. "" means an identifier that nobody filled yet.
 */
export function requestLabel(r: { identifierLabel?: string | null; identifierValue?: string | null; subjectName: string }): string {
  return r.identifierLabel ? (r.identifierValue ?? "") : r.subjectName;
}

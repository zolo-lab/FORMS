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
  /** The identifying field of the form: its label, and its value so far ("" until it is filled). */
  identifier: HighlightLine | null;
  /** The identifier plus every field marked "show in messages", in the order of the form. */
  lines: HighlightLine[];
}

const EMPTY: Highlights = { identifier: null, lines: [] };

const labelOf = (f: FormField) => f.label?.trim() || f.id;

/** The value of one field as a person reads it ("" when not filled yet). */
function valueOf(field: FormField, answers: Answers): string {
  const raw = answers[field.id];
  if (raw === undefined || raw === null || raw === "") return "";
  return formatAnswer(field, raw).trim();
}

/**
 * Reads the identifier and the message details out of one or more form definitions (a package has several) and
 * the answers collected so far. The first field marked `identifier` wins, so a package cannot have two.
 */
export function highlightsOf(defs: FormDefinition | FormDefinition[], answers: Answers): Highlights {
  const all = Array.isArray(defs) ? defs : [defs];
  if (!all.length) return EMPTY;
  let identifier: HighlightLine | null = null;
  const lines: HighlightLine[] = [];
  const seen = new Set<string>();
  for (const def of all) {
    for (const f of allFields(def)) {
      if (f.internal || seen.has(f.id)) continue;
      const wanted = f.identifier === true || f.showInMessages === true;
      if (!wanted) continue;
      seen.add(f.id);
      const line = { label: labelOf(f), value: valueOf(f, answers) };
      if (f.identifier === true && !identifier) identifier = line;
      lines.push(line);
    }
  }
  return { identifier, lines };
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
  if (!h.identifier) return fallback;
  return h.identifier.value;
}

/**
 * What a tracking screen calls one request: the form's own identifier once it is filled, and the name the request
 * was opened with for a form that defines no identifier. "" means an identifier that nobody filled yet.
 */
export function requestLabel(r: { identifierLabel?: string | null; identifierValue?: string | null; subjectName: string }): string {
  return r.identifierLabel ? (r.identifierValue ?? "") : r.subjectName;
}

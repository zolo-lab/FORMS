/** "Card" layout: one question per screen. Pure helpers for building the screens and the review list. */
import { evaluateCondition, type Answers } from "./conditions";
import { FIELD_TYPE_META } from "./field-types";
import { formatAnswer } from "./format";
import { reachedPageIndexes } from "./paths";
import type { FillerRole, FormDefinition, FormField } from "./schema";

export interface Card {
  pageIndex: number;
  /** Heading / explanation blocks shown above the question. */
  blocks: FormField[];
  /** The question; null for a closing screen made only of blocks. */
  field: FormField | null;
}

export function buildCards(form: FormDefinition, answers: Answers, role?: FillerRole): Card[] {
  const cards: Card[] = [];
  for (const pageIndex of reachedPageIndexes(form, answers)) {
    let blocks: FormField[] = [];
    for (const f of form.pages[pageIndex]!.fields) {
      if (!evaluateCondition(f.visibleIf, answers) || f.type === "hidden") continue;
      if (!FIELD_TYPE_META[f.type].hasAnswer) {
        blocks.push(f);
        continue;
      }
      const editable = (!role || (f.filledBy ?? "employee") === role) && !f.readOnly && !f.formula && !(f.disabledIf && evaluateCondition(f.disabledIf, answers));
      if (!editable) continue;
      cards.push({ pageIndex, blocks, field: f });
      blocks = [];
    }
    if (blocks.length) cards.push({ pageIndex, blocks, field: null });
  }
  return cards;
}

export interface ReviewItem {
  cardIndex: number;
  label: string;
  text: string;
}

/** Label/value pairs for the review-before-submit screen (empty answers show a dash). */
export function reviewItems(cards: Card[], answers: Answers): ReviewItem[] {
  return cards.flatMap((c, cardIndex) =>
    c.field ? [{ cardIndex, label: c.field.label || c.field.id, text: c.field.type === "signature" ? (answers[c.field.id] ? "נחתם" : "—") : formatAnswer(c.field, answers[c.field.id]) || "—" }] : [],
  );
}

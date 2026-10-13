/** Answer piping: "שלום {{firstName}}" shows the filler's earlier answer inside labels and explanations. */
import type { Answers } from "./conditions";
import { formatAnswer } from "./format";
import { allFields, type FormDefinition } from "./schema";

const TOKEN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

export function hasPiping(text: string | undefined): boolean {
  return !!text && text.includes("{{");
}

/** Replace `{{fieldId}}` with the formatted answer; unknown or empty fields become an empty string. */
export function pipeText(text: string, answers: Answers, form: FormDefinition): string {
  if (!hasPiping(text)) return text;
  const fields = new Map(allFields(form).map((f) => [f.id, f]));
  return text.replace(TOKEN, (_, id: string) => {
    const field = fields.get(id);
    const value = answers[id];
    if (!field || value === undefined || value === null) return "";
    return formatAnswer(field, value);
  });
}

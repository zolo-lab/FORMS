import { isValidIsraeliId } from "./id";
import { toWaDigits } from "./phone";
import type { RecipientInput } from "./types";

export interface ParsedRecipient extends RecipientInput {
  error?: string;
}

/** Lines of `שם, טלפון` or `שם, טלפון, ת"ז`. A header row is skipped. */
export function parseRecipients(text: string): ParsedRecipient[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const out: ParsedRecipient[] = [];
  for (const line of lines) {
    const parts = line.split(/[,;\t]/).map((part) => part.trim()).filter((part) => part.length > 0);
    if (!parts.length) continue;
    const head = parts[0] ?? "";
    if (/^(שם|name|טלפון|phone)$/i.test(head)) continue;
    let name = "";
    let phone = "";
    let idNumber = "";
    if (parts.length === 1 && toWaDigits(head)) phone = head;
    else {
      name = head;
      phone = parts[1] ?? "";
      idNumber = parts[2] ?? "";
    }
    let error: string | undefined;
    if (!toWaDigits(phone)) error = "טלפון לא תקין";
    else if (idNumber && !isValidIsraeliId(idNumber)) error = "ת\"ז לא תקינה";
    out.push({ name, phone, idNumber, error });
  }
  return out;
}

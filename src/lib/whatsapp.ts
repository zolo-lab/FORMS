/** "Share via WhatsApp" links. Pure: no I/O. */

/** Israeli phone → international digits without "+" (what wa.me expects), or null if it can't be valid. */
export function normalizeIsraeliPhone(input: string): string | null {
  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("972")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  else return null;
  return /^\d{8,9}$/.test(d) ? `972${d}` : null;
}

export function whatsappUrl(phone: string | undefined, text: string): string {
  const to = phone ? normalizeIsraeliPhone(phone) : null;
  return `https://wa.me/${to ?? ""}?text=${encodeURIComponent(text)}`;
}

/** Only web, mail and phone links; anything else (javascript:, data:) is not rendered. */
export function safeLinkUrl(raw: string): string | null {
  const u = raw.trim();
  return /^(https?:\/\/|mailto:|tel:)/i.test(u) ? u : null;
}

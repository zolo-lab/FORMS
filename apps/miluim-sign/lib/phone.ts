/** Israeli phone → wa.me digits (9725…), or null. Same rules as the main app's `normalizeIsraeliPhone` for WhatsApp. */
export function toWaDigits(input: string): string | null {
  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("972")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  else return null;
  return /^\d{8,9}$/.test(d) ? `972${d}` : null;
}

export function waLink(phone: string, text: string): string | null {
  const to = toWaDigits(phone);
  if (!to) return null;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

export function signMessage(name: string, link: string): string {
  const hello = name.trim() ? `שלום ${name.trim()},\n` : "שלום,\n";
  return `${hello}מצורף כתב הסכמה לחריגי קריאה / חריגי שירות לחתימה.\n${link}\nתודה`;
}

export function remindMessage(name: string, link: string): string {
  const hello = name.trim() ? `שלום ${name.trim()}, ` : "שלום, ";
  return `${hello}תזכורת: כתב ההסכמה עדיין ממתין לחתימה.\n${link}`;
}

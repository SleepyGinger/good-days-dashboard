/** Journal dates are calendar days in the user's timezone, never UTC timestamps. */
export function isoToLocalDate(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Choose a valid date.");
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("Choose a valid date.");
  }
  return date;
}

export function isoLocal(date = new Date()): string {
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const localDateToIso = isoLocal;

export function isoToKey(iso: string): string {
  isoToLocalDate(iso);
  return iso.replaceAll("-", "");
}

export function formatDate(iso: string, withYear = true): string {
  return isoToLocalDate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function themeCoversDate(theme: { start: string; end?: string | null }, iso: string): boolean {
  return iso >= theme.start && (!theme.end || iso <= theme.end);
}

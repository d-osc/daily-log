import { getLang } from "./i18n";

export function weekdays(): string[] {
  return getLang() === "th"
    ? ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
}

/** Local-time date -> "YYYY-MM-DD" */
export function toKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "YYYY-MM-DD" -> local-time Date */
export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatThaiDate(key: string): string {
  if (!key) return getLang() === "th" ? "ไม่ระบุวันที่" : "No date";
  const locale = getLang() === "th" ? "th-TH" : "en-GB";
  return fromKey(key).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatMonth(month: Date): string {
  const locale = getLang() === "th" ? "th-TH" : "en-GB";
  return month.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** 42 day cells (6 weeks, Sunday first) covering the given month */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return d;
  });
}

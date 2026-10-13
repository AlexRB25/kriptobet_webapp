// Copy of web/src/lib/format.ts — change both.

const number = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1,250.00" */
export const money = (value: number) => number.format(value);

/** "1,250.00 USDT" */
export const usdt = (value: number) => `${number.format(value)} USDT`;

/** Decimal odds always show two decimals: 2.10 */
export const odds = (value: number) => value.toFixed(2);

const dayTime = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const time = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });

/** "Hoy 19:00", "Mañana 13:30" or "sáb 17 oct, 19:00" */
export function kickoff(iso: string) {
  const date = new Date(iso);
  const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return `Hoy ${time.format(date)}`;
  if (days === 1) return `Mañana ${time.format(date)}`;
  return dayTime.format(date);
}

export const dateTime = (iso: string) => dayTime.format(new Date(iso));

/** Text of a money input → number with at most two decimals, or null. */
export function parseAmount(text: string): number | null {
  const value = Number(text.replace(",", ".").trim());
  if (!text.trim() || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

// Datas de ocorrência são dias de calendário em America/Sao_Paulo, representados
// como texto ISO "YYYY-MM-DD". Toda a aritmética usa UTC ao meio-dia para não
// sofrer com fuso ou horário de verão.

export const TIMEZONE = "America/Sao_Paulo";

export type IsoDate = string; // "YYYY-MM-DD"

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const d = toUtcNoon(value);
  return !Number.isNaN(d.getTime()) && fromUtc(d) === value;
}

function toUtcNoon(iso: IsoDate): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function fromUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

/** Data de hoje no calendário de São Paulo. */
export function todayLocal(now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = toUtcNoon(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Segunda-feira da semana (segunda a domingo) que contém a data. */
export function weekStartOf(iso: IsoDate): IsoDate {
  const dow = toUtcNoon(iso).getUTCDay(); // 0 = domingo
  const offset = dow === 0 ? 6 : dow - 1;
  return addDays(iso, -offset);
}

export function weekEndOf(iso: IsoDate): IsoDate {
  return addDays(weekStartOf(iso), 6);
}

export function isMonday(iso: IsoDate): boolean {
  return isIsoDate(iso) && toUtcNoon(iso).getUTCDay() === 1;
}

export function weekDays(weekStart: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Último dia aceito para lançamentos: domingo da semana atual. */
export function maxEntryDate(now: Date = new Date()): IsoDate {
  return weekEndOf(todayLocal(now));
}

/** Data sugerida ao abrir um formulário a partir de uma semana. */
export function suggestedDateForWeek(weekStart: IsoDate, now: Date = new Date()): IsoDate {
  const today = todayLocal(now);
  if (weekStartOf(today) === weekStart) return today;
  return weekStart;
}

const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function formatDateBR(iso: IsoDate): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatShortBR(iso: IsoDate): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function weekdayName(iso: IsoDate): string {
  return WEEKDAY[toUtcNoon(iso).getUTCDay()];
}

export function formatWeekRange(weekStart: IsoDate): string {
  return `${formatShortBR(weekStart)} a ${formatDateBR(addDays(weekStart, 6))}`;
}

export function formatDateTimeBR(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

/** Primeiro e último dia do mês ("YYYY-MM"). */
export function monthRange(month: string): { from: IsoDate; to: IsoDate } {
  const [y, m] = month.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to: addDays(next, -1) };
}

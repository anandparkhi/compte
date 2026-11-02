/**
 * Dates, financial years and GST return periods.
 * Calendar dates are handled as "YYYY-MM-DD" strings in Asia/Kolkata and stored as UTC-midnight
 * DateTimes (date-only semantics).
 */
export type FilingFrequency = "MONTHLY" | "QUARTERLY";

export function todayIST(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function dateOnly(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Invalid date ${iso}`);
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) throw new Error(`Invalid date ${iso}`);
  return d;
}

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "2026-27" for any date from 2026-04-01 to 2027-03-31 */
export function financialYearOf(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function fyStartYear(fy: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(fy);
  if (!m) throw new Error(`Invalid financial year ${fy}`);
  const start = Number(m[1]);
  if ((start + 1) % 100 !== Number(m[2])) throw new Error(`Invalid financial year ${fy}`);
  return start;
}

export function fyShort(fy: string): string {
  const s = fyStartYear(fy);
  return `${String(s % 100).padStart(2, "0")}-${String((s + 1) % 100).padStart(2, "0")}`;
}

export function fyBounds(fy: string): { start: string; end: string } {
  const s = fyStartYear(fy);
  return { start: `${s}-04-01`, end: `${s + 1}-03-31` };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface ReturnPeriod {
  /** GSTN return period MMYYYY — last month of the quarter for quarterly filers */
  key: string;
  frequency: FilingFrequency;
  financialYear: string;
  /** inclusive first date, exclusive end date (YYYY-MM-DD) */
  start: string;
  endExclusive: string;
  months: { year: number; month: number }[];
  label: string;
  /** quarter number within FY (1-4) for quarterly periods */
  quarter?: number;
}

export class PeriodError extends Error {}

const GST_START = { year: 2017, month: 7 };

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}
const ymd = (y: number, m: number, d = 1) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function parsePeriodKey(key: string, frequency: FilingFrequency): ReturnPeriod {
  if (!/^\d{6}$/.test(key ?? "")) throw new PeriodError("Return period must be in MMYYYY format");
  const month = Number(key.slice(0, 2));
  const year = Number(key.slice(2));
  if (month < 1 || month > 12) throw new PeriodError("Invalid month in return period");
  if (year < GST_START.year || (year === GST_START.year && month < GST_START.month)) throw new PeriodError("GST return periods start from July 2017");
  if (frequency === "QUARTERLY") {
    if (![3, 6, 9, 12].includes(month)) throw new PeriodError("Quarterly filers must use the last month of the quarter (03, 06, 09 or 12)");
    const firstMonth = month - 2;
    const months = [0, 1, 2].map((i) => ({ year, month: firstMonth + i }));
    const end = nextMonth(year, month);
    const fy = financialYearOf(ymd(year, month));
    const quarter = month === 6 ? 1 : month === 9 ? 2 : month === 12 ? 3 : 4;
    return {
      key, frequency, financialYear: fy, months, quarter,
      start: ymd(year, firstMonth), endExclusive: ymd(end.year, end.month),
      label: `${MONTHS[firstMonth - 1]}–${MONTHS[month - 1]} ${year} (Q${quarter} FY ${fy})`,
    };
  }
  const end = nextMonth(year, month);
  return {
    key, frequency, financialYear: financialYearOf(ymd(year, month)),
    months: [{ year, month }], start: ymd(year, month), endExclusive: ymd(end.year, end.month),
    label: `${MONTHS_LONG[month - 1]} ${year}`,
  };
}

export function periodKeyFor(year: number, month: number): string {
  return `${String(month).padStart(2, "0")}${year}`;
}

/** Period that contains a given date for a filing frequency */
export function periodForDate(isoDate: string, frequency: FilingFrequency): ReturnPeriod {
  const [y, m] = isoDate.split("-").map(Number);
  const month = frequency === "QUARTERLY" ? Math.ceil(m / 3) * 3 : m;
  return parsePeriodKey(periodKeyFor(y, month), frequency);
}

export function listPeriodsForFY(fy: string, frequency: FilingFrequency): ReturnPeriod[] {
  const s = fyStartYear(fy);
  const keys: string[] = [];
  if (frequency === "QUARTERLY") keys.push(periodKeyFor(s, 6), periodKeyFor(s, 9), periodKeyFor(s, 12), periodKeyFor(s + 1, 3));
  else for (let i = 0; i < 12; i++) { const m = ((3 + i) % 12) + 1; keys.push(periodKeyFor(m >= 4 ? s : s + 1, m)); }
  return keys.filter((k) => { try { parsePeriodKey(k, frequency); return true; } catch { return false; } }).map((k) => parsePeriodKey(k, frequency));
}

/** GSTN allows nil filing only after the tax period ends (from the 1st of the following month). */
export function isPeriodEnded(p: ReturnPeriod, today: string): boolean {
  return today >= p.endExclusive;
}

export function isDateInPeriod(isoDate: string, p: ReturnPeriod): boolean {
  return isoDate >= p.start && isoDate < p.endExclusive;
}

export function currentFinancialYear(today = todayIST()): string {
  return financialYearOf(today);
}

export function formatDateIN(d: Date | string): string {
  const iso = typeof d === "string" ? d : toDateString(d);
  const [y, m, day] = iso.split("-");
  return `${day}-${m}-${y}`;
}

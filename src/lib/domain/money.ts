import Decimal from "decimal.js";

// Dedicated Decimal constructor so global config elsewhere can't affect tax maths.
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

export function dec(v: string | number | Dec): Dec {
  if (typeof v === "number" && !Number.isFinite(v)) throw new Error("non-finite number");
  return new D(v as Decimal.Value);
}

/** Round to paise, half-up, return fixed 2dp string */
export function money(v: Dec | string): string {
  return dec(v).toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2);
}

export function sumMoney(values: (string | Dec)[]): string {
  return money(values.reduce<Dec>((acc, v) => acc.plus(dec(v)), dec(0)));
}

/** Indian digit grouping: 1234567.5 -> "12,34,567.50" */
export function formatIndianNumber(v: string | Dec, fractionDigits = 2): string {
  const d = dec(v);
  const neg = d.isNegative();
  const [intPart, frac] = d.abs().toFixed(fractionDigits).split(".");
  let grouped = intPart;
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${rest},${last3}`;
  }
  return `${neg ? "-" : ""}${grouped}${frac !== undefined ? "." + frac : ""}`;
}

export function formatINR(v: string | Dec): string {
  return `₹${formatIndianNumber(v)}`;
}

/** Integer rupees + paise in words (Indian system) for invoices */
export function amountInWords(v: string): string {
  const d = dec(v).toDecimalPlaces(2);
  const rupees = d.trunc().toNumber();
  const paise = d.minus(d.trunc()).times(100).toDecimalPlaces(0).toNumber();
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? " " + ones[n % 10] : ""}`);
  const three = (n: number) => {
    const h = Math.floor(n / 100), r = n % 100;
    return [h ? `${ones[h]} Hundred` : "", r ? two(r) : ""].filter(Boolean).join(" ");
  };
  const words = (n: number): string => {
    if (n === 0) return "Zero";
    const parts: string[] = [];
    const crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    const thousand = Math.floor(n / 1e3); n %= 1e3;
    if (crore) parts.push(`${words(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (n) parts.push(three(n));
    return parts.join(" ");
  };
  return `Indian Rupees ${words(rupees)}${paise ? ` and ${two(paise)} Paise` : ""} Only`;
}

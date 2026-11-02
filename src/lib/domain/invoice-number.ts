import { fyShort } from "./periods";

/**
 * CGST Rule 46(b): consecutive serial number, max 16 characters, unique per financial year,
 * containing alphabets/numerals and only "-" or "/" as special characters.
 * Format: PREFIX/YY-YY/NNNN  e.g. DMT/26-27/0001 (14 chars)
 */
export const INVOICE_NUMBER_MAX = 16;
export const INVOICE_NUMBER_PATTERN = /^[A-Za-z0-9\-/]{1,16}$/;

export function validatePrefix(prefix: string): string | null {
  if (!/^[A-Z0-9]{1,5}$/.test(prefix ?? "")) return "Invoice prefix must be 1–5 capital letters or digits";
  return null;
}

export function formatInvoiceNumber(prefix: string, financialYear: string, serial: number): string {
  if (!Number.isInteger(serial) || serial < 1) throw new Error("Invoice serial must be a positive integer");
  const num = `${prefix}/${fyShort(financialYear)}/${String(serial).padStart(4, "0")}`;
  if (num.length > INVOICE_NUMBER_MAX || !INVOICE_NUMBER_PATTERN.test(num)) {
    throw new Error(`Invoice number ${num} exceeds the 16-character limit of Rule 46(b)`);
  }
  return num;
}

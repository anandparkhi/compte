import { createHash } from "node:crypto";
import { z } from "zod";

const gstin = /^[0-9]{2}[A-Z0-9]{13}$/;
const period = /^(0[1-9]|1[0-2])[0-9]{4}$/;
const text = (v: unknown) => String(v ?? "").trim();
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const money = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
export type HistoricInvoice = { recipientGstin: string; number: string; date: string; value: number; taxable: number };
export type HsnSummary = { hsn: string; description: string; unit: string; quantity: number; rate: number; taxable: number };
export type GstPreview = {
  returnType: "GSTR1"; periodKey: string; supplierGstin: string;
  invoices: HistoricInvoice[]; customers: string[]; hsn: HsnSummary[];
  warnings: string[]; fingerprint: string;
};
export function parseGstr1(raw: unknown, expectedGstin: string): GstPreview {
  const source = obj(raw);
  const supplierGstin = text(source.gstin).toUpperCase();
  if (!gstin.test(supplierGstin) || supplierGstin !== expectedGstin.toUpperCase()) throw new Error("Supplier GSTIN must match the active Compte business");
  const periodKey = text(source.fp);
  if (!period.test(periodKey)) throw new Error("GSTR-1 JSON must contain a valid fp (MMYYYY)");
  const warnings: string[] = [];
  const invoices: HistoricInvoice[] = [];
  for (const group of arr(source.b2b)) {
    const row = obj(group); const recipientGstin = text(row.ctin).toUpperCase();
    if (!gstin.test(recipientGstin)) { warnings.push("Skipped an invalid B2B recipient GSTIN"); continue; }
    for (const item of arr(row.inv)) {
      const invoice = obj(item); const number = text(invoice.inum);
      if (!number) { warnings.push("Skipped an invoice without a number"); continue; }
      const items = arr(invoice.itms);
      invoices.push({ recipientGstin, number, date: text(invoice.idt), value: money(invoice.val), taxable: items.reduce<number>((sum, i) => sum + money(obj(obj(i).itm_det).txval), 0) });
    }
  }
  const hsn: HsnSummary[] = [];
  // GSTN exports vary: older data often uses hsn.data; newer exports may use hsn.b2b / hsn.b2c.
  const h = obj(source.hsn);
  for (const item of [...arr(h.data), ...arr(h.b2b), ...arr(h.b2c)]) {
    const v = obj(item); const code = text(v.hsn_sc ?? v.hsn);
    if (!/^\d{4,8}$/.test(code)) { warnings.push("Skipped unsupported HSN/SAC entry"); continue; }
    hsn.push({ hsn: code, description: text(v.desc), unit: text(v.uqc), quantity: money(v.qty), rate: money(v.rt), taxable: money(v.txval) });
  }
  if (!invoices.length && !hsn.length) throw new Error("No supported GSTR-1 B2B invoices or HSN rows found");
  const customers = [...new Set(invoices.map(i => i.recipientGstin))].sort();
  // Content-addressed import prevents identical return data being stored twice.
  const canonical = JSON.stringify({ supplierGstin, periodKey, invoices: [...invoices].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), hsn: [...hsn].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
  return { returnType: "GSTR1", periodKey, supplierGstin, invoices, customers, hsn, warnings, fingerprint: createHash("sha256").update(canonical).digest("hex") };
}
export const ImportDecision = z.object({ confirm: z.literal("IMPORT") });

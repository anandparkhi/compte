import ExcelJS from "exceljs";
import { parseGstr1 } from "./parser";

// Supported Excel template: GSTIN, Period, Recipient GSTIN, Invoice Number,
// Invoice Date, Invoice Value, Taxable Value, HSN, Description, UQC, Quantity, Rate.
// Each worksheet row represents an invoice or an HSN summary row.
export async function excelToGstr1(input: Buffer, expectedGstin: string) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(input as never);
  const sheet = book.worksheets[0];
  if (!sheet) throw new Error("Excel file contains no worksheets");
  const rows: Record<string, string>[] = [];
  const header: string[] = [];
  sheet.eachRow((row, index) => {
    const values = Array.from({length: row.cellCount}, (_, i) => String(row.getCell(i+1).text ?? "").trim());
    if (index === 1) header.push(...values.map(v => v.toLowerCase()));
    else if (values.some(Boolean)) rows.push(Object.fromEntries(header.map((h,i) => [h, values[i] ?? ""])));
  });
  if (!rows.length) throw new Error("Excel worksheet has no data");
  const read = (r: Record<string,string>, key: string) => r[key] ?? "";
  const g = read(rows[0], "gstin").toUpperCase();
  const fp = read(rows[0], "period");
  const groups = new Map<string, { ctin: string; inv: object[] }>();
  const hsn: object[] = [];
  for (const r of rows) {
    if (read(r,"gstin").toUpperCase() !== g || read(r,"period") !== fp) throw new Error("Excel rows must belong to the same supplier and return period");
    const ctin = read(r,"recipient gstin").toUpperCase();
    if (ctin && read(r,"invoice number")) {
      if (!groups.has(ctin)) groups.set(ctin, {ctin, inv: []});
      groups.get(ctin)!.inv.push({inum:read(r,"invoice number"), idt:read(r,"invoice date"), val:read(r,"invoice value"), itms:[{itm_det:{txval:read(r,"taxable value")}}]});
    }
    if (read(r,"hsn")) hsn.push({hsn_sc:read(r,"hsn"), desc:read(r,"description"), uqc:read(r,"uqc"), qty:read(r,"quantity"), rt:read(r,"rate"), txval:read(r,"taxable value")});
  }
  return parseGstr1({gstin:g, fp, b2b:[...groups.values()], hsn:{data:hsn}}, expectedGstin);
}

import {describe,it,expect} from "vitest";
import {summarizeHistoricalImports} from "../../src/lib/gst-import/summary";
const row=(periodKey:string,invoiceValue:number,createdAt="2026-11-01")=>({periodKey,createdAt,records:JSON.stringify({invoices:[{recipientGstin:"27ABCDE1234F1Z5",number:"A1",date:"01-10-2026",value:invoiceValue,taxable:100}],hsn:[{hsn:"3923",description:"Boxes",taxable:100}]})});
describe("historical GST dashboard",()=>{
 it("aggregates imported B2B invoices and HSN rows",()=>{const a=summarizeHistoricalImports([row("102026",118)]);expect(a.invoiceCount).toBe(1);expect(a.customerCount).toBe(1);expect(a.invoiceValue).toBe(118);expect(a.topHsn[0].taxable).toBe(100);});
 it("takes latest snapshot for same period to avoid double counting",()=>{const a=summarizeHistoricalImports([row("102026",118,"2026-10-01"),row("102026",236,"2026-11-01")]);expect(a.invoiceCount).toBe(1);expect(a.invoiceValue).toBe(236);expect(a.warnings.join(" ")).toMatch(/newest/);});
 it("returns empty safe summary when no imports exist",()=>{const a=summarizeHistoricalImports([]);expect(a.invoiceValue).toBe(0);expect(a.periods).toHaveLength(0);});
});

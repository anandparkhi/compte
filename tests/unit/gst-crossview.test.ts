import {describe,it,expect} from "vitest";
import {summarizeHistoricalImports} from "../../src/lib/gst-import/summary";
const record=(createdAt:string,value:number)=>({periodKey:"102026",createdAt,records:JSON.stringify({invoices:[{recipientGstin:"27ABCDE1234F1Z5",number:"A1",date:"2026-10-02",value,taxable:value/1.18}],hsn:[{hsn:"3923",description:"Boxes",unit:"NOS",rate:18,taxable:value/1.18}]})});
describe("historical imports",()=>{
 it("retains data used by other views",()=>{const r=summarizeHistoricalImports([record("2026-11-02",118)]);expect(r.invoiceCount).toBe(1);expect(r.periods[0].period).toBe("102026");expect(r.topHsn[0].hsn).toBe("3923");});
 it("does not double-count repeat period snapshots",()=>{const r=summarizeHistoricalImports([record("2026-11-01",118),record("2026-11-02",236)]);expect(r.invoiceCount).toBe(1);expect(r.invoiceValue).toBe(236);});
});

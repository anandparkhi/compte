import {describe,it,expect} from "vitest";
import {invoiceMonthKey} from "../../src/lib/gst-import/invoice-month";
import {summarizeHistoricalImports} from "../../src/lib/gst-import/summary";
describe("quarterly GST imports and month-specific UX",()=>{
 it("uses invoice dates rather than reporting quarter end for monthly dashboard",()=>{
  expect(invoiceMonthKey("15-07-2026","092026")).toBe("072026");
  expect(invoiceMonthKey("2026-08-11","092026")).toBe("082026");
  expect(invoiceMonthKey("invalid","092026")).toBe("092026");
 });
 it("splits one quarterly return across the actual invoice months",()=>{
  const imports=[{periodKey:"092026",createdAt:"2026-11-02",records:JSON.stringify({invoices:[
   {recipientGstin:"27ABCDE1234F1Z5",number:"A1",date:"12-07-2026",value:118,taxable:100},
   {recipientGstin:"27ABCDE1234F1Z5",number:"A2",date:"13-08-2026",value:236,taxable:200}
  ],hsn:[]})}];
  const result=summarizeHistoricalImports(imports);
  expect(result.periods.map(p=>p.period)).toEqual(["072026","082026"]);
  expect(result.invoiceCount).toBe(2);
  expect(result.invoiceValue).toBe(354);
 });
 it("does not count the same GSTIN and invoice twice across imported snapshots",()=>{
  const row=(periodKey:string,createdAt:string)=>({periodKey,createdAt,records:JSON.stringify({invoices:[{recipientGstin:"27ABCDE1234F1Z5",number:"A1",date:"12-07-2026",value:118,taxable:100}]})});
  const result=summarizeHistoricalImports([row("092026","2026-11-02"),row("072026","2026-10-02")]);
  expect(result.invoiceCount).toBe(1);
 });
});

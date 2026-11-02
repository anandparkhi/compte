import {describe,it,expect} from "vitest";
import {getBusinessInsights} from "../../src/lib/gst-import/insights";
import {dashboardLanguageOptions,dashboardLocales} from "../../src/lib/gst-import/locales";
import type {HistoricalSummary} from "../../src/lib/gst-import/summary";
function data(periods:HistoricalSummary["periods"]):HistoricalSummary{
 return {periods,invoiceCount:periods.reduce((s,p)=>s+p.invoiceCount,0),customerCount:2,taxable:periods.reduce((s,p)=>s+p.taxable,0),invoiceValue:periods.reduce((s,p)=>s+p.invoiceValue,0),topCustomers:[{gstin:"27ABCDE1234F1Z5",value:90,invoices:1}],topHsn:[],importCount:periods.length,warnings:[]};
}
const p=(period:string,invoiceValue:number)=>({period,invoiceCount:1,invoiceValue,taxable:invoiceValue/1.18});
describe("layperson GST insights",()=>{
 it("compares consecutive months and computes invoice/customer averages",()=>{const i=getBusinessInsights(data([p("092026",100),p("102026",120)]));expect(i.latestChangePercent).toBeCloseTo(20);expect(i.averageInvoice).toBe(110);expect(i.topCustomerShare).toBeCloseTo(90/220*100);});
 it("avoids misleading growth comparisons across missing months",()=>{const i=getBusinessInsights(data([p("082026",100),p("102026",120)]));expect(i.latestChangePercent).toBeNull();expect(i.missingMonths).toEqual(["092026"]);});
 it("handles empty history and zero baseline without dividing by zero",()=>{expect(getBusinessInsights(data([])).latestChangePercent).toBeNull();expect(getBusinessInsights(data([p("092026",0),p("102026",100)])).latestChangePercent).toBeNull();});
 it("has localized dictionaries with matching keys and extensible language selector",()=>{const reference=Object.keys(dashboardLocales.en).sort().join(",");for(const option of dashboardLanguageOptions)expect(Object.keys(dashboardLocales[option.value]).sort().join(",")).toBe(reference);expect(dashboardLanguageOptions).toHaveLength(3);});
});

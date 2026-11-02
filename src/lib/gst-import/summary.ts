import { invoiceMonthKey } from "./invoice-month";
export type ImportSnapshot = {periodKey:string;records:string;createdAt:Date|string};
export type HistoricalSummary = {
  periods:{period:string;invoiceCount:number;taxable:number;invoiceValue:number}[];
  invoiceCount:number;customerCount:number;taxable:number;invoiceValue:number;
  topCustomers:{gstin:string;value:number;invoices:number}[];
  topHsn:{hsn:string;description:string;taxable:number}[];
  importCount:number;warnings:string[];
};
type Invoice={recipientGstin:string;number:string;date:string;value:number;taxable:number};
type Hsn={hsn:string;description:string;taxable:number};
const n=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?v:0;
export function summarizeHistoricalImports(rows:ImportSnapshot[]):HistoricalSummary {
 const invoices=new Map<string,Invoice>();
 const customers=new Map<string,{gstin:string;value:number;invoices:number}>();
 const hsn=new Map<string,{hsn:string;description:string;taxable:number}>();
 const periods=new Map<string,{period:string;invoiceCount:number;taxable:number;invoiceValue:number}>();
 const warnings:string[]=[];
 const used=new Set<string>();
 // One snapshot per period: a later corrected export replaces an earlier snapshot.
 for(const row of [...rows].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())){
   if(used.has(row.periodKey)){if(!warnings.includes("Multiple imports exist for a period; only the newest is shown."))warnings.push("Multiple imports exist for a period; only the newest is shown.");continue;}
   used.add(row.periodKey);
   let parsed:{invoices?:Invoice[];hsn?:Hsn[]};
   try {parsed=JSON.parse(row.records);}catch{warnings.push("An unreadable historical import was skipped.");continue;}
   for(const inv of parsed.invoices??[]){
     if(!inv.recipientGstin||!inv.number)continue;
     const month=invoiceMonthKey(inv.date,row.periodKey);
     const key=[month,inv.recipientGstin,inv.number].join("|");
     if(invoices.has(key))continue;
     invoices.set(key,inv);
     const p=periods.get(month)??{period:month,invoiceCount:0,taxable:0,invoiceValue:0};
     p.invoiceCount++;p.taxable+=n(inv.taxable);p.invoiceValue+=n(inv.value);
     periods.set(month,p);
     const c=customers.get(inv.recipientGstin)??{gstin:inv.recipientGstin,value:0,invoices:0};
     c.value+=n(inv.value);c.invoices++;customers.set(inv.recipientGstin,c);
   }
   for(const item of parsed.hsn??[]){
     if(!item.hsn)continue;
     const key=item.hsn;
     const entry=hsn.get(key)??{hsn:key,description:item.description??"",taxable:0};
     entry.taxable+=n(item.taxable);hsn.set(key,entry);
   }
   if(!(parsed.invoices??[]).length && (parsed.hsn??[]).length && !periods.has(row.periodKey)) periods.set(row.periodKey,{period:row.periodKey,invoiceCount:0,taxable:0,invoiceValue:0});
 }
 const values=[...periods.values()].sort((a,b)=>a.period.slice(2).localeCompare(b.period.slice(2))||a.period.slice(0,2).localeCompare(b.period.slice(0,2)));
 warnings.unshift("Based only on imported GSTR-1 B2B invoice rows; excludes B2C, amendments, credit notes and unimported periods.");
 return {periods:values,invoiceCount:values.reduce((s,p)=>s+p.invoiceCount,0),customerCount:customers.size,
  taxable:values.reduce((s,p)=>s+p.taxable,0),invoiceValue:values.reduce((s,p)=>s+p.invoiceValue,0),
  topCustomers:[...customers.values()].sort((a,b)=>b.value-a.value).slice(0,5),
  topHsn:[...hsn.values()].sort((a,b)=>b.taxable-a.taxable).slice(0,5),
  importCount:rows.length,warnings};
}

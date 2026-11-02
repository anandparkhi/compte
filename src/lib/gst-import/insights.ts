import type {HistoricalSummary} from "./summary";
export type BusinessInsights = {
 averageInvoice:number;averageMonthlySales:number;
 strongestMonth:string|null;weakestMonth:string|null;
 latestChangePercent:number|null;topCustomerShare:number|null;
 missingMonths:string[];coveredMonths:number;
};
const stamp=(p:string)=>Number(p.slice(2))*12+Number(p.slice(0,2))-1;
const key=(i:number)=>String(i%12+1).padStart(2,"0")+String(Math.floor(i/12));
export function getBusinessInsights(s:HistoricalSummary):BusinessInsights {
 const periods=[...s.periods].sort((a,b)=>stamp(a.period)-stamp(b.period));
 const positive=periods.filter(p=>p.invoiceCount>0);
 const max=positive.reduce<(typeof positive)[number]|null>((best,p)=>!best||p.invoiceValue>best.invoiceValue?p:best,null);
 const min=positive.reduce<(typeof positive)[number]|null>((best,p)=>!best||p.invoiceValue<best.invoiceValue?p:best,null);
 const last=periods.at(-1),previous=periods.at(-2);
 const adjacent=last&&previous&&stamp(last.period)-stamp(previous.period)===1;
 const latestChangePercent=adjacent&&previous.invoiceValue>0?((last!.invoiceValue-previous.invoiceValue)/previous.invoiceValue)*100:null;
 const missingMonths:string[]=[];
 if(periods.length>1)for(let m=stamp(periods[0].period)+1;m<stamp(periods.at(-1)!.period);m++){
  if(!periods.some(p=>stamp(p.period)===m))missingMonths.push(key(m));
 }
 return {
  averageInvoice:s.invoiceCount?s.invoiceValue/s.invoiceCount:0,
  averageMonthlySales:periods.length?s.invoiceValue/periods.length:0,
  strongestMonth:max?.period??null,weakestMonth:min?.period??null,
  latestChangePercent,topCustomerShare:s.invoiceValue>0&&s.topCustomers.length?s.topCustomers[0].value/s.invoiceValue*100:null,
  missingMonths,coveredMonths:periods.length
 };
}

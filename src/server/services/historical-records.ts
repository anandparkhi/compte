import "server-only";
import { prisma } from "@/server/db";
import { parsePeriodKey, type ReturnPeriod } from "@/lib/domain/periods";
export type HistoricalInvoice={id:string;periodKey:string;recipientGstin:string;number:string;date:string;value:number;taxable:number};
export async function readHistorical(businessId:string){
 const batches=await prisma.gstHistoricalImport.findMany({where:{businessId},orderBy:{createdAt:"desc"}});
 const periods=new Set<string>(),invoices:HistoricalInvoice[]=[];
 const hsn:{hsn:string;description:string;unit:string;rate:number;taxable:number}[]=[];
 for(const batch of batches){if(periods.has(batch.periodKey))continue;
  let data:{invoices?:Omit<HistoricalInvoice,"id"|"periodKey">[];hsn?:typeof hsn};
  try{data=JSON.parse(batch.records)}catch{continue}
  periods.add(batch.periodKey);
  for(const [i,row] of (data.invoices??[]).entries())if(row.number)invoices.push({...row,id:batch.id+":"+i,periodKey:batch.periodKey});
  hsn.push(...data.hsn??[]);
 }
 return {invoices,hsn,periods:[...periods]};
}
export function inReturnPeriod(invoices:HistoricalInvoice[],p:ReturnPeriod){return invoices.filter(i=>{
 try{const month=parsePeriodKey(i.periodKey,"MONTHLY");return month.start>=p.start&&month.start<p.endExclusive;}catch{return false;}
});}
export function historicalTotals(rows:HistoricalInvoice[]){return {count:rows.length,taxable:rows.reduce((s,i)=>s+Number(i.taxable||0),0),value:rows.reduce((s,i)=>s+Number(i.value||0),0)};}

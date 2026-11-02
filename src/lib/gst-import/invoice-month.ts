import { parsePeriodKey } from "@/lib/domain/periods";

/** Group historical invoice sales by the actual invoice date, not the last month of a quarterly return. */
export function invoiceMonthKey(date:string, fallback:string):string {
 let iso=date;
 if(/^\d{2}-\d{2}-\d{4}$/.test(date))iso=date.slice(6)+"-"+date.slice(3,5)+"-"+date.slice(0,2);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return fallback;
 const parsed=new Date(iso+"T00:00:00.000Z");
 if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==iso)return fallback;
 const key=iso.slice(5,7)+iso.slice(0,4);
 try{parsePeriodKey(key,"MONTHLY");return key;}catch{return fallback;}
}

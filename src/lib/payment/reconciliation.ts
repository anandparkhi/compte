import Decimal from "decimal.js";
export type PaymentLike={amount:string};
export function balanceFor(total:string,payments:PaymentLike[]){
 const paid=payments.reduce((s,p)=>s.plus(new Decimal(p.amount)),new Decimal(0));
 const due=Decimal.max(new Decimal(total).minus(paid),new Decimal(0));
 return {paid:paid.toFixed(2),due:due.toFixed(2),status:due.eq(0)?"PAID":paid.gt(0)?"PARTIAL":"UNPAID"} as const;
}
export type BankEntry={date:string;amount:string;reference:string;narration:string};
export function normalizePhone(input:string){const digits=input.replace(/\D/g,"");return digits.length===10?"91"+digits:digits.length>=11&&digits.length<=15?digits:null;}
export type MessageLang="en"|"hi"|"mr";
export function whatsappText(lang:MessageLang,kind:"invoice"|"reminder",name:string,number:string,amount:string){
 const money="₹"+new Decimal(amount).toFixed(2);
 const messages={
 en:{invoice:`Hello ${name}, your invoice ${number} is for ${money}. Please review the invoice shared separately. Thank you.`,reminder:`Hello ${name}, this is a friendly reminder that ${money} remains due for invoice ${number}. Please let us know if you have already paid. Thank you.`},
 hi:{invoice:`नमस्ते ${name}, आपका बिल ${number} ${money} का है। कृपया अलग से साझा किए गए बिल को देखें। धन्यवाद।`,reminder:`नमस्ते ${name}, बिल ${number} पर ${money} अभी बाकी दिख रहा है। भुगतान हो चुका हो तो कृपया बताएं। धन्यवाद।`},
 mr:{invoice:`नमस्कार ${name}, तुमचे बिल ${number} ${money} चे आहे. वेगळे पाठवलेले बिल तपासा. धन्यवाद.`,reminder:`नमस्कार ${name}, बिल ${number} साठी ${money} बाकी दिसत आहेत. पैसे भरले असल्यास कृपया कळवा. धन्यवाद.`}
 };
 return messages[lang][kind];
}
export function parseBankCsv(csv:string):BankEntry[]{
 const lines=csv.replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim());
 const split=(line:string)=>{const a:string[]=[];let current="",quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){current+='"';i++;}else quoted=!quoted;}else if(c===","&&!quoted){a.push(current.trim());current="";}else current+=c;}a.push(current.trim());return a;};
 if(!lines.length)throw new Error("Empty bank statement");
 const header=split(lines[0]).map(x=>x.toLowerCase());
 const field=(r:string[],name:string)=>r[header.indexOf(name)]??"";
 for(const h of ["date","amount","reference","narration"])if(!header.includes(h))throw new Error("Missing column: "+h);
 return lines.slice(1).map(l=>{const r=split(l);return {date:field(r,"date"),amount:field(r,"amount"),reference:field(r,"reference"),narration:field(r,"narration")};}).filter(r=>r.date&&r.amount);
}
export function validateBankEntry(entry:BankEntry){
 const date=/^\d{4}-\d{2}-\d{2}$/.test(entry.date)?new Date(entry.date+"T12:00:00.000Z"):new Date(NaN);
 if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==entry.date)throw new Error("Invalid date; expected YYYY-MM-DD");
 const value=new Decimal(entry.amount);
 if(!value.isFinite()||value.lte(0)||value.decimalPlaces()>2)throw new Error("Only positive bank credits with up to 2 decimals are supported");
 if(entry.reference.length>150||entry.narration.length>500)throw new Error("Bank description too long");
 return {date,amount:value.toFixed(2),reference:entry.reference.trim(),narration:entry.narration.trim()};
}

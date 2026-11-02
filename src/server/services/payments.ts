import "server-only";
import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import ExcelJS from "exceljs";
import {prisma} from "@/server/db";
import type {Ctx} from "@/server/auth/ctx";
import {assertCanWrite} from "@/server/auth/ctx";
import {AppError} from "@/server/errors";
import {balanceFor,parseBankCsv,validateBankEntry,type BankEntry} from "@/lib/payment/reconciliation";
export async function getPayments(ctx:Ctx,invoiceId:string){
 const invoice=await prisma.invoice.findFirst({where:{id:invoiceId,businessId:ctx.businessId,status:"ISSUED"},select:{id:true,grandTotal:true,invoiceNumber:true,customerId:true,customer:{select:{name:true,phone:true}}}});
 if(!invoice)throw new AppError(404,"NOT_FOUND","Issued invoice not found");
 const payments=await prisma.invoicePayment.findMany({where:{businessId:ctx.businessId,invoiceId},orderBy:{createdAt:"desc"}});
 return {invoice,payments,balance:balanceFor(invoice.grandTotal,payments)};
}
export async function recordPayment(ctx:Ctx,invoiceId:string,raw:{amount:string;reference?:string;receivedAt:string;bankTransactionId?:string}){
 assertCanWrite(ctx);
 const receivedAt=new Date(raw.receivedAt+"T12:00:00.000Z");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw.receivedAt)||Number.isNaN(receivedAt.getTime())||receivedAt.toISOString().slice(0,10)!==raw.receivedAt)throw new AppError(422,"DATE","Use YYYY-MM-DD");
 if(raw.reference&&raw.reference.length>150)throw new AppError(422,"REFERENCE","Reference too long");
 let value:Decimal;try{value=new Decimal(raw.amount);}catch{throw new AppError(422,"AMOUNT","Invalid amount");}
 if(!value.isFinite()||value.lte(0)||value.decimalPlaces()>2)throw new AppError(422,"AMOUNT","Amount must be positive with two decimals");
 return prisma.$transaction(async tx=>{
  const invoice=await tx.invoice.findFirst({where:{id:invoiceId,businessId:ctx.businessId,status:"ISSUED"}});
  if(!invoice)throw new AppError(404,"NOT_FOUND","Issued invoice not found");
  // Lock the invoice row to serialize concurrent payment confirmations.
  await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE`;
  const paid=await tx.invoicePayment.findMany({where:{invoiceId,businessId:ctx.businessId},select:{amount:true}});
  if(value.gt(new Decimal(balanceFor(invoice.grandTotal,paid).due)))throw new AppError(409,"OVERPAYMENT","Amount exceeds the invoice balance");
  if(raw.bankTransactionId){
   const bank=await tx.bankImportTransaction.findFirst({where:{id:raw.bankTransactionId,businessId:ctx.businessId}});
   if(!bank||!new Decimal(bank.amount).eq(value))throw new AppError(422,"BANK_MATCH","Bank transaction does not match this amount");
   if(await tx.invoicePayment.findFirst({where:{bankTransactionId:bank.id}}))throw new AppError(409,"MATCHED","Bank transaction already matched");
  }
  const payment=await tx.invoicePayment.create({data:{businessId:ctx.businessId,invoiceId,amount:value.toFixed(2),receivedAt,reference:raw.reference?.trim()||null,source:raw.bankTransactionId?"BANK_CONFIRMED":"MANUAL",bankTransactionId:raw.bankTransactionId||null}});
  await tx.auditLog.create({data:{businessId:ctx.businessId,userId:ctx.userId,action:"INVOICE_PAYMENT_RECORDED",entityType:"InvoicePayment",entityId:payment.id,metadata:JSON.stringify({invoiceId,amount:payment.amount,source:payment.source})}});
  return payment;
 });
}
async function readEntries(file:File):Promise<BankEntry[]>{
 if(file.size>2*1024*1024)throw new AppError(413,"FILE_TOO_LARGE","Bank statement exceeds 2 MB");
 const bytes=Buffer.from(await file.arrayBuffer());
 if(file.name.toLowerCase().endsWith(".csv"))return parseBankCsv(bytes.toString("utf8"));
 if(file.name.toLowerCase().endsWith(".xlsx")){
  const book=new ExcelJS.Workbook();await book.xlsx.load(bytes as never);const sh=book.worksheets[0];if(!sh)throw Error("Empty workbook");
  const header=["date","amount","reference","narration"];
  if(header.some((h,i)=>sh.getRow(1).getCell(i+1).text.trim().toLowerCase()!==h))throw Error("Expected columns: Date, Amount, Reference, Narration");
  const rows:BankEntry[]=[];sh.eachRow((row,n)=>{if(n>1&&row.getCell(1).text.trim())rows.push({date:row.getCell(1).text.trim(),amount:row.getCell(2).text.trim(),reference:row.getCell(3).text.trim(),narration:row.getCell(4).text.trim()});});
  return rows;
 }
 throw new Error("Upload .csv or .xlsx");
}
export async function importBank(ctx:Ctx,file:File,commit:boolean){
 assertCanWrite(ctx);
 let entries:ReturnType<typeof validateBankEntry>[];
 try{entries=(await readEntries(file)).map(validateBankEntry);}catch(e){throw new AppError(422,"BANK_FILE",e instanceof Error?e.message:"Invalid statement");}
 if(entries.length>500)throw new AppError(422,"TOO_MANY","Maximum 500 transactions per file");
 const selected=entries.map(e=>({...e,fingerprint:createHash("sha256").update([e.date.toISOString(),e.amount,e.reference,e.narration].join("|")).digest("hex")}));
 if(!commit)return {preview:true,rows:selected.map(e=>({date:e.date.toISOString().slice(0,10),amount:e.amount,reference:e.reference,narration:e.narration})),count:selected.length};
 let imported=0;
 for(const e of selected){const result=await prisma.bankImportTransaction.createMany({data:[{businessId:ctx.businessId,...e}],skipDuplicates:true});imported+=result.count;}
 await prisma.auditLog.create({data:{businessId:ctx.businessId,userId:ctx.userId,action:"BANK_STATEMENT_IMPORTED",entityType:"BankImportTransaction",metadata:JSON.stringify({count:imported,source:file.name.slice(0,100)})}});
 return {preview:false,imported,duplicates:selected.length-imported};
}
export async function suggestions(ctx:Ctx){
 const [banks,invoices]=await Promise.all([
  prisma.bankImportTransaction.findMany({where:{businessId:ctx.businessId,payment:null},orderBy:{date:"desc"},take:100}),
  prisma.invoice.findMany({where:{businessId:ctx.businessId,status:"ISSUED"},select:{id:true,invoiceNumber:true,grandTotal:true,customer:{select:{name:true}},payments:{select:{amount:true}}},take:200})
 ]);
 return banks.map(bank=>({bank:{id:bank.id,date:bank.date,amount:bank.amount,narration:bank.narration,reference:bank.reference},
 candidates:invoices.filter(i=>new Decimal(balanceFor(i.grandTotal,i.payments).due).eq(new Decimal(bank.amount))).slice(0,5).map(i=>({id:i.id,number:i.invoiceNumber,customer:i.customer?.name??"",amount:bank.amount}))}));
}

import {handle,AppError} from "@/server/errors";
import {requireApiContext} from "@/server/auth/session";
import {importBank,suggestions,recordPayment} from "@/server/services/payments";
export const runtime="nodejs";
export async function GET(){return handle(async()=>suggestions(await requireApiContext()));}
export async function POST(req:Request){return handle(async()=>{
 const ctx=await requireApiContext();const f=await req.formData();const file=f.get("file");
 if(!(file instanceof File))throw new AppError(400,"FILE_REQUIRED","Choose a statement");
 return importBank(ctx,file,f.get("confirm")==="IMPORT");
});}
export async function PUT(req:Request){return handle(async()=>{
 const ctx=await requireApiContext();const body=await req.json();
 if(body.confirm!=="MATCH")throw new AppError(400,"CONFIRM","Confirm a payment match");
 return recordPayment(ctx,body.invoiceId,{bankTransactionId:body.bankTransactionId,amount:body.amount,receivedAt:body.receivedAt,reference:body.reference});
});}

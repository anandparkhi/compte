import {beforeEach,afterEach,describe,it,expect} from "vitest";
import {prisma} from "@/server/db";
import {createDraftFromText,getInvoiceForDocument,removeInvoice,readVerifiedSnapshot} from "@/server/services/invoices";
import {renderInvoicePdf} from "@/server/services/pdf";
import {dashboard} from "@/server/services/dashboard";
import {gstr1Preparation} from "@/server/services/returns";
import {issueFor,makeBusiness,setTodayForTests} from "../helpers";

beforeEach(()=>setTodayForTests(()=>"2026-11-02"));
afterEach(()=>setTodayForTests(null));

describe("invoice deletion and cancellation",()=>{
 it("deletes an unissued draft and retains the audit event",async()=>{
  const t=await makeBusiness();
  const draft=await createDraftFromText(t.ctx,{text:"BILL RAMESH 2 BOX 500 GST18",source:"TEXT"});
  expect(await removeInvoice(t.ctx,draft.id)).toEqual({action:"DELETED"});
  expect(await prisma.invoice.findUnique({where:{id:draft.id}})).toBeNull();
  expect(await prisma.auditLog.count({where:{businessId:t.ctx.businessId,entityId:draft.id,action:"INVOICE_DRAFT_DELETED"}})).toBe(1);
 });
 it("cancels an issued invoice without deleting immutable record or reusing its number",async()=>{
  const t=await makeBusiness();
  const invoice=await issueFor(t,"2026-10-15",t.ramesh,[{productId:t.box.id,quantity:"1",unitPrice:"100"}]);
  const original=await getInvoiceForDocument(t.ctx,invoice.id);
  expect(await removeInvoice(t.ctx,invoice.id)).toEqual({action:"CANCELLED"});
  const updated=await prisma.invoice.findUniqueOrThrow({where:{id:invoice.id}});
  expect(updated.status).toBe("CANCELLED");
  expect(updated.invoiceNumber).toBe(invoice.invoiceNumber);
  expect(updated.snapshotHash).toBe(invoice.snapshotHash);
  expect(readVerifiedSnapshot(updated)).toEqual(original.snapshot);
  await expect(prisma.invoice.delete({where:{id:invoice.id}})).rejects.toThrow();
  await expect(prisma.invoice.update({where:{id:invoice.id},data:{grandTotal:"1.00"}})).rejects.toThrow();
  await expect(getInvoiceForDocument(t.ctx,invoice.id)).rejects.toMatchObject({code:"INVOICE_CANCELLED"});
  const archive=await getInvoiceForDocument(t.ctx,invoice.id,true);
  const pdf=await renderInvoicePdf(archive.snapshot,true);
  expect(pdf.subarray(0,5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(5000);
  const d=await dashboard(t.ctx,"102026");
  expect(d.totals.issuedCount).toBe(0);
  const gst=await gstr1Preparation(t.ctx,"102026");
  expect(gst.documents.count).toBe(0);
  expect(await prisma.auditLog.count({where:{businessId:t.ctx.businessId,entityId:invoice.id,action:"INVOICE_CANCELLED"}})).toBe(1);
  await expect(removeInvoice(t.ctx,invoice.id)).rejects.toMatchObject({code:"ALREADY_CANCELLED"});
  const next=await issueFor(t,"2026-10-16",t.ramesh,[{productId:t.box.id,quantity:"1",unitPrice:"100"}]);
  expect(next.invoiceNumber).not.toBe(invoice.invoiceNumber);
 });
 it("refuses cancellation after a payment is recorded",async()=>{
  const t=await makeBusiness();
  const invoice=await issueFor(t,"2026-10-15",t.ramesh,[{productId:t.box.id,quantity:"1",unitPrice:"100"}]);
  await prisma.invoicePayment.create({data:{businessId:t.ctx.businessId,invoiceId:invoice.id,amount:"10.00",receivedAt:new Date("2026-10-16"),source:"MANUAL"}});
  await expect(removeInvoice(t.ctx,invoice.id)).rejects.toMatchObject({code:"PAYMENT_EXISTS"});
  expect((await prisma.invoice.findUniqueOrThrow({where:{id:invoice.id}})).status).toBe("ISSUED");
 });
 it("refuses cancellation after a sent email or from another business",async()=>{
  const t=await makeBusiness();
  const other=await makeBusiness();
  const invoice=await issueFor(t,"2026-10-15",t.ramesh,[{productId:t.box.id,quantity:"1",unitPrice:"100"}]);
  await expect(removeInvoice(other.ctx,invoice.id)).rejects.toMatchObject({status:404});
  await prisma.emailDelivery.create({data:{businessId:t.ctx.businessId,invoiceId:invoice.id,toAddress:"buyer@example.com",provider:"RESEND",status:"SENT"}});
  await expect(removeInvoice(t.ctx,invoice.id)).rejects.toMatchObject({code:"ALREADY_SENT"});
  await expect(removeInvoice({...t.ctx,role:"VIEWER"},invoice.id)).rejects.toMatchObject({status:403});
 });
});

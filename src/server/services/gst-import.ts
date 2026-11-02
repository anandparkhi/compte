import "server-only";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { assertCanWrite, type Ctx } from "@/server/auth/ctx";
import { parseGstr1, type GstPreview } from "@/lib/gst-import/parser";
import { excelToGstr1 } from "@/lib/gst-import/excel";

export async function previewImport(ctx: Ctx, file: File): Promise<GstPreview> {
  assertCanWrite(ctx);
  if (file.size > 5 * 1024 * 1024) throw new AppError(413,"FILE_TOO_LARGE","Maximum file size is 5 MB");
  const business = await prisma.business.findUniqueOrThrow({where:{id:ctx.businessId}});
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    if (/\.json$/i.test(file.name)) return parseGstr1(JSON.parse(bytes.toString("utf8")),business.gstin);
    if (/\.xlsx$/i.test(file.name)) return await excelToGstr1(bytes,business.gstin);
    throw new Error("Upload a .json or .xlsx file");
  } catch (e) { throw new AppError(422,"INVALID_IMPORT",e instanceof Error ? e.message : "Invalid import file"); }
}
export async function saveImport(ctx: Ctx, file: File, createCustomers: boolean) {
  const parsed = await previewImport(ctx,file);
  return prisma.$transaction(async tx => {
    const duplicate = await tx.gstHistoricalImport.findUnique({where:{businessId_sourceHash:{businessId:ctx.businessId,sourceHash:parsed.fingerprint}}});
    if (duplicate) return {duplicate:true,id:duplicate.id,customersCreated:0};
    const record = await tx.gstHistoricalImport.create({data:{
      businessId:ctx.businessId,sourceHash:parsed.fingerprint,returnType:parsed.returnType,
      periodKey:parsed.periodKey,sourceName:file.name.slice(0,200),
      summary:JSON.stringify({invoices:parsed.invoices.length,customers:parsed.customers.length,hsn:parsed.hsn.length,warnings:parsed.warnings}),
      records:JSON.stringify({invoices:parsed.invoices,hsn:parsed.hsn}),
    }});
    let customersCreated = 0;
    if (createCustomers) for (const gstin of parsed.customers) {
      const existing = await tx.customer.findFirst({where:{businessId:ctx.businessId,gstin}});
      if (!existing) {
        await tx.customer.create({data:{businessId:ctx.businessId,gstin,registrationStatus:"REGISTERED",name:"Imported GSTIN "+gstin,stateCode:gstin.slice(0,2),billingAddress:"Address not provided — verify before use"}});
        customersCreated++;
      }
    }
    await tx.auditLog.create({data:{businessId:ctx.businessId,userId:ctx.userId,action:"GST_RETURN_IMPORTED",entityType:"GstHistoricalImport",entityId:record.id,metadata:JSON.stringify({sourceHash:parsed.fingerprint,customersCreated})}});
    return {duplicate:false,id:record.id,customersCreated};
  });
}
export async function listImports(ctx: Ctx) {
  return prisma.gstHistoricalImport.findMany({where:{businessId:ctx.businessId},select:{id:true,returnType:true,periodKey:true,sourceName:true,summary:true,createdAt:true},orderBy:{createdAt:"desc"},take:30});
}

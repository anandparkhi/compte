import "server-only";
import {prisma} from "@/server/db";
import type {Ctx} from "@/server/auth/ctx";
import {summarizeHistoricalImports} from "@/lib/gst-import/summary";
export async function getHistoricalGstDashboard(ctx:Ctx){
 const rows=await prisma.gstHistoricalImport.findMany({
  where:{businessId:ctx.businessId},select:{periodKey:true,records:true,createdAt:true},
  orderBy:{createdAt:"desc"},take:200
 });
 return summarizeHistoricalImports(rows);
}

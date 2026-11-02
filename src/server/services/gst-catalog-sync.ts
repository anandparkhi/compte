import "server-only";
import {prisma} from "@/server/db";
import {assertCanWrite,type Ctx} from "@/server/auth/ctx";
import {readHistorical} from "@/server/services/historical-records";

/** Explicit, idempotent backfill for imports created before catalog suggestions existed. */
export async function syncHistoricalProducts(ctx:Ctx){
 assertCanWrite(ctx);
 const {hsn}=await readHistorical(ctx.businessId);
 let created=0;
 await prisma.$transaction(async tx=>{
  for(const h of hsn){
   const name=String(h.description??"").trim();
   if(!name||!/^\d{4,8}$/.test(h.hsn))continue;
   const exists=await tx.product.findFirst({where:{businessId:ctx.businessId,hsnSac:h.hsn,name}});
   if(exists)continue;
   await tx.product.create({data:{
    businessId:ctx.businessId,name,description:"Imported from historical HSN/SAC summary. Verify before use.",
    kind:"GOODS",hsnSac:h.hsn,unit:h.unit||"NOS",defaultPrice:"0.00",
    gstRate:String(h.rate),taxSource:"HISTORICAL_IMPORT_UNVERIFIED",taxConfirmedAt:null
   }});
   created++;
  }
  await tx.auditLog.create({data:{businessId:ctx.businessId,userId:ctx.userId,action:"HISTORICAL_HSN_CATALOG_SYNC",entityType:"Product",metadata:JSON.stringify({created})}});
 });
 return {created};
}

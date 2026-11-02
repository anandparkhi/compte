import {handle} from "@/server/errors";
import {requireApiContext} from "@/server/auth/session";
import {getPayments,recordPayment} from "@/server/services/payments";
type P={params:Promise<{id:string}>};
export async function GET(_:Request,{params}:P){return handle(async()=>getPayments(await requireApiContext(),(await params).id));}
export async function POST(req:Request,{params}:P){return handle(async()=>recordPayment(await requireApiContext(),(await params).id,await req.json()),201);}

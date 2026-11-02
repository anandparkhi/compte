import {handle} from "@/server/errors";
import {requireApiContext} from "@/server/auth/session";
import {syncHistoricalProducts} from "@/server/services/gst-catalog-sync";
export async function POST(){return handle(async()=>syncHistoricalProducts(await requireApiContext()));}

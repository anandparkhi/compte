import {requirePageContext} from "@/server/auth/session";
import {getHistoricalGstDashboard} from "@/server/services/gst-dashboard";
import {HistoricalGstDashboard} from "@/components/gst/historical-dashboard";
export const dynamic="force-dynamic";
export default async function GstHistoryPage(){
 const ctx=await requirePageContext();
 const data=await getHistoricalGstDashboard(ctx);
 return <div className="mx-auto max-w-5xl space-y-4"><HistoricalGstDashboard data={data}/></div>;
}

"use client";
import {useState} from "react";
export function SyncHistoricalProducts(){
 const [status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 async function sync(){
  if(!window.confirm("Add missing product suggestions from your earlier GST imports? Review them before invoicing."))return;
  setBusy(true);setStatus("");
  try{const r=await fetch("/api/gst-import/sync-products",{method:"POST"});const d=await r.json();if(!r.ok)throw new Error(d.error?.message??"Sync failed");setStatus(d.created+" product suggestions added. Check Products & services.");}
  catch(e){setStatus(e instanceof Error?e.message:"Sync failed");}
  finally{setBusy(false);}
 }
 return <section className="rounded-xl border p-4"><h2 className="font-semibold">Products from earlier GST imports</h2><p className="my-2 text-sm text-muted">Create missing HSN-based product suggestions from previously imported returns. They will require review before use.</p><button disabled={busy} onClick={sync} className="rounded-lg border px-4 py-2 disabled:opacity-50">Sync historical products</button>{status&&<p role="status" className="mt-2 text-sm">{status}</p>}</section>;
}

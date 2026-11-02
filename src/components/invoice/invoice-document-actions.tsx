"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Eye, Trash2 } from "lucide-react";

export function InvoiceDocumentActions({invoiceId,invoiceNumber,status,canWrite}:{
  invoiceId:string;invoiceNumber:string;status:string;canWrite:boolean;
}){
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const href=`/api/invoices/${encodeURIComponent(invoiceId)}/pdf`;
 async function cancel(){
  if(!window.confirm(`Are you sure you want to cancel invoice ${invoiceNumber}?\n\nIt will be removed from active sales, but its original number, PDF and audit history will be kept. Only proceed if it has NOT been shared with the customer or included in a filed return.\n\nThis cannot be undone.`))return;
  setBusy(true);setError("");
  try{
   const response=await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`,{method:"DELETE",cache:"no-store"});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error?.message??"Could not cancel invoice");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Could not cancel invoice");}
  finally{setBusy(false);}
 }
 return <div className="space-y-2">
  <div className="flex flex-wrap items-center gap-2">
   <a href={href} download={`${invoiceNumber.replaceAll("/","-")}.pdf`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#193e32] px-4 py-2 text-sm font-semibold text-white">
    <Download className="size-4"/>Download PDF
   </a>
   <a href={href+"?inline=1"} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
    <Eye className="size-4"/>View PDF
   </a>
   {canWrite&&status==="ISSUED"&&<button type="button" disabled={busy} onClick={()=>void cancel()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">
    <Trash2 className="size-4"/>{busy?"Cancelling…":"Delete / cancel invoice"}
   </button>}
  </div>
  {status==="CANCELLED"&&<p className="text-sm font-semibold text-red-700">Cancelled — excluded from active sales. The original PDF is retained and marked CANCELLED.</p>}
  {status==="ISSUED"&&<p className="text-xs text-muted">Issued invoices cannot be permanently erased. Cancelling preserves their invoice number and history. Already paid or emailed invoices require a formal correction.</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </div>;
}

"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Eye, Trash2 } from "lucide-react";

export function InvoiceDocumentActions({invoiceId,invoiceNumber,status,canWrite}:{
  invoiceId:string;invoiceNumber:string;status:string;canWrite:boolean;
}){
 const router=useRouter();
 const [busy,setBusy]=useState<"download"|"preview"|"cancel"|null>(null);
 const [error,setError]=useState("");
 const endpoint=`/api/invoices/${encodeURIComponent(invoiceId)}/pdf`;

 async function getPdf():Promise<Blob> {
  const response=await fetch(endpoint,{credentials:"same-origin",cache:"no-store"});
  if(!response.ok){
   const data=await response.json().catch(()=>null);
   throw new Error(data?.error?.message ?? "Could not generate the PDF. Open Vercel runtime logs or contact support.");
  }
  const type=response.headers.get("content-type")??"";
  const bytes=await response.arrayBuffer();
  const signature=new TextDecoder().decode(bytes.slice(0,5));
  if(!type.includes("application/pdf")||signature!=="%PDF-"){
   throw new Error("The server returned something other than a PDF. The download was cancelled.");
  }
  return new Blob([bytes],{type:"application/pdf"});
 }
 async function download(){
  setError("");setBusy("download");
  try{
   const pdf=await getPdf();
   const url=URL.createObjectURL(pdf);
   const a=document.createElement("a");
   a.href=url;a.download=`${invoiceNumber.replaceAll("/","-")}.pdf`;
   document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){setError(e instanceof Error?e.message:"Unable to download the invoice PDF");}
  finally{setBusy(null);}
 }
 async function preview(){
  setError("");
  // Open the tab on the click before awaiting the PDF fetch to avoid popup blockers.
  const tab=window.open("","_blank");
  setBusy("preview");
  try{
   const pdf=await getPdf();
   const url=URL.createObjectURL(pdf);
   if(tab){tab.location.href=url;window.setTimeout(()=>URL.revokeObjectURL(url),300000);}
   else {URL.revokeObjectURL(url);throw new Error("Your browser blocked the preview window. Use Download PDF instead.");}
  }catch(e){tab?.close();setError(e instanceof Error?e.message:"Unable to preview the invoice PDF");}
  finally{setBusy(null);}
 }
 async function cancel(){
  if(!window.confirm(`Are you sure you want to cancel invoice ${invoiceNumber}?\n\nIt will no longer count in active sales, but its original number and history will remain. If this invoice was sent to a customer or reported to GSTN, contact your accountant about a formal correction.\n\nThis cannot be undone.`))return;
  setBusy("cancel");setError("");
  try{
   const response=await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`,{method:"DELETE",cache:"no-store"});
   const data=await response.json().catch(()=>null);
   if(!response.ok)throw new Error(data?.error?.message??"Could not cancel the invoice. Please check your database migration.");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Could not cancel the invoice");}
  finally{setBusy(null);}
 }
 return <div className="space-y-2">
  <div className="flex flex-wrap items-center gap-2">
   <button type="button" onClick={()=>void download()} disabled={busy!==null} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#193e32] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
    <Download className="size-4"/>{busy==="download"?"Preparing PDF…":"Download PDF"}
   </button>
   <button type="button" onClick={()=>void preview()} disabled={busy!==null} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
    <Eye className="size-4"/>{busy==="preview"?"Opening…":"View PDF"}
   </button>
   {canWrite&&status==="ISSUED"&&<button type="button" disabled={busy!==null} onClick={()=>void cancel()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">
    <Trash2 className="size-4"/>{busy==="cancel"?"Cancelling…":"Delete / cancel invoice"}
   </button>}
  </div>
  {status==="CANCELLED"&&<p className="text-sm font-semibold text-red-700">Cancelled — excluded from active sales. The original PDF is retained and marked CANCELLED.</p>}
  {status==="ISSUED"&&<p className="text-xs text-muted">Issued invoices are not permanently erased. Cancellation retains their invoice number and history.</p>}
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
 </div>;
}

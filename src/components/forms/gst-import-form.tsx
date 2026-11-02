"use client";
import { useState } from "react";
type Preview = {returnType:string;periodKey:string;invoices:unknown[];customers:string[];hsn:unknown[];warnings:string[];fingerprint:string};
export function GstImportForm() {
 const [file,setFile]=useState<File|null>(null);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [result,setResult]=useState<string>("");
 const [busy,setBusy]=useState(false);
 const [customers,setCustomers]=useState(false);
 async function send(mode:"preview"|"commit") {
  if(!file)return;
  setBusy(true);setResult("");
  const body=new FormData();body.set("file",file);body.set("mode",mode);
  if(mode==="commit"){body.set("confirm","IMPORT");body.set("customers",String(customers));}
  try {
   const res=await fetch("/api/gst-import",{method:"POST",body});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error?.message??"Import failed");
   if(mode==="preview")setPreview(data as Preview);
   else{setResult(data.duplicate?"This return was already imported.":"Import saved; customers created: "+data.customersCreated);setPreview(null);}
  }catch(e){setResult(e instanceof Error?e.message:"Import failed");}
  finally{setBusy(false);}
 }
 return <div className="space-y-4 rounded-xl border p-5">
  <label className="block text-sm font-semibold">GSTR-1 JSON or Excel (.xlsx), max 5 MB</label>
  <input type="file" accept=".json,.xlsx" onChange={e=>{setFile(e.target.files?.[0]??null);setPreview(null);setResult("");}}/>
  <button className="rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-50" disabled={!file||busy} onClick={()=>send("preview")}>Preview file</button>
  {preview&&<section className="space-y-2 rounded-lg border p-3"><h2 className="font-semibold">Review import · {preview.periodKey}</h2>
   <p>{preview.invoices.length} historical B2B invoice rows · {preview.customers.length} distinct customer GSTINs · {preview.hsn.length} HSN summary rows</p>
   <p className="text-xs">Source fingerprint: {preview.fingerprint.slice(0,16)}</p>
   {preview.warnings.map((w,i)=><p key={i} className="text-amber-700">{w}</p>)}
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={customers} onChange={e=>setCustomers(e.target.checked)}/> Create missing customer placeholders (review details later)</label>
   <p className="text-xs">HSN rows are stored as historical evidence, not automatically added as products or approved tax rates.</p>
   <button className="rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={()=>send("commit")}>Confirm and import</button>
  </section>}
  {result&&<p role="status">{result}</p>}
 </div>;
}

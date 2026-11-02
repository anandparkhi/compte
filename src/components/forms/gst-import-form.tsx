"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button } from "@/components/ui";

type Preview = {returnType:string;periodKey:string;invoices:{number:string;recipientGstin:string;value:number;taxable:number}[];customers:string[];hsn:{hsn:string;description:string}[];warnings:string[];fingerprint:string};
type Saved = {duplicate:boolean;customersCreated?:number;productsCreated?:number};
export function GstImportForm(){
 const router=useRouter();
 const [file,setFile]=useState<File|null>(null);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [saved,setSaved]=useState<{result:Saved;period:string}|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(false);
 const [importCustomers,setImportCustomers]=useState(true);
 async function send(mode:"preview"|"commit"){
  if(!file)return;
  if(file.size>5*1024*1024){setError("This file exceeds 5 MB. Choose a smaller return export.");return;}
  setLoading(true);setError("");
  const body=new FormData();body.set("file",file);body.set("mode",mode);
  if(mode==="commit"){body.set("confirm","IMPORT");body.set("customers",String(importCustomers));}
  try{
   const response=await fetch("/api/gst-import",{method:"POST",body});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error?.message??"Could not read this GST file.");
   if(mode==="preview"){setPreview(data as Preview);setSaved(null);}
   else{setSaved({result:data as Saved,period:preview!.periodKey});setPreview(null);setFile(null);router.refresh();}
  }catch(e){setError(e instanceof Error?e.message:"Something went wrong while reading the file.");}
  finally{setLoading(false);}
 }
 const money=(amount:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(amount);
 return <section className="space-y-4 rounded-2xl border border-line bg-white p-4 sm:p-6">
  <div><h2 className="text-lg font-semibold">1. Choose a GST return</h2><p className="mt-1 text-sm text-muted">Upload GSTR-1 JSON exported from the GST portal, or a supported Compte-format Excel worksheet (up to 5 MB). No GST portal login needed.</p></div>
  <label htmlFor="gst-return-file" className="block text-sm font-semibold">GSTR-1 file</label>
  <input id="gst-return-file" type="file" accept=".json,.xlsx" className="block w-full rounded-lg border border-line bg-canvas p-3 text-sm" onChange={e=>{setFile(e.target.files?.[0]??null);setPreview(null);setSaved(null);setError("");}}/>
  {file&&<p className="text-xs text-muted">Selected: {file.name}</p>}
  <Button type="button" disabled={!file||loading} onClick={()=>void send("preview")}>{loading?"Reading file…":"2. Preview the records"}</Button>
  {preview&&<div className="space-y-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
    <h3 className="font-semibold">Check before importing · {preview.periodKey.slice(0,2)}/{preview.periodKey.slice(2)}</h3>
    <div className="grid grid-cols-3 gap-2">{[[preview.invoices.length,"B2B invoices"],[preview.customers.length,"Customer GSTINs"],[preview.hsn.length,"HSN rows"]].map(([n,label])=><div className="rounded-lg bg-white p-3 text-center" key={label}><b className="block text-lg">{n}</b><span className="text-xs text-muted">{label}</span></div>)}</div>
    <div className="rounded-lg bg-white p-3 text-sm"><p className="text-muted">Historical taxable value</p><p className="text-xl font-bold">{money(preview.invoices.reduce((sum,i)=>sum+Number(i.taxable),0))}</p><p className="mt-1 text-xs text-muted">Reported invoice value: {money(preview.invoices.reduce((sum,i)=>sum+Number(i.value),0))} (B2B rows available in this file).</p></div>
    {preview.invoices.length>0&&<details className="text-sm"><summary className="cursor-pointer font-semibold">View sample invoice rows</summary><ul className="mt-2 divide-y divide-line">{preview.invoices.slice(0,5).map((i,n)=><li key={n} className="flex justify-between gap-2 py-2"><span>{i.number} · {i.recipientGstin}</span><b>{money(i.value)}</b></li>)}</ul></details>}
    {preview.warnings.length>0&&<Alert tone="warn" title="Review these data issues">{preview.warnings.map((w,i)=><p key={i}>{w}</p>)}</Alert>}
    <label className="flex items-start gap-3 rounded-lg bg-white p-3 text-sm"><input type="checkbox" className="mt-1 size-4 accent-brand-600" checked={importCustomers} onChange={e=>setImportCustomers(e.target.checked)}/><span>Create missing customer records from GSTINs. Existing customers will not be overwritten.</span></label>
    <p className="text-xs text-muted">HSN descriptions may create provisional product suggestions. They will be marked “Needs review” and must not be used as verified current prices or GST rates.</p>
    <p className="text-xs text-muted">Historical invoices will appear in your invoice history and business dashboard but will never be newly issued by Compte or automatically filed.</p>
    <Button disabled={loading} type="button" onClick={()=>void send("commit")}>{loading?"Saving…":"3. Confirm and import"}</Button>
  </div>}
  {saved&&<Alert tone="brand" title={saved.result.duplicate?"Already imported":"GST history added to Compte"}>
    <p>{saved.result.duplicate?"This same return content is already saved. No duplicate records were created.":`Created ${saved.result.customersCreated??0} customer records and ${saved.result.productsCreated??0} provisional products.`}</p>
    <div className="mt-3 flex flex-wrap gap-3"><Link className="font-semibold underline" href={`/invoices?period=${saved.period}`}>View invoices</Link><Link className="font-semibold underline" href="/returns">View GST returns</Link><Link className="font-semibold underline" href="/products">Review products</Link></div>
  </Alert>}
  {error&&<Alert tone="danger" title="Import could not be completed">{error}</Alert>}
 </section>;
}

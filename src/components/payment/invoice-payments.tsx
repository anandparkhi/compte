"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { whatsappText,normalizePhone,type MessageLang } from "@/lib/payment/reconciliation";
import { Alert, Button } from "@/components/ui";
type Payment={id:string;amount:string;reference:string|null};
type Snapshot={invoice:{invoiceNumber:string|null;grandTotal:string;customerId:string|null;customer:{name:string;phone:string|null}|null};payments:Payment[];balance:{paid:string;due:string;status:string}};
const money=(v:string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(v));
export function InvoicePayments({invoiceId,canWrite=true}:{invoiceId:string;canWrite?:boolean}){
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState("");
 const [amount,setAmount]=useState(""),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[reference,setReference]=useState("");
 const [language,setLanguage]=useState<MessageLang>("en"),[busy,setBusy]=useState(false);
 async function reload(){
  try{const r=await fetch("/api/invoices/"+invoiceId+"/payments");const d=await r.json();if(!r.ok)throw Error(d.error?.message??"Could not load payments");setData(d);}
  catch(e){setError(e instanceof Error?e.message:"Could not load payments");}
 }
 useEffect(()=>{void reload();},[invoiceId]);
 async function record(){
  if(!amount||Number(amount)<=0){setError("Enter an amount received.");return;}
  if(!window.confirm(`Confirm you received ${money(amount)} for this invoice? This records a payment in Compte.`))return;
  setBusy(true);setError("");
  try{const r=await fetch("/api/invoices/"+invoiceId+"/payments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount,receivedAt:date,reference})});const d=await r.json();if(!r.ok)throw Error(d.error?.message??"Could not record payment");setAmount("");setReference("");await reload();}
  catch(e){setError(e instanceof Error?e.message:"Could not record payment");}
  finally{setBusy(false);}
 }
 const customer=data?.invoice.customer;
 const phone=normalizePhone(customer?.phone??"");
 function share(kind:"invoice"|"reminder"){
  if(!data||!customer||!phone)return;
  const message=whatsappText(language,kind,customer.name,data.invoice.invoiceNumber??"",kind==="invoice"?data.invoice.grandTotal:data.balance.due);
  window.open("https://wa.me/"+phone+"?text="+encodeURIComponent(message),"_blank","noopener,noreferrer");
 }
 return <section className="space-y-4 rounded-xl border border-line bg-white p-4 sm:p-5">
  <h2 className="text-lg font-semibold">Payments & customer follow-up</h2>
  {!data?<p className="text-sm text-muted">Loading payment details…</p>:<>
   <div className="grid grid-cols-2 gap-3 rounded-xl bg-canvas p-4"><div><p className="text-xs text-muted">Payment received</p><p className="text-xl font-bold">{money(data.balance.paid)}</p></div><div><p className="text-xs text-muted">Still outstanding</p><p className="text-xl font-bold">{money(data.balance.due)}</p></div></div>
   <p className="text-sm font-semibold">{data.balance.status==="PAID"?"Fully paid":data.balance.status==="PARTIAL"?"Partly paid":"No payment recorded yet"}</p>
   {canWrite&&data.balance.status!=="PAID"&&<div className="space-y-3 border-t border-line pt-4">
    <h3 className="font-semibold">Record money you've received</h3><p className="text-xs text-muted">Only confirm payments you have actually received. This does not move money or contact your bank.</p>
    <div className="grid gap-2 sm:grid-cols-3"><label className="text-sm">Amount received<input className="mt-1 w-full rounded-lg border border-line p-2" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="text-sm">Date<input className="mt-1 w-full rounded-lg border border-line p-2" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label className="text-sm">UTR / reference<input className="mt-1 w-full rounded-lg border border-line p-2" value={reference} onChange={e=>setReference(e.target.value)} placeholder="Optional"/></label></div>
    <Button disabled={busy||!amount} onClick={()=>void record()}>{busy?"Saving…":"Confirm received payment"}</Button>
   </div>}
   <div className="space-y-3 border-t border-line pt-4"><h3 className="font-semibold">Share through WhatsApp (free)</h3><p className="text-xs text-muted">Choose a language. Compte opens WhatsApp with a prepared message; you review it and press Send. The invoice PDF must be shared separately.</p>
    <label className="block text-sm">Message language<select className="ml-2 rounded-lg border border-line p-2" value={language} onChange={e=>setLanguage(e.target.value as MessageLang)}><option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option></select></label>
    {phone?<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>share("invoice")}>Prepare invoice message</Button>{data.balance.status!=="PAID"&&<Button variant="secondary" onClick={()=>share("reminder")}>Prepare payment reminder</Button>}</div>
    :<p className="text-sm text-muted">Add the customer's phone number to share by WhatsApp. {data.invoice.customerId&&<Link className="font-semibold text-brand-700 underline" href={`/customers/${data.invoice.customerId}`}>Edit customer →</Link>}</p>}
   </div>
   {data.payments.length>0&&<details><summary className="cursor-pointer text-sm font-semibold">Payment history ({data.payments.length})</summary><ul className="mt-2 divide-y divide-line">{data.payments.map(p=><li key={p.id} className="flex justify-between gap-2 py-2 text-sm"><span>{p.reference||"Manual payment"}</span><b>{money(p.amount)}</b></li>)}</ul></details>}
  </>}
  {error&&<Alert tone="danger">{error}</Alert>}
 </section>;
}

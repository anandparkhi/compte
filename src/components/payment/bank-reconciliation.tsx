"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Card } from "@/components/ui";

type Suggestion = {
 bank:{id:string;date:string;amount:string;reference:string;narration:string};
 candidates:{id:string;number:string;customer:string;amount:string}[]
};
type Preview = {count:number;rows:{date:string;amount:string;reference:string;narration:string}[]};
const money=(v:string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(v));
const sample="Date,Amount,Reference,Narration%0A2026-11-02,11800.00,UTR123456,UPI%20customer%20payment";
export function BankReconciliation(){
 const [file,setFile]=useState<File|null>(null);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [list,setList]=useState<Suggestion[]>([]);
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 async function refresh(){
  setLoading(true);
  try{const r=await fetch("/api/bank-reconciliation");const data=await r.json();if(!r.ok)throw Error(data.error?.message??"Could not load bank records");setList(data);}
  catch(e){setNotice(e instanceof Error?e.message:"Could not load records");}
  finally{setLoading(false);}
 }
 useEffect(()=>{void refresh();},[]);
 async function upload(commit:boolean){
  if(!file)return;
  if(commit&&!window.confirm("Save these bank credits? Nothing will be marked paid yet."))return;
  setBusy(true);setNotice("");
  const form=new FormData();form.set("file",file);if(commit)form.set("confirm","IMPORT");
  try{const r=await fetch("/api/bank-reconciliation",{method:"POST",body:form});const data=await r.json();if(!r.ok)throw Error(data.error?.message??"Statement could not be imported");
   if(commit){setNotice(`${data.imported} credits imported; ${data.duplicates} duplicates skipped. Review suggested matches below.`);setPreview(null);setFile(null);void refresh();}
   else setPreview(data as Preview);
  }catch(e){setNotice(e instanceof Error?e.message:"Unable to upload statement");}
  finally{setBusy(false);}
 }
 async function confirm(row:Suggestion,candidate:Suggestion["candidates"][number]){
  if(!window.confirm(`Confirm receipt of ${money(row.bank.amount)} for invoice ${candidate.number}? Verify the payer and reference against your bank statement first.`))return;
  setBusy(true);setNotice("");
  try{
   const r=await fetch("/api/bank-reconciliation",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:"MATCH",invoiceId:candidate.id,bankTransactionId:row.bank.id,amount:row.bank.amount,receivedAt:new Date(row.bank.date).toISOString().slice(0,10),reference:row.bank.reference})});
   const d=await r.json();if(!r.ok)throw Error(d.error?.message??"Could not confirm payment");
   setNotice("Payment matched and saved. The invoice balance has been updated.");void refresh();
  }catch(e){setNotice(e instanceof Error?e.message:"Could not confirm match");}
  finally{setBusy(false);}
 }
 return <div className="mx-auto max-w-3xl space-y-5">
  <div><h1 className="text-2xl font-bold">Match bank and UPI payments</h1><p className="mt-1 text-sm text-muted">Find which invoices have been paid. Compte suggests matches, but only you can confirm a payment.</p></div>
  <Card className="space-y-3">
   <h2 className="font-semibold">1. Upload bank credits</h2><p className="text-sm text-muted">Export your bank transactions, then use a CSV or Excel file with four columns: Date (YYYY-MM-DD), Amount, Reference/UTR and Narration. The import accepts only positive credits, up to 2 MB or 500 rows.</p>
   <a href={`data:text/csv,${sample}`} download="compte-bank-template.csv" className="inline-block text-sm font-semibold text-brand-700 underline">Download sample CSV format</a>
   <label htmlFor="bank-file" className="block text-sm font-semibold">Bank statement</label>
   <input id="bank-file" type="file" accept=".csv,.xlsx" className="block w-full rounded-lg border border-line p-3 text-sm" onChange={e=>{setFile(e.target.files?.[0]??null);setPreview(null);setNotice("");}}/>
   <Button disabled={!file||busy} onClick={()=>void upload(false)}>{busy?"Checking…":"2. Preview transactions"}</Button>
   {preview&&<div className="space-y-3 rounded-lg bg-brand-50 p-3"><p className="font-semibold">{preview.count} credits ready to import</p><p className="text-sm">Total credits: {money(preview.rows.reduce((sum,r)=>sum+Number(r.amount),0).toFixed(2))}</p>
    <ul className="divide-y divide-line text-sm">{preview.rows.slice(0,8).map((r,i)=><li key={i} className="flex justify-between gap-2 py-2"><span>{r.date} · {r.reference||r.narration}</span><b>{money(r.amount)}</b></li>)}</ul>
    {preview.count>8&&<p className="text-xs text-muted">Showing the first 8 transactions. All {preview.count} will be imported.</p>}
    <p className="text-xs text-muted">Importing bank credits does not automatically mark any invoice paid.</p>
    <Button disabled={busy} onClick={()=>void upload(true)}>3. Confirm bank import</Button>
   </div>}
  </Card>
  {notice&&<Alert tone="info">{notice}</Alert>}
  <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-semibold">4. Review possible invoice matches</h2><span className="text-xs text-muted">{list.length} unmatched credits</span></div>
   {loading?<p className="text-sm text-muted">Loading bank records…</p>:list.length===0?<Card><p className="text-sm text-muted">No unmatched bank credits yet. Upload a statement above to find invoice matches.</p></Card>:list.map(row=><Card key={row.bank.id} className="space-y-2 p-4">
    <div className="flex flex-wrap justify-between gap-2"><div><p className="text-lg font-bold">{money(row.bank.amount)}</p><p className="text-xs text-muted">{new Date(row.bank.date).toLocaleDateString("en-IN")} · Ref: {row.bank.reference||"Not provided"}</p></div><span className="text-xs text-muted">Unmatched</span></div>
    <p className="text-sm text-muted">{row.bank.narration}</p>
    {row.candidates.length?<div className="space-y-2"><p className="text-xs font-semibold">Possible matches by amount only — verify before confirming</p>{row.candidates.map(c=><button disabled={busy} key={c.id} type="button" className="block w-full rounded-lg border border-line p-3 text-left text-sm hover:bg-canvas disabled:opacity-50" onClick={()=>void confirm(row,c)}><b>{c.number}</b> · {c.customer} <span className="block text-xs text-brand-700">Review and confirm match →</span></button>)}</div>
    :<p className="text-sm text-muted">No invoice with this exact outstanding amount was found. Keep it unmatched until you identify the payment.</p>}
   </Card>)}
  </section>
  <p className="text-xs text-muted">This is a manual import, not a live bank connection. Bank statement rows and invoice suggestions are not proof of customer identity or payment allocation.</p>
 </div>;
}

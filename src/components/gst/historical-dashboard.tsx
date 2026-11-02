"use client";
import {useState} from "react";
import type {HistoricalSummary} from "@/lib/gst-import/summary";
import {getBusinessInsights} from "@/lib/gst-import/insights";
import {dashboardLocales,dashboardLanguageOptions,type DashboardLanguage} from "@/lib/gst-import/locales";
export function HistoricalGstDashboard({data}:{data:HistoricalSummary}){
 const [lang,setLang]=useState<DashboardLanguage>("en");
 const t=dashboardLocales[lang],ins=getBusinessInsights(data);
 const money=(v:number)=>new Intl.NumberFormat(t.locale,{style:"currency",currency:"INR",maximumFractionDigits:0}).format(v);
 const percent=(v:number|null)=>v===null?t.notAvailable:new Intl.NumberFormat(t.locale,{maximumFractionDigits:1,signDisplay:"exceptZero"}).format(v)+"%";
 const month=(p:string|null)=>p?new Intl.DateTimeFormat(t.locale,{month:"short",year:"numeric"}).format(new Date(Number(p.slice(2)),Number(p.slice(0,2))-1,1)):t.notAvailable;
 const kpis=[[t.sales,money(data.invoiceValue)],[t.taxable,money(data.taxable)],[t.customers,String(data.customerCount)],[t.invoices,String(data.invoiceCount)],[t.average,money(ins.averageInvoice)],[t.monthly,money(ins.averageMonthlySales)],[t.growth,percent(ins.latestChangePercent)],[t.concentration,ins.topCustomerShare===null?t.notAvailable:percent(ins.topCustomerShare)]];
 const insight=ins.latestChangePercent===null?t.unknown:ins.latestChangePercent>0?t.up:ins.latestChangePercent<0?t.down:t.flat;
 return <section className="space-y-5">
  <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{t.title}</h1><p className="text-sm text-muted">{t.subtitle}</p></div><label className="flex items-center gap-2 text-sm">{t.language}<select aria-label={t.language} className="rounded-lg border p-2" value={lang} onChange={e=>setLang(e.target.value as DashboardLanguage)}>{dashboardLanguageOptions.map(o=><option value={o.value} key={o.value}>{o.label}</option>)}</select></label></header>
  {data.periods.length===0?<p className="rounded-lg border p-4">{t.empty}</p>:<>
   <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{kpis.map(([label,value])=><div className="rounded-xl border p-3" key={label}><p className="text-xs text-muted">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>)}</div>
   <div className="rounded-xl border p-4"><h2 className="font-semibold">{t.trend}</h2><p className="mt-2 text-sm">{insight}</p><div className="mt-3 space-y-2">{data.periods.map(p=><div key={p.period} className="flex items-center justify-between gap-4 border-b py-2 text-sm"><span>{month(p.period)}</span><span className="font-semibold">{money(p.invoiceValue)}</span></div>)}</div></div>
   <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border p-4"><p className="text-xs text-muted">{t.strongest}</p><p className="font-semibold">{month(ins.strongestMonth)}</p><p className="mt-3 text-xs text-muted">{t.weakest}</p><p className="font-semibold">{month(ins.weakestMonth)}</p></div><div className="rounded-xl border p-4"><p className="text-xs text-muted">{t.months}</p><p className="font-semibold">{ins.coveredMonths} {t.monthWord}</p><p className="mt-3 text-xs text-muted">{t.missing}</p><p>{ins.missingMonths.length?ins.missingMonths.map(month).join(", "):"—"}</p><p className="mt-2 text-xs text-muted">{t.missingNote}</p></div></div>
   <div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border p-4"><h2 className="font-semibold">{t.top}</h2>{data.topCustomers.map(c=><p className="flex justify-between gap-2 border-b py-2 text-sm" key={c.gstin}><span>{c.gstin}</span><span>{money(c.value)}</span></p>)}<p className="mt-3 text-sm">{ins.topCustomerShare!==null&&ins.topCustomerShare>=40?t.risk:t.safe}</p></div><div className="rounded-xl border p-4"><h2 className="font-semibold">{t.hsn}</h2>{data.topHsn.map(h=><p className="flex justify-between gap-2 border-b py-2 text-sm" key={h.hsn}><span>{h.hsn} {h.description}</span><span>{money(h.taxable)}</span></p>)}<p className="mt-2 text-xs text-muted">{t.hsnNote}</p></div></div>
  </>}
  <aside className="rounded-xl border p-4"><h2 className="font-semibold">{t.notes}</h2><p className="mt-2 text-sm">{t.partial}</p>{data.warnings.slice(1).map((w,i)=><p className="mt-2 text-xs text-muted" key={i}>{w}</p>)}</aside>
 </section>;
}

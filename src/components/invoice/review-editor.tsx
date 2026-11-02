"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Sparkles, Trash2, XCircle } from "lucide-react";
import { Alert, Badge, Button, Card, CardTitle, Field, Input, PageHeader, Select } from "@/components/ui";
import { api, errorText } from "@/lib/client-api";
import { formatINR } from "@/lib/domain/money";
import { KNOWN_GST_RATES } from "@/lib/domain/gst";
import type { DraftComputation } from "@/lib/domain/invoice-rules";

type Labels = Record<"review_title" | "review_subtitle" | "review_customer" | "review_items" | "review_pos" | "review_pos_confirm" | "review_date" | "review_confirm" | "review_save" | "review_discard" | "review_issues" | "review_warnings" | "review_extracted_by" | "review_add_line" | "review_total" | "review_taxable" | "confirm_dialog", string>;
type Cust = { id: string; name: string; stateCode: string; shippingStateCode: string | null; gstin: string | null };
type Prod = { id: string; name: string; hsnSac: string; unit: string; gstRate: string; defaultPrice: string; priceIncludesTax: boolean; kind: string };
type Line = { productId: string | null; description: string; quantity: string; unitPrice: string; gstRate: string; priceIncludesTax: boolean };
interface View {
  invoice: { id: string; customerId: string | null; invoiceDate: string; placeOfSupplyStateCode: string | null; placeOfSupplySource: string | null; sourceText: string | null; sourceLanguage: string | null; extractionMethod: string | null; extractionNotes: string[]; source: string; lineItems: (Line & { hsnSac: string; unit: string })[] };
  computation: DraftComputation | null;
}

const LANG_NAME: Record<string, string> = { en: "English", hi: "Hindi", mr: "Marathi", mixed: "Code-mixed" };

export function ReviewEditor({ labels: L, initial, customers, products, states, supplierStateCode }: { labels: Labels; initial: View; customers: Cust[]; products: Prod[]; states: { code: string; name: string }[]; supplierStateCode: string }) {
  const router = useRouter();
  const inv = initial.invoice;
  const [customerId, setCustomerId] = useState<string | null>(inv.customerId);
  const [invoiceDate, setInvoiceDate] = useState(inv.invoiceDate);
  const [pos, setPos] = useState<string | null>(inv.placeOfSupplyStateCode);
  const [posConfirmed, setPosConfirmed] = useState(inv.placeOfSupplySource === "USER_CONFIRMED");
  const [lines, setLines] = useState<Line[]>(inv.lineItems.map((l) => ({ productId: l.productId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, gstRate: l.gstRate, priceIncludesTax: l.priceIncludesTax })));
  const [comp, setComp] = useState<DraftComputation | null>(initial.computation);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const idem = useRef<string>("");
  const first = useRef(true);
  useEffect(() => { idem.current = crypto.randomUUID(); }, []);

  const save = useCallback(async () => {
    setSaving(true); setErr(null);
    try {
      const v = await api<View>(`/api/invoices/${inv.id}`, { method: "PUT", body: { customerId, invoiceDate, placeOfSupplyStateCode: pos, placeOfSupplyConfirmed: posConfirmed, lines } });
      setComp(v.computation);
      setDirty(false);
    } catch (e) { setErr(errorText(e)); }
    setSaving(false);
  }, [inv.id, customerId, invoiceDate, pos, posConfirmed, lines]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setDirty(true);
    const h = setTimeout(save, 500);
    return () => clearTimeout(h);
  }, [save]);

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pickProduct = (i: number, id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return setLine(i, { productId: null });
    setLine(i, { productId: p.id, description: p.name, gstRate: p.gstRate, priceIncludesTax: p.priceIncludesTax, unitPrice: lines[i].unitPrice || p.defaultPrice });
  };
  const pickCustomer = (id: string) => {
    setCustomerId(id || null);
    const c = customers.find((x) => x.id === id);
    const servicesOnly = lines.length > 0 && lines.every((l) => products.find((p) => p.id === l.productId)?.kind === "SERVICES");
    setPos(c ? (servicesOnly ? c.stateCode : c.shippingStateCode ?? c.stateCode) : null);
    setPosConfirmed(false);
  };

  const blockers = comp?.issues.filter((i) => i.severity === "BLOCKER") ?? [];
  const warnings = comp?.issues.filter((i) => i.severity === "WARNING") ?? [];
  const canIssue = !!comp?.canIssue && !dirty && !saving;
  const customer = customers.find((c) => c.id === customerId);
  const posDiffers = customer && pos && pos !== customer.stateCode;

  const issue = async () => {
    setIssuing(true); setErr(null);
    try {
      await api(`/api/invoices/${inv.id}/issue`, { body: { idempotencyKey: idem.current, expectedGrandTotal: comp!.totals.grandTotal, confirm: true } });
      router.refresh();
    } catch (e) { setErr(errorText(e)); setIssuing(false); setConfirmOpen(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-24">
      <PageHeader title={L.review_title} subtitle={L.review_subtitle} actions={<Badge tone="warn">Draft</Badge>} />

      {inv.sourceText && (
        <Card className="bg-brand-50/50">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Sparkles className="size-4 text-brand-600" aria-hidden />
            <span>{L.review_extracted_by}: <b className="text-ink">{inv.extractionMethod === "CLAUDE" ? "Claude" : inv.extractionMethod === "RULES" ? "Compte rules (offline)" : "Manual"}</b></span>
            {inv.sourceLanguage && <Badge>{LANG_NAME[inv.sourceLanguage] ?? inv.sourceLanguage}</Badge>}
            <Badge>{inv.source === "VOICE" ? "Voice" : inv.source === "SMS" ? "SMS" : "Typed"}</Badge>
          </div>
          <p className="mt-2 text-[15px] leading-relaxed">“{inv.sourceText}”</p>
          {inv.extractionNotes.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted">{inv.extractionNotes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </Card>
      )}

      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label={L.review_customer} htmlFor="cust" hint={<Link href="/customers/new" className="font-semibold text-brand-700" target="_blank">+ Add a new customer</Link>}>
          <Select id="cust" value={customerId ?? ""} onChange={(e) => pickCustomer(e.target.value)}>
            <option value="">— Select customer —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.gstin ? ` · ${c.gstin}` : " · unregistered"}</option>)}
          </Select>
        </Field>
        <Field label={L.review_date} htmlFor="date"><Input id="date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></Field>
        <div className="sm:col-span-2">
          <Field label={L.review_pos} htmlFor="pos" hint={posDiffers ? "Different from the customer's billing state — goods: where delivery ends; B2B services: recipient's location." : "Suggested from the customer's delivery state. Compte does not assume it — please confirm."}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select id="pos" className="sm:max-w-xs" value={pos ?? ""} onChange={(e) => { setPos(e.target.value || null); setPosConfirmed(false); }}>
                <option value="">— Select state —</option>
                {states.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
              </Select>
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-medium">
                <input type="checkbox" className="size-5 accent-brand-600" checked={posConfirmed} disabled={!pos} onChange={(e) => setPosConfirmed(e.target.checked)} />
                {L.review_pos_confirm}
              </label>
            </div>
          </Field>
          {pos && <p className="mt-2 text-xs text-muted">{pos === supplierStateCode ? "Intra-state supply → CGST + SGST" : "Inter-state supply → IGST"}</p>}
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">{L.review_items}</CardTitle>
        <div className="space-y-3">
          {lines.map((l, i) => {
            const t = comp?.lines[i]?.tax;
            const p = products.find((x) => x.id === l.productId);
            return (
              <div key={i} className="rounded-xl border border-line p-3">
                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-5">
                    <Field label={`Item ${i + 1}`} htmlFor={`p${i}`} hint={p ? `HSN/SAC ${p.hsnSac} · ${p.unit} · from your product settings` : undefined}>
                      <Select id={`p${i}`} value={l.productId ?? ""} onChange={(e) => pickProduct(i, e.target.value)}>
                        <option value="">— Choose product —</option>
                        {products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <div className="sm:col-span-2"><Field label="Qty" htmlFor={`q${i}`}><Input id={`q${i}`} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></Field></div>
                  <div className="sm:col-span-3"><Field label={`Rate ₹ (${l.priceIncludesTax ? "incl." : "excl."} GST)`} htmlFor={`r${i}`}><Input id={`r${i}`} inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></Field></div>
                  <div className="sm:col-span-2"><Field label="GST %" htmlFor={`g${i}`}><Select id={`g${i}`} value={l.gstRate} onChange={(e) => setLine(i, { gstRate: e.target.value })}><option value="">—</option>{KNOWN_GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</Select></Field></div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={l.priceIncludesTax} onChange={(e) => setLine(i, { priceIncludesTax: e.target.checked })} />Rate includes GST</label>
                  <div className="flex items-center gap-3">
                    <span className="tabular text-sm text-muted">{t ? <>Taxable {formatINR(t.taxableValue)} · <b className="text-ink">{formatINR(t.lineTotal)}</b></> : "—"}</span>
                    <button type="button" aria-label={`Remove item ${i + 1}`} className="rounded-lg p-2 text-muted hover:bg-danger-50 hover:text-danger-600" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Button variant="secondary" className="mt-3" onClick={() => setLines((ls) => [...ls, { productId: null, description: "", quantity: "", unitPrice: "", gstRate: "", priceIncludesTax: false }])}><Plus className="size-4" />{L.review_add_line}</Button>
      </Card>

      {blockers.length > 0 && (
        <Alert tone="danger" title={<span className="flex items-center gap-2"><XCircle className="size-4" />{L.review_issues}</span>}>
          <ul className="list-disc space-y-0.5 pl-5">{blockers.map((b, i) => <li key={i}>{b.message}</li>)}</ul>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert tone="warn" title={<span className="flex items-center gap-2"><AlertTriangle className="size-4" />{L.review_warnings}</span>}>
          <ul className="list-disc space-y-0.5 pl-5">{warnings.map((b, i) => <li key={i}>{b.message}</li>)}</ul>
        </Alert>
      )}
      {err && <Alert tone="danger">{err}</Alert>}

      <Card>
        <dl className="tabular space-y-1.5 text-sm">
          <div className="flex justify-between"><dt>{L.review_taxable}</dt><dd>{formatINR(comp?.totals.taxableTotal ?? "0")}</dd></div>
          {comp?.supplyType === "INTER" ? <div className="flex justify-between"><dt>IGST</dt><dd>{formatINR(comp.totals.igstTotal)}</dd></div>
            : <><div className="flex justify-between"><dt>CGST</dt><dd>{formatINR(comp?.totals.cgstTotal ?? "0")}</dd></div><div className="flex justify-between"><dt>SGST</dt><dd>{formatINR(comp?.totals.sgstTotal ?? "0")}</dd></div></>}
          <div className="flex justify-between border-t border-line pt-2 text-lg font-bold"><dt>{L.review_total}</dt><dd data-testid="grand-total">{formatINR(comp?.totals.grandTotal ?? "0")}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-muted">Calculated by Compte&apos;s deterministic GST engine (exact decimals, line-level rounding to paise).</p>
      </Card>

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-white/95 p-3 backdrop-blur lg:static lg:bottom-auto lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <Button variant="danger" onClick={async () => { if (!confirm("Discard this draft?")) return; await api(`/api/invoices/${inv.id}`, { method: "DELETE" }); router.push("/invoices"); }} aria-label={L.review_discard}><Trash2 className="size-4" /><span className="hidden sm:inline">{L.review_discard}</span></Button>
          <span className="flex-1 text-center text-xs text-muted" aria-live="polite">{saving ? <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" />Saving…</span> : dirty ? "Unsaved" : "Draft saved"}</span>
          <Button size="lg" onClick={() => setConfirmOpen(true)} disabled={!canIssue}><CheckCircle2 className="size-5" />{L.review_confirm}</Button>
        </div>
      </div>

      {confirmOpen && comp && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-0 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 sm:rounded-3xl">
            <h2 id="confirm-title" className="text-lg font-bold">{L.review_confirm}</h2>
            <p className="mt-1 text-sm text-muted">{L.confirm_dialog}</p>
            <p className="mt-3 text-sm">{customer?.name}</p>
            <p className="tabular text-3xl font-bold">{formatINR(comp.totals.grandTotal)}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={issuing}>Cancel</Button>
              <Button onClick={issue} disabled={issuing}>{issuing ? <Loader2 className="size-4 animate-spin" /> : null}Issue invoice</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


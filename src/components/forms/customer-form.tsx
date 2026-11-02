"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { api, errorText } from "@/lib/client-api";
import { GSTIN_REASON_TEXT, validateGstin } from "@/lib/domain/gstin";
import { SELECTABLE_STATES } from "@/lib/domain/states";

export interface CustomerFormValue { name: string; aliases: string[]; registrationStatus: "REGISTERED" | "UNREGISTERED"; gstin: string; stateCode: string; billingAddress: string; shippingAddress: string; shippingStateCode: string; phone: string; email: string }

export function CustomerForm({ id, initial }: { id?: string; initial?: Partial<CustomerFormValue> }) {
  const router = useRouter();
  const [v, setV] = useState<CustomerFormValue>({ name: "", aliases: [], registrationStatus: "REGISTERED", gstin: "", stateCode: "27", billingAddress: "", shippingAddress: "", shippingStateCode: "", phone: "", email: "", ...initial });
  const [aliases, setAliases] = useState((initial?.aliases ?? []).join(", "));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CustomerFormValue>(k: K, val: CustomerFormValue[K]) => setV((p) => ({ ...p, [k]: val }));
  const g = v.registrationStatus === "REGISTERED" && v.gstin ? validateGstin(v.gstin) : null;
  return (
    <Card>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(null);
        const body = { ...v, aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean), gstin: v.registrationStatus === "REGISTERED" ? v.gstin : null, shippingAddress: v.shippingAddress || null, shippingStateCode: v.shippingAddress ? v.shippingStateCode || v.stateCode : null, email: v.email || null, phone: v.phone || null };
        try { await api(id ? `/api/customers/${id}` : "/api/customers", { method: id ? "PUT" : "POST", body }); router.push("/customers"); router.refresh(); } catch (e2) { setErr(errorText(e2)); setBusy(false); }
      }}>
        <Field label="Customer name" htmlFor="name"><Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} required /></Field>
        <Field label="Other names / spellings" htmlFor="aliases" hint="Comma separated — helps Compte recognise the customer in Hindi or Marathi (e.g. Ramesh, रमेश ट्रेडर्स)"><Input id="aliases" value={aliases} onChange={(e) => setAliases(e.target.value)} /></Field>
        <Field label="GST registration" htmlFor="reg"><Select id="reg" value={v.registrationStatus} onChange={(e) => set("registrationStatus", e.target.value as CustomerFormValue["registrationStatus"])}><option value="REGISTERED">Registered (B2B)</option><option value="UNREGISTERED">Unregistered (B2C)</option></Select></Field>
        {v.registrationStatus === "REGISTERED" && (
          <Field label="Customer GSTIN" htmlFor="gstin" error={g && !g.valid ? GSTIN_REASON_TEXT[g.reason] : null} hint="Structural check only — Compte cannot confirm live registration">
            <Input id="gstin" className="font-mono uppercase" maxLength={15} value={v.gstin} onChange={(e) => { const x = e.target.value.toUpperCase(); set("gstin", x); const r = validateGstin(x); if (r.valid) set("stateCode", r.stateCode); }} required />
          </Field>
        )}
        <Field label="State (billing)" htmlFor="state"><Select id="state" value={v.stateCode} onChange={(e) => set("stateCode", e.target.value)}>{SELECTABLE_STATES.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}</Select></Field>
        <Field label="Billing address" htmlFor="bill"><Input id="bill" value={v.billingAddress} onChange={(e) => set("billingAddress", e.target.value)} required /></Field>
        <Field label="Shipping address (if different)" htmlFor="ship"><Input id="ship" value={v.shippingAddress} onChange={(e) => set("shippingAddress", e.target.value)} /></Field>
        {v.shippingAddress && <Field label="Shipping state" htmlFor="sstate" hint="Used to suggest the place of supply for goods"><Select id="sstate" value={v.shippingStateCode || v.stateCode} onChange={(e) => set("shippingStateCode", e.target.value)}>{SELECTABLE_STATES.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}</Select></Field>}
        <Field label="Phone" htmlFor="phone"><Input id="phone" inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Email (for sending invoices)" htmlFor="email"><Input id="email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} /></Field>
        {err && <Alert tone="danger" className="sm:col-span-2">{err}</Alert>}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" size="lg" disabled={busy}>{busy ? "Saving…" : "Save customer"}</Button>
          {id && <Button type="button" variant="danger" size="lg" onClick={async () => { if (!confirm("Archive this customer? Existing invoices are unaffected.")) return; await api(`/api/customers/${id}`, { method: "DELETE" }); router.push("/customers"); router.refresh(); }}>Archive</Button>}
        </div>
      </form>
    </Card>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { api, errorText } from "@/lib/client-api";
import { KNOWN_GST_RATES, validateHsnSac } from "@/lib/domain/gst";
import { UNITS } from "@/lib/schemas";

export interface ProductFormValue { name: string; aliases: string[]; description: string; kind: "GOODS" | "SERVICES"; hsnSac: string; unit: string; defaultPrice: string; gstRate: string; priceIncludesTax: boolean; taxEffectiveFrom: string }

export function ProductForm({ id, initial }: { id?: string; initial?: Partial<ProductFormValue> }) {
  const router = useRouter();
  const [v, setV] = useState<ProductFormValue>({ name: "", aliases: [], description: "", kind: "GOODS", hsnSac: "", unit: "NOS", defaultPrice: "", gstRate: "", priceIncludesTax: false, taxEffectiveFrom: "", ...initial });
  const [aliases, setAliases] = useState((initial?.aliases ?? []).join(", "));
  const [confirmed, setConfirmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ProductFormValue>(k: K, val: ProductFormValue[K]) => { setConfirmed(false); setV((p) => ({ ...p, [k]: val })); };
  const hsnErr = v.hsnSac ? validateHsnSac(v.hsnSac, v.kind) : null;
  return (
    <Card>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(null);
        const body = { ...v, aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean), description: v.description || null, taxEffectiveFrom: v.taxEffectiveFrom || null, taxConfirmed: confirmed };
        try { await api(id ? `/api/products/${id}` : "/api/products", { method: id ? "PUT" : "POST", body }); router.push("/products"); router.refresh(); } catch (e2) { setErr(errorText(e2)); setBusy(false); }
      }}>
        <Field label="Product / service name" htmlFor="name"><Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} required /></Field>
        <Field label="What customers call it" htmlFor="aliases" hint="Comma separated, any language (e.g. box, बॉक्स, डब्बा)"><Input id="aliases" value={aliases} onChange={(e) => setAliases(e.target.value)} /></Field>
        <Field label="Type" htmlFor="kind"><Select id="kind" value={v.kind} onChange={(e) => set("kind", e.target.value as ProductFormValue["kind"])}><option value="GOODS">Goods (HSN)</option><option value="SERVICES">Services (SAC)</option></Select></Field>
        <Field label={v.kind === "GOODS" ? "HSN code" : "SAC code"} htmlFor="hsn" error={hsnErr} hint="Enter the code from your GST records. Compte never guesses HSN/SAC codes."><Input id="hsn" inputMode="numeric" className="font-mono" value={v.hsnSac} onChange={(e) => set("hsnSac", e.target.value.replace(/\D/g, ""))} required /></Field>
        <Field label="GST rate" htmlFor="rate" hint="The rate that applies to this HSN/SAC for your supply. Compte does not decide rates."><Select id="rate" value={v.gstRate} onChange={(e) => set("gstRate", e.target.value)} required><option value="">— Select —</option>{KNOWN_GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</Select></Field>
        <Field label="Unit" htmlFor="unit"><Select id="unit" value={v.unit} onChange={(e) => set("unit", e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
        <Field label="Default price ₹" htmlFor="price"><Input id="price" inputMode="decimal" value={v.defaultPrice} onChange={(e) => set("defaultPrice", e.target.value)} required /></Field>
        <Field label="Price includes GST?" htmlFor="incl"><Select id="incl" value={v.priceIncludesTax ? "yes" : "no"} onChange={(e) => set("priceIncludesTax", e.target.value === "yes")}><option value="no">No — GST is added on top</option><option value="yes">Yes — price already includes GST</option></Select></Field>
        <Field label="Tax setting effective from (optional)" htmlFor="eff"><Input id="eff" type="date" value={v.taxEffectiveFrom} onChange={(e) => set("taxEffectiveFrom", e.target.value)} /></Field>
        <Field label="Description (optional)" htmlFor="desc"><Input id="desc" value={v.description} onChange={(e) => set("description", e.target.value)} /></Field>
        <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-0.5 size-5 accent-brand-600" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>I confirm the HSN/SAC code and GST rate are correct for this product (from my GST records or my accountant).</span>
        </label>
        {err && <Alert tone="danger" className="sm:col-span-2">{err}</Alert>}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" size="lg" disabled={busy || !confirmed || !!hsnErr}>{busy ? "Saving…" : "Save product"}</Button>
          {id && <Button type="button" variant="danger" size="lg" onClick={async () => { if (!confirm("Archive this product?")) return; await api(`/api/products/${id}`, { method: "DELETE" }); router.push("/products"); router.refresh(); }}>Archive</Button>}
        </div>
      </form>
    </Card>
  );
}

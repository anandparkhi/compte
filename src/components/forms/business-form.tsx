"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { Alert, Button, Card, CardTitle, Field, Input, Select } from "@/components/ui";
import { api, errorText } from "@/lib/client-api";
import { GSTIN_REASON_TEXT, validateGstin } from "@/lib/domain/gstin";
import { SELECTABLE_STATES } from "@/lib/domain/states";
import { formatInvoiceNumber } from "@/lib/domain/invoice-number";
import type { BusinessInputT } from "@/lib/schemas";

type V = BusinessInputT;
const defaults: V = {
  legalName: "", tradeName: "", gstin: "", addressLine: "", city: "", pincode: "", stateCode: "27", contactPerson: "", phone: "", email: "",
  registrationType: "REGULAR", filingFrequency: "MONTHLY", financialYear: "2026-27", eInvoiceMandatory: false, preferredLanguage: "en",
  invoicePrefix: "INV", signatoryName: "", signatoryDesignation: "Proprietor", phoneIsGstnRegistered: "UNKNOWN",
};

export function BusinessForm({ mode, initial }: { mode: "onboarding" | "settings"; initial: Partial<V> }) {
  const router = useRouter();
  const [v, setV] = useState<V>({ ...defaults, ...initial } as V);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof V>(k: K, val: V[K]) => { setSaved(false); setV((p) => ({ ...p, [k]: val })); };
  const g = useMemo(() => (v.gstin ? validateGstin(v.gstin) : null), [v.gstin]);
  const preview = useMemo(() => { try { return formatInvoiceNumber(v.invoicePrefix || "X", v.financialYear, 1); } catch { return "Prefix too long"; } }, [v.invoicePrefix, v.financialYear]);

  const sections = [
    {
      title: "Business & GST details",
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal name (as on GST certificate)" htmlFor="legalName"><Input id="legalName" value={v.legalName} onChange={(e) => set("legalName", e.target.value)} required /></Field>
          <Field label="Trade name (optional)" htmlFor="tradeName"><Input id="tradeName" value={v.tradeName ?? ""} onChange={(e) => set("tradeName", e.target.value)} /></Field>
          <Field label="GSTIN" htmlFor="gstin" error={g && !g.valid ? GSTIN_REASON_TEXT[g.reason] : null}
            hint={g?.valid ? <span className="inline-flex items-center gap-1 text-brand-700"><CheckCircle2 className="size-3.5" /> Format and check digit valid — registration status not verified (needs an authorised GSTN source)</span> : "15 characters, e.g. 27ABCDE1234F1Z5"}>
            <Input id="gstin" className="font-mono uppercase" maxLength={15} value={v.gstin} onChange={(e) => { const x = e.target.value.toUpperCase(); set("gstin", x); const r = validateGstin(x); if (r.valid) set("stateCode", r.stateCode); }} required />
          </Field>
          <Field label="Registration type" htmlFor="reg">
            <Select id="reg" value={v.registrationType} onChange={(e) => set("registrationType", e.target.value as V["registrationType"])}>
              <option value="REGULAR">Regular (normal taxpayer)</option><option value="COMPOSITION">Composition</option><option value="CASUAL">Casual taxable person</option><option value="SEZ_UNIT">SEZ unit</option><option value="SEZ_DEVELOPER">SEZ developer</option>
            </Select>
          </Field>
          <Field label="Return filing frequency" htmlFor="freq" hint="As opted on the GST portal (QRMP = quarterly)">
            <Select id="freq" value={v.filingFrequency} onChange={(e) => set("filingFrequency", e.target.value as V["filingFrequency"])}><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly (QRMP)</option></Select>
          </Field>
          <Field label="Financial year" htmlFor="fy"><Select id="fy" value={v.financialYear} onChange={(e) => set("financialYear", e.target.value)}>{["2025-26", "2026-27", "2027-28"].map((f) => <option key={f}>{f}</option>)}</Select></Field>
          <label className="flex items-start gap-3 rounded-xl border border-line p-3 sm:col-span-2">
            <input type="checkbox" className="mt-1 size-5 accent-brand-600" checked={v.eInvoiceMandatory} onChange={(e) => set("eInvoiceMandatory", e.target.checked)} />
            <span className="text-sm"><b>My business must generate e-invoices (IRN)</b><br /><span className="text-muted">If yes, Compte will not issue tax invoices for you yet — e-invoicing isn't supported in this version.</span></span>
          </label>
          {v.eInvoiceMandatory && <Alert tone="warn" className="sm:col-span-2">Invoice issuance will be blocked. You can still use bookkeeping and nil-return guidance.</Alert>}
        </div>
      ),
    },
    {
      title: "Address & contact",
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address" htmlFor="addr"><Input id="addr" value={v.addressLine} onChange={(e) => set("addressLine", e.target.value)} required /></Field>
          <Field label="City" htmlFor="city"><Input id="city" value={v.city} onChange={(e) => set("city", e.target.value)} required /></Field>
          <Field label="PIN code" htmlFor="pin"><Input id="pin" inputMode="numeric" maxLength={6} value={v.pincode} onChange={(e) => set("pincode", e.target.value)} required /></Field>
          <Field label="State" htmlFor="state" hint="Must match the first two digits of your GSTIN">
            <Select id="state" value={v.stateCode} onChange={(e) => set("stateCode", e.target.value)}>{SELECTABLE_STATES.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}</Select>
          </Field>
          <Field label="Contact person" htmlFor="cp"><Input id="cp" value={v.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} required /></Field>
          <Field label="Email" htmlFor="em"><Input id="em" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} required /></Field>
          <Field label="Mobile number" htmlFor="ph"><Input id="ph" inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98XXXXXXXX" required /></Field>
          <Field label="Is this the authorised signatory's mobile registered on the GST portal?" htmlFor="phreg" hint="Your declaration. Compte cannot check this. Nil returns by SMS must be sent from the registered number.">
            <Select id="phreg" value={v.phoneIsGstnRegistered} onChange={(e) => set("phoneIsGstnRegistered", e.target.value as V["phoneIsGstnRegistered"])}>
              <option value="DECLARED_YES">Yes, it is registered on the GST portal</option><option value="DECLARED_NO">No</option><option value="UNKNOWN">Not sure</option>
            </Select>
          </Field>
        </div>
      ),
    },
    {
      title: "Invoices & language",
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice prefix" htmlFor="pre" hint={<>Next invoice: <span className="font-mono">{preview}</span> (max 16 characters, resets each financial year)</>}>
            <Input id="pre" className="font-mono uppercase" maxLength={5} value={v.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} required />
          </Field>
          <Field label="Preferred language" htmlFor="lang"><Select id="lang" value={v.preferredLanguage} onChange={(e) => set("preferredLanguage", e.target.value as V["preferredLanguage"])}><option value="en">English</option><option value="hi">हिंदी (Hindi)</option><option value="mr">मराठी (Marathi)</option></Select></Field>
          <Field label="Authorised signatory name" htmlFor="sig"><Input id="sig" value={v.signatoryName} onChange={(e) => set("signatoryName", e.target.value)} required /></Field>
          <Field label="Designation" htmlFor="des"><Input id="des" value={v.signatoryDesignation} onChange={(e) => set("signatoryDesignation", e.target.value)} required /></Field>
          <Alert tone="info" className="sm:col-span-2" title="What onboarding does not do">Setting up Compte does not authorise anyone to file returns for you. Government filings are always sent by you, from your registered mobile.</Alert>
        </div>
      ),
    },
  ];

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      if (mode === "onboarding") { await api("/api/onboarding", { body: v }); window.location.href = "/"; return; }
      await api("/api/business", { method: "PUT", body: v });
      setSaved(true);
      router.refresh();
    } catch (e) { setErr(errorText(e)); }
    setBusy(false);
  };

  if (mode === "settings") {
    return (
      <div className="space-y-4">
        {sections.map((s) => <Card key={s.title}><CardTitle className="mb-4">{s.title}</CardTitle>{s.body}</Card>)}
        {err && <Alert tone="danger">{err}</Alert>}
        {saved && <Alert tone="brand">Saved.</Alert>}
        <Button size="lg" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save business details"}</Button>
      </div>
    );
  }
  return (
    <Card className="p-5 sm:p-6">
      <ol className="mb-5 flex gap-2" aria-label="Progress">{sections.map((s, i) => <li key={s.title} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand-600" : "bg-line"}`}><span className="sr-only">{s.title}</span></li>)}</ol>
      <CardTitle className="mb-4 text-lg">{step + 1}. {sections[step].title}</CardTitle>
      {sections[step].body}
      {err && <Alert tone="danger" className="mt-4">{err}</Alert>}
      {step === 0 && g && !g.valid && <Alert tone="warn" className="mt-4"><ShieldAlert className="mr-1 inline size-4" />Fix the GSTIN before continuing.</Alert>}
      <div className="mt-6 flex justify-between gap-3">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
        {step < sections.length - 1
          ? <Button onClick={() => setStep((s) => s + 1)} disabled={step === 0 && (!g?.valid || !v.legalName)}>Continue</Button>
          : <Button onClick={submit} disabled={busy}>{busy ? "Setting up…" : "Finish setup"}</Button>}
      </div>
    </Card>
  );
}

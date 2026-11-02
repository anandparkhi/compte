import Link from "next/link";
import { Package, Users, FileInput } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { getBusiness } from "@/server/services/business";
import { integrationStatus, env } from "@/server/env";
import { prisma } from "@/server/db";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { BusinessForm } from "@/components/forms/business-form";
import { brand } from "@/lib/config/brand";

export const dynamic = "force-dynamic";
const INTEGRATIONS: Record<string, { name: string; what: string; env: string }> = {
  claude: { name: "Claude (Anthropic)", what: "Structured extraction from speech/text. Falls back to offline rules.", env: "ANTHROPIC_API_KEY" },
  speech: { name: "Sarvam AI speech-to-text", what: "Voice notes in Hindi, Marathi, English.", env: "SARVAM_API_KEY" },
  email: { name: "Resend email", what: "Sending invoice PDFs to customers.", env: "RESEND_API_KEY + EMAIL_FROM" },
  smsWebhook: { name: "Inbound SMS webhook", what: "Merchant → Compte SMS from a real provider (simulator works without it).", env: "SMS_WEBHOOK_SECRET" },
  gstnPortalVerification: { name: "GSTN / GSP portal verification", what: "Verifying filing status and GSTIN registration. No authorised integration yet.", env: "—" },
};

export default async function SettingsPage() {
  const ctx = await requirePageContext();
  const b = await getBusiness(ctx);
  const seq = await prisma.invoiceNumberSequence.findMany({ where: { businessId: ctx.businessId }, orderBy: { financialYear: "desc" } });
  const st = integrationStatus();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Settings" subtitle={`${brand.name} · ${env.demoMode ? "Demo mode" : "Live mode"}`} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/customers"><Card className="flex items-center gap-3 hover:bg-canvas"><Users className="size-6 text-brand-600" /><div><p className="font-semibold">Customers</p><p className="text-xs text-muted">Names, GSTINs, delivery states</p></div></Card></Link>
        <Link href="/products"><Card className="flex items-center gap-3 hover:bg-canvas"><Package className="size-6 text-brand-600" /><div><p className="font-semibold">Products & tax settings</p><p className="text-xs text-muted">HSN/SAC, GST rates, units</p></div></Card></Link>
        <Link href="/gst-import"><Card className="flex items-center gap-3 hover:bg-canvas"><FileInput className="size-6 text-brand-600" /><div><p className="font-semibold">Import GST returns</p><p className="text-xs text-muted">Historical invoices, customer GSTINs and HSN data</p></div></Card></Link>
      </div>
      <Card>
        <CardTitle className="mb-3">Integrations</CardTitle>
        <ul className="divide-y divide-line">
          {Object.entries(INTEGRATIONS).map(([k, i]) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div><p className="text-sm font-semibold">{i.name}</p><p className="text-xs text-muted">{i.what} <span className="font-mono">{i.env}</span></p></div>
              <Badge tone={st[k] === "LIVE_CREDENTIALS_PRESENT" ? "brand" : "warn"}>{st[k] === "LIVE_CREDENTIALS_PRESENT" ? "Credentials present (not tested here)" : "Not configured"}</Badge>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardTitle className="mb-2">Invoice series</CardTitle>
        <ul className="text-sm">{seq.map((s) => <li key={s.id}>FY {s.financialYear}: prefix <span className="font-mono">{s.prefix}</span>, next serial {s.nextNumber}</li>)}</ul>
        <p className="mt-2 text-xs text-muted">Numbers are consecutive, unique per financial year and at most 16 characters (CGST Rule 46(b)). Changing the prefix applies from the next financial year.</p>
      </Card>
      <Card>
        <CardTitle className="mb-2">Security</CardTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>GSTIN status: <b className="text-ink">{b.gstinVerificationStatus === "LIVE_VERIFIED" ? "Live verified" : "Format valid — not live-verified"}</b></li>
          <li>Compte never stores GST portal passwords or GSTN SMS verification codes.</li>
          <li>Issued invoices are locked at application and database level; every change is audit-logged.</li>
          <li>Voice recordings are transcribed in memory and not stored.</li>
        </ul>
      </Card>
      <BusinessForm mode="settings" initial={{ ...b, tradeName: b.tradeName ?? "", registrationType: b.registrationType as "REGULAR", filingFrequency: b.filingFrequency as "MONTHLY", preferredLanguage: b.preferredLanguage as "en", phoneIsGstnRegistered: b.phoneIsGstnRegistered as "UNKNOWN" }} />
    </div>
  );
}

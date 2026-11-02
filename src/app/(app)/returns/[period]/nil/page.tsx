import { notFound } from "next/navigation";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { localEvidence, filingsForPeriod } from "@/server/services/nil-filing";
import { today } from "@/server/services/invoices";
import { getT } from "@/lib/i18n/server";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { FilingStatusBadge } from "@/components/filing-status-badge";
import { StartNilButton } from "@/components/nil/start-button";
import { isPeriodEnded, parsePeriodKey, type FilingFrequency } from "@/lib/domain/periods";
import { maskGstin } from "@/lib/domain/gstin";
import type { FilingStatus } from "@/lib/domain/filing-state";

export const dynamic = "force-dynamic";
export default async function NilOverviewPage({ params }: { params: Promise<{ period: string }> }) {
  const ctx = await requirePageContext();
  const b = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const { t } = await getT(b.preferredLanguage);
  let period;
  try { period = parsePeriodKey((await params).period, b.filingFrequency as FilingFrequency); } catch { notFound(); }
  const ended = isPeriodEnded(period, today());
  const filings = await filingsForPeriod(ctx.businessId, period.key);
  const [l1, l3] = await Promise.all([localEvidence(ctx.businessId, "GSTR1", period, false), localEvidence(ctx.businessId, "GSTR3B", period, false)]);
  const label = (s?: string) => t(`fs_${s ?? "NOT_STARTED"}` as Parameters<typeof t>[0]);

  const card = (rt: "GSTR1" | "GSTR3B") => {
    const real = filings.find((f) => f.returnType === rt && !f.isDemo);
    const demo = filings.find((f) => f.returnType === rt && f.isDemo);
    const l = rt === "GSTR1" ? l1 : l3;
    const shown = real ?? (b.isDemo ? demo : undefined);
    return (
      <Card key={rt} className="flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xl font-bold">{rt === "GSTR1" ? "GSTR-1" : "GSTR-3B"}</h2>
          <FilingStatusBadge status={(shown?.status ?? (ended ? "ELIGIBILITY_REVIEW" : "NOT_STARTED")) as FilingStatus} label={shown ? label(shown.status) : ended ? label("ELIGIBILITY_REVIEW") : "Period not ended"} demo={shown?.isDemo} />
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2"><dt className="text-muted">Recorded outward supplies</dt><dd className="font-semibold">{l.issuedInvoiceCount ? `${l.issuedInvoiceCount} invoice(s)` : "None"}</dd></div>
          {rt === "GSTR3B" && <div className="flex justify-between gap-2"><dt className="text-muted">Recorded purchases</dt><dd className="font-semibold">{l.inwardSupplyCount ? `${l.inwardSupplyCount} record(s)` : "None"}</dd></div>}
          <div className="flex justify-between gap-2"><dt className="text-muted">{rt === "GSTR1" ? "External activity" : "Inward supplies / GSTR-2B"}</dt><dd className="font-semibold">{shown?.declarationAt ? "Declared by you" : "Not yet confirmed"}</dd></div>
        </dl>
        {(l.issuedInvoiceCount > 0 || (rt === "GSTR3B" && l.inwardSupplyCount > 0)) && <Alert tone="danger" className="mt-3">Compte&apos;s books show activity in this period, so a nil {rt === "GSTR1" ? "GSTR-1" : "GSTR-3B"} is not possible. Use normal return preparation or your accountant.</Alert>}
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {ended ? <>
            <StartNilButton returnType={rt} periodKey={period.key} demo={false} label={real ? "Continue" : t("nil_review")} variant={b.isDemo ? "outline" : "primary"} />
            {env.demoMode && <StartNilButton returnType={rt} periodKey={period.key} demo label={demo ? "Continue demo simulation" : "Run demo simulation"} variant={b.isDemo ? "primary" : "outline"} />}
          </> : <Badge>Opens on {period.endExclusive}</Badge>}
        </div>
      </Card>
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title={`${t("nil_title")} — ${period.label}`} subtitle={`${b.legalName} · GSTIN ${maskGstin(b.gstin)} · ${b.filingFrequency === "MONTHLY" ? "Monthly" : "Quarterly"} filer`} />
      <Alert tone="info" title="How this works">Each return is checked separately — no sales does not automatically mean a nil GSTR-3B. If eligible, Compte shows the exact SMS that <b>you</b> send to 14409 from your GST-registered mobile. Compte never sends it, never sees your verification code, and only records the ARN you receive.</Alert>
      {b.isDemo && <Alert tone="demo" title="Fictional business">This GSTIN is fictional, so a real SMS would fail. Use “Run demo simulation” — every step is labelled DEMO — NOT GOVERNMENT FILED.</Alert>}
      <div className="grid gap-4 md:grid-cols-2">{card("GSTR1")}{card("GSTR3B")}</div>
    </div>
  );
}

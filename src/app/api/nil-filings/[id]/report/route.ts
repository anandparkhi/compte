import { errorResponse } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { getFilingView } from "@/server/services/nil-filing";
import { renderFilingReportPdf } from "@/server/services/pdf";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const v = await getFilingView(await requireApiContext(), (await params).id);
    const pdf = await renderFilingReportPdf({
      filing: v.filing, periodLabel: v.period.label, business: v.business,
      checks: (v.latestAssessment?.checks ?? []) as { label: string; source: string; result: string; detail?: string }[],
      evidence: v.evidence,
    });
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="compte-filing-report-${v.filing.returnType}-${v.filing.periodKey}${v.filing.isDemo ? "-DEMO" : ""}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

import { AppError, errorResponse } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { getInvoiceForDocument } from "@/server/services/invoices";
import { renderInvoicePdf } from "@/server/services/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { invoice, snapshot } = await getInvoiceForDocument(await requireApiContext(), (await params).id, true);
    const pdf = await renderInvoicePdf(snapshot, invoice.status === "CANCELLED");
    const inline = new URL(req.url).searchParams.get("inline") === "1";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${snapshot.invoiceNumber.replace(/\//g, "-")}.pdf"`,
        "Cache-Control": "private, no-store",
        "Content-Length": String(pdf.length),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return errorResponse(e);
    console.error("[compte:pdf] Invoice PDF endpoint error:", e);
    return errorResponse(new AppError(503, "PDF_UNAVAILABLE", "The invoice PDF could not be generated on the server. Check Vercel function logs for [compte:pdf] and contact support."));
  }
}

import { errorResponse } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { getInvoiceForDocument } from "@/server/services/invoices";
import { renderInvoicePdf } from "@/server/services/pdf";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { snapshot } = await getInvoiceForDocument(await requireApiContext(), (await params).id);
    const pdf = await renderInvoicePdf(snapshot);
    const inline = new URL(req.url).searchParams.get("inline") === "1";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${snapshot.invoiceNumber.replace(/\//g, "-")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

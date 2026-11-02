import { handle } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { issueInvoice } from "@/server/services/invoices";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { invoice, replayed } = await issueInvoice(await requireApiContext(), (await params).id, await req.json());
    return { id: invoice.id, invoiceNumber: invoice.invoiceNumber, grandTotal: invoice.grandTotal, replayed };
  });
}

import { errorResponse } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { exportGstr1InternalDraft } from "@/server/services/returns";

export async function GET(_: Request, { params }: { params: Promise<{ period: string }> }) {
  try {
    const { filename, json } = await exportGstr1InternalDraft(await requireApiContext(), (await params).period);
    return new Response(JSON.stringify(json, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

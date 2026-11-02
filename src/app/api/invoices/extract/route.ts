import { handle } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { createDraftFromText } from "@/server/services/invoices";
import { rateLimit } from "@/server/rate-limit";
import { ExtractInput } from "@/lib/schemas";

export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireApiContext();
    rateLimit(`extract:${ctx.userId}`, 60, 60 * 60 * 1000);
    const input = ExtractInput.parse(await req.json());
    const inv = await createDraftFromText(ctx, { text: input.text, language: input.language, source: input.source });
    return { id: inv.id };
  }, 201);
}

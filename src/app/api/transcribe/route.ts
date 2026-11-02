import { AppError, handle } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";
import { transcribe } from "@/server/services/stt";

export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireApiContext();
    rateLimit(`stt:${ctx.userId}`, 60, 60 * 60 * 1000);
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) throw new AppError(422, "NO_AUDIO", "No audio received");
    // audio is held in memory only for the provider call and never persisted
    return transcribe(audio, String(form.get("language") ?? "auto"));
  });
}

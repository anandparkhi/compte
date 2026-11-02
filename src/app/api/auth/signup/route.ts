import { handle } from "@/server/errors";
import { signup } from "@/server/services/auth";
import { createSession } from "@/server/auth/session";
import { clientKey, rateLimit } from "@/server/rate-limit";

export async function POST(req: Request) {
  return handle(async () => {
    rateLimit(`signup:${clientKey(req)}`, 10, 60 * 60 * 1000);
    const user = await signup(await req.json());
    await createSession(user.id);
    return { ok: true, next: "/onboarding" };
  }, 201);
}

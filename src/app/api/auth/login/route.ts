import { handle } from "@/server/errors";
import { login } from "@/server/services/auth";
import { createSession } from "@/server/auth/session";
import { clientKey, rateLimit } from "@/server/rate-limit";

export async function POST(req: Request) {
  return handle(async () => {
    rateLimit(`login:${clientKey(req)}`, 20, 15 * 60 * 1000);
    const user = await login(await req.json());
    await createSession(user.id);
    return { ok: true, next: "/" };
  });
}

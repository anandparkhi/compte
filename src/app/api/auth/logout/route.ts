import { handle } from "@/server/errors";
import { destroySession } from "@/server/auth/session";

export async function POST() {
  return handle(async () => {
    await destroySession();
    return { ok: true };
  });
}

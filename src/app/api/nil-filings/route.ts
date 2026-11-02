import { handle } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { getOrCreateFiling } from "@/server/services/nil-filing";

export async function POST(req: Request) {
  return handle(async () => {
    const f = await getOrCreateFiling(await requireApiContext(), await req.json());
    return { id: f.id, status: f.status };
  });
}

import { AppError, handle } from "@/server/errors";
import { getSessionUser, setActiveBusiness } from "@/server/auth/session";
import { createBusinessForUser } from "@/server/services/business";

export async function POST(req: Request) {
  return handle(async () => {
    const s = await getSessionUser();
    if (!s) throw new AppError(401, "UNAUTHENTICATED", "Please log in");
    const b = await createBusinessForUser(s.user.id, await req.json());
    await setActiveBusiness(b.id);
    return { ok: true, businessId: b.id };
  }, 201);
}

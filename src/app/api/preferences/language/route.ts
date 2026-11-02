import { cookies } from "next/headers";
import { z } from "zod";
import { handle } from "@/server/errors";
import { getContext } from "@/server/auth/session";
import { setPreferredLanguage } from "@/server/services/business";

export async function POST(req: Request) {
  return handle(async () => {
    const { lang } = z.object({ lang: z.enum(["en", "hi", "mr"]) }).parse(await req.json());
    (await cookies()).set("compte_lang", lang, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
    const ctx = await getContext();
    if (ctx && ctx.role !== "VIEWER") await setPreferredLanguage(ctx, lang);
    return { ok: true };
  });
}

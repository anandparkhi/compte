import { z } from "zod";
import { handle } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { handleInboundSms } from "@/server/services/sms-inbound";

/** Authenticated in-app simulator for merchant→Compte SMS. Not connected to any telecom network. */
export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireApiContext();
    rateLimit(`smssim:${ctx.userId}`, 60, 60 * 60 * 1000);
    const { body, messageId } = z.object({ body: z.string().trim().min(1).max(500), messageId: z.string().min(8).max(80) }).parse(await req.json());
    const b = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
    return handleInboundSms({ channel: "SMS_SIMULATOR", providerMessageId: messageId, from: b.phone, body }, ctx);
  });
}

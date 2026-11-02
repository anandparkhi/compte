import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError, handle } from "@/server/errors";
import { env } from "@/server/env";
import { clientKey, rateLimit } from "@/server/rate-limit";
import { handleInboundSms } from "@/server/services/sms-inbound";

/**
 * Provider webhook for merchant→Compte SMS (P2: wire a real SMS provider here).
 * Requires X-Compte-Signature: hex HMAC-SHA256(SMS_WEBHOOK_SECRET, raw body).
 * This endpoint must NEVER be used as a relay for GSTN 14409 messages.
 */
export async function POST(req: Request) {
  return handle(async () => {
    rateLimit(`smshook:${clientKey(req)}`, 120, 60 * 1000);
    if (!env.smsWebhookSecret) throw new AppError(503, "NOT_CONFIGURED", "SMS webhook is not configured");
    const raw = await req.text();
    const sig = req.headers.get("x-compte-signature") ?? "";
    const expected = createHmac("sha256", env.smsWebhookSecret).update(raw).digest("hex");
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new AppError(401, "BAD_SIGNATURE", "Invalid signature");
    const msg = z.object({ messageId: z.string().min(1).max(120), from: z.string().min(5).max(20), body: z.string().min(1).max(500) }).parse(JSON.parse(raw));
    return handleInboundSms({ channel: "SMS_WEBHOOK", providerMessageId: msg.messageId, from: msg.from, body: msg.body });
  });
}

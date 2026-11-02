import "server-only";
import type { Db, Tx } from "./db";
import { prisma } from "./db";

const SECRET_KEYS = /pass|secret|token|key|code|otp/i;

function scrub(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) out[k] = SECRET_KEYS.test(k) && k !== "invoiceNumber" ? "[redacted]" : v;
  return out;
}

export async function audit(
  entry: { businessId?: string | null; userId?: string | null; action: string; entityType: string; entityId?: string | null; metadata?: Record<string, unknown> },
  db: Db | Tx = prisma,
) {
  await db.auditLog.create({
    data: {
      businessId: entry.businessId ?? null,
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: JSON.stringify(scrub(entry.metadata ?? {})),
    },
  });
}

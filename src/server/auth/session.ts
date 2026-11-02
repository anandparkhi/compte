import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "../db";
import { AppError } from "../errors";
import { env } from "../env";

export const SESSION_COOKIE = "compte_session";
const SESSION_DAYS = 14;

import type { Ctx, Role } from "./ctx";
export type { Ctx, Role } from "./ctx";
export { assertCanWrite } from "./ctx";

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function assertDemoAllowed() {
  if (env.isProduction && env.demoMode && !env.allowDemoInProduction) {
    throw new AppError(503, "INSECURE_DEMO_CONFIG", "DEMO_MODE is enabled in production. Disable DEMO_MODE (or explicitly set ALLOW_DEMO_IN_PRODUCTION=true for a demo deployment).");
  }
}

export async function createSession(userId: string, activeBusinessId?: string | null) {
  assertDemoAllowed();
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), activeBusinessId: activeBusinessId ?? null, expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env.isProduction, path: "/", maxAge: SESSION_DAYS * 86400 });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

async function loadSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { memberships: { orderBy: { createdAt: "asc" } } } } } });
  if (!session || session.expiresAt < new Date()) return null;
  return session;
}

export async function getSessionUser() {
  const s = await loadSession();
  return s ? { session: s, user: s.user } : null;
}

/** Resolve user + active business. Membership is re-checked on every request (tenant isolation). */
export async function getContext(): Promise<Ctx | null> {
  const s = await loadSession();
  if (!s) return null;
  const memberships = s.user.memberships;
  const active = memberships.find((m) => m.businessId === s.activeBusinessId) ?? memberships[0];
  if (!active) return null;
  return { userId: s.user.id, userName: s.user.name, businessId: active.businessId, role: active.role as Role };
}

export async function requireApiContext(): Promise<Ctx> {
  const s = await loadSession();
  if (!s) throw new AppError(401, "UNAUTHENTICATED", "Please log in");
  const ctx = await getContext();
  if (!ctx) throw new AppError(409, "NO_BUSINESS", "Set up your business first");
  return ctx;
}

export async function requirePageContext(): Promise<Ctx> {
  const s = await loadSession();
  if (!s) redirect("/login");
  const ctx = await getContext();
  if (!ctx) redirect("/onboarding");
  return ctx;
}


export async function setActiveBusiness(businessId: string) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.updateMany({ where: { tokenHash: hashToken(token) }, data: { activeBusinessId: businessId } });
}

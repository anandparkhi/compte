import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFound = (what = "Record") => new AppError(404, "NOT_FOUND", `${what} not found`);
export const forbidden = (msg = "You do not have access to this business") => new AppError(403, "FORBIDDEN", msg);

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }, { status: 400 });
  // Never leak internals or secrets
  console.error("[compte] unhandled error:", e instanceof Error ? e.message : "unknown");
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong" } }, { status: 500 });
}

export async function handle<T>(fn: () => Promise<T>, status = 200) {
  try {
    const data = await fn();
    return data instanceof Response ? data : NextResponse.json(data, { status });
  } catch (e) {
    return errorResponse(e);
  }
}

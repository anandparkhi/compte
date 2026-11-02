import { AppError } from "../errors";

export type Role = "OWNER" | "ACCOUNTANT" | "VIEWER";
export interface Ctx {
  userId: string;
  userName: string;
  businessId: string;
  role: Role;
}

export function assertCanWrite(ctx: Ctx) {
  if (ctx.role === "VIEWER") throw new AppError(403, "READ_ONLY", "Your role is read-only for this business");
}

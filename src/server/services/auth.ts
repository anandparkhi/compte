import "server-only";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import { hashPassword, verifyPassword } from "../auth/password";

export const SignupInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});
export const LoginInput = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

export async function signup(raw: unknown) {
  const input = SignupInput.parse(raw);
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw new AppError(409, "EMAIL_EXISTS", "An account with this email already exists");
  const user = await prisma.user.create({ data: { name: input.name, email: input.email, passwordHash: hashPassword(input.password) } });
  await audit({ userId: user.id, action: "USER_SIGNED_UP", entityType: "User", entityId: user.id });
  return user;
}

export async function login(raw: unknown) {
  const input = LoginInput.parse(raw);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // constant-ish work even when the user doesn't exist
  const ok = user ? verifyPassword(input.password, user.passwordHash) : (verifyPassword(input.password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"), false);
  if (!user || !ok) throw new AppError(401, "BAD_CREDENTIALS", "Email or password is incorrect");
  await audit({ userId: user.id, action: "USER_LOGGED_IN", entityType: "User", entityId: user.id });
  return user;
}

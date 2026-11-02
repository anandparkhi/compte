import { AuthForm } from "@/components/forms/auth-form";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";
export default function LoginPage() {
  return <AuthForm mode="login" demo={env.demoMode ? { email: "demo@compte.example", password: "compte-demo-2026" } : null} />;
}

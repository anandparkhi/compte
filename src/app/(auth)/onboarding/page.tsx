import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { BusinessForm } from "@/components/forms/business-form";
import { currentFinancialYear } from "@/lib/domain/periods";

export const dynamic = "force-dynamic";
export default async function OnboardingPage() {
  const s = await getSessionUser();
  if (!s) redirect("/login");
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Set up your business</h1>
      <p className="mb-5 text-sm text-muted">Three short steps. You can change most of this later in Settings.</p>
      <BusinessForm mode="onboarding" initial={{ financialYear: currentFinancialYear(), contactPerson: s.user.name, signatoryName: s.user.name, email: s.user.email }} />
    </div>
  );
}

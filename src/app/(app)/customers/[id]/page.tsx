import { notFound } from "next/navigation";
import { requirePageContext } from "@/server/auth/session";
import { getCustomer } from "@/server/services/catalog";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "@/components/forms/customer-form";

export const dynamic = "force-dynamic";
export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const c = await getCustomer(ctx, (await params).id).catch(() => null);
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-3xl"><PageHeader title={c.name} />
      <CustomerForm id={c.id} initial={{ name: c.name, aliases: c.aliases, registrationStatus: c.registrationStatus as "REGISTERED", gstin: c.gstin ?? "", stateCode: c.stateCode, billingAddress: c.billingAddress, shippingAddress: c.shippingAddress ?? "", shippingStateCode: c.shippingStateCode ?? "", phone: c.phone ?? "", email: c.email ?? "" }} />
    </div>
  );
}

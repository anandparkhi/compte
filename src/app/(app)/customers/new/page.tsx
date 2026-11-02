import { PageHeader } from "@/components/ui";
import { CustomerForm } from "@/components/forms/customer-form";
export default function NewCustomerPage() {
  return <div className="mx-auto max-w-3xl"><PageHeader title="New customer" /><CustomerForm /></div>;
}

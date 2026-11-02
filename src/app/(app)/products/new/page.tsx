import { PageHeader } from "@/components/ui";
import { ProductForm } from "@/components/forms/product-form";
export default function NewProductPage() {
  return <div className="mx-auto max-w-3xl"><PageHeader title="New product or service" /><ProductForm /></div>;
}

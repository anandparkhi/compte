import { LinkButton } from "@/components/ui";
export default function NotFound() {
  return <div className="mx-auto max-w-md py-16 text-center"><h1 className="text-2xl font-bold">Not found</h1><p className="mt-2 text-muted">This record doesn&apos;t exist or belongs to another business.</p><LinkButton href="/" className="mt-6">Go home</LinkButton></div>;
}

import { brand } from "@/lib/config/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-brand-600 text-xl font-bold text-white">{brand.name[0]}</span>
          <div>
            <p className="text-xl font-bold">{brand.name}</p>
            <p className="text-sm text-muted">{brand.tagline}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

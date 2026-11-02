"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Home, Landmark, Package, PlusCircle, Settings, Users } from "lucide-react";
import { cn } from "@/components/ui";

export type NavLabels = Record<"dashboard" | "create" | "invoices" | "customers" | "products" | "returns" | "settings", string>;

const items = (l: NavLabels) => [
  { href: "/", label: l.dashboard, icon: Home, mobile: true },
  { href: "/invoices", label: l.invoices, icon: FileText, mobile: true },
  { href: "/invoices/new", label: l.create, icon: PlusCircle, mobile: true, primary: true },
  { href: "/returns", label: l.returns, icon: Landmark, mobile: true },
  { href: "/customers", label: l.customers, icon: Users },
  { href: "/products", label: l.products, icon: Package },
  { href: "/settings", label: l.settings, icon: Settings, mobile: true },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/invoices") return path === "/invoices" || (path.startsWith("/invoices/") && !path.startsWith("/invoices/new"));
  return path === href || path.startsWith(href + "/");
}

export function SideNav({ labels }: { labels: NavLabels }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1.5" aria-label="Main">
      {items(labels).map((it) => (
        <Link key={it.href} href={it.href} className={cn("flex h-11 items-center gap-3 rounded-xl px-3.5 text-[14px] font-medium", isActive(path, it.href) ? "bg-[#e9f0e9] text-[#174d3e]" : "text-ink hover:bg-black/5", it.primary && "my-3 bg-[#193e32] text-white shadow-sm hover:bg-[#245c49]")}>
          <it.icon className="size-5" aria-hidden />
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ labels }: { labels: NavLabels }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Main">
      <ul className="grid grid-cols-5">
        {items(labels).filter((i) => i.mobile).map((it) => (
          <li key={it.href}>
            <Link href={it.href} className={cn("flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", isActive(path, it.href) ? "text-brand-700" : "text-muted")}>
              {it.primary ? <span className="-mt-6 grid size-12 place-items-center rounded-full bg-brand-600 text-white shadow-lg"><it.icon className="size-6" aria-hidden /></span> : <it.icon className="size-5" aria-hidden />}
              <span className="max-w-full truncate px-1">{it.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

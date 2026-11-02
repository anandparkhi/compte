import Link from "next/link";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { getT } from "@/lib/i18n/server";
import { brand } from "@/lib/config/brand";
import { maskGstin } from "@/lib/domain/gstin";
import { BottomNav, SideNav, type NavLabels } from "@/components/shell/nav";
import { LangSwitch } from "@/components/shell/lang-switch";
import { LogoutButton } from "@/components/shell/logout";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageContext();
  const business = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const { lang, t } = await getT(business.preferredLanguage);
  const labels: NavLabels = { dashboard: t("nav_dashboard"), create: t("nav_create"), createShort: t("nav_new"), invoices: t("nav_invoices"), customers: t("nav_customers"), products: t("nav_products"), returns: t("nav_returns"), settings: t("nav_settings") };
  const showDemo = env.demoMode || business.isDemo;
  return (
    <div className="min-h-dvh">
      {showDemo && <div className="bg-demo px-4 py-1.5 text-center text-xs font-semibold text-danger-600" role="note">{t("demo_banner")}</div>}
      <div className="mx-auto flex max-w-[1520px]">
        <aside className="sticky top-0 hidden h-dvh w-[252px] shrink-0 flex-col border-r border-[#e9ede7] bg-[#fbfcf9] px-5 py-7 lg:flex">
          <Link href="/" className="mb-11 flex items-center gap-3 px-2">
            <span className="grid size-9 place-items-center rounded-[13px] bg-[#193e32] text-lg font-semibold text-white">{brand.name[0]}</span>
            <span className="text-[22px] font-semibold tracking-[-0.06em]">{brand.name}</span>
          </Link>
          <SideNav labels={labels} />
          <p className="mt-auto px-2 text-xs text-muted">{brand.tagline}</p>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-[62px] sm:h-[76px] items-center justify-between gap-3 border-b border-[#e9ede7] bg-[#f9faf7]/95 px-4 backdrop-blur sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold leading-tight sm:text-sm">{business.tradeName || business.legalName}</p>
              <p className="truncate text-xs text-muted"><span className="sm:hidden">{business.filingFrequency === "MONTHLY" ? "Monthly" : "Quarterly"} GST</span><span className="hidden sm:inline">GSTIN {maskGstin(business.gstin)} · {business.filingFrequency === "MONTHLY" ? "Monthly" : "Quarterly"}</span></p>
            </div>
            <div className="flex items-center gap-1">
              <LangSwitch lang={lang} />
              <LogoutButton label={t("logout")} />
            </div>
          </header>
          <main className="px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-5 sm:px-8 sm:pt-8 lg:px-11 lg:pb-16 lg:pt-9">{children}</main>
        </div>
      </div>
      <BottomNav labels={labels} />
    </div>
  );
}

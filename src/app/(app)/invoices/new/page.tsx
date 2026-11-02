import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { getT } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui";
import { Composer } from "@/components/invoice/composer";

export const dynamic = "force-dynamic";
export default async function NewInvoicePage() {
  const ctx = await requirePageContext();
  const b = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const { lang, t } = await getT(b.preferredLanguage);
  const keys = ["create_hint", "create_mic_start", "create_mic_stop", "create_transcribing", "create_text_placeholder", "create_language", "create_extract", "create_sms_tab", "create_voice_tab", "create_transcript", "create_stt_not_configured"] as const;
  const labels = Object.fromEntries(keys.map((k) => [k, t(k)])) as Record<(typeof keys)[number], string>;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("create_title")} subtitle={t("create_hint")} />
      <Composer labels={labels} uiLang={lang} sttConfigured={!!env.sarvamApiKey} llmConfigured={!!env.anthropicApiKey} businessPhone={b.phone} />
    </div>
  );
}

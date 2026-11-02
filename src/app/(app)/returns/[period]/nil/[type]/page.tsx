import { notFound, redirect } from "next/navigation";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getFilingView } from "@/server/services/nil-filing";
import { getT } from "@/lib/i18n/server";
import { NilWizard } from "@/components/nil/wizard";
import { DECLARATION_TEXT, questionsFor } from "@/lib/domain/nil-eligibility";
import { GSTN } from "@/lib/config/brand";
import { maskGstin } from "@/lib/domain/gstin";
import type { MessageKey } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";
export default async function NilWizardPage({ params, searchParams }: { params: Promise<{ period: string; type: string }>; searchParams: Promise<{ demo?: string }> }) {
  const ctx = await requirePageContext();
  const { period, type } = await params;
  const demo = (await searchParams).demo === "1";
  const returnType = type === "gstr1" ? "GSTR1" : type === "gstr3b" ? "GSTR3B" : null;
  if (!returnType) notFound();
  const b = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const f = await prisma.nilReturnFiling.findFirst({ where: { businessId: ctx.businessId, returnType, periodKey: period, isDemo: demo } });
  if (!f) redirect(`/returns/${period}/nil`);
  const view = await getFilingView(ctx, f.id);
  const { lang, t } = await getT(b.preferredLanguage);
  const keys: MessageKey[] = ["nil_review", "nil_local_checks", "nil_questions", "nil_yes", "nil_no", "nil_unknown", "nil_declaration", "nil_save_assessment", "nil_irreversible", "nil_show_sms", "nil_step_send", "nil_to", "nil_copy", "nil_copied", "nil_open_sms", "nil_sent_initiation", "nil_step_confirm", "nil_confirm_explain", "nil_sent_confirmation", "nil_step_arn", "nil_arn_label", "nil_record_arn", "nil_rejected_btn", "nil_verify_portal", "nil_arn_unverified_note", "nil_feature_phone", "nil_report", "nil_ineligible", "nil_incomplete", "nil_manual", "nil_eligible",
    "fs_NOT_STARTED", "fs_ELIGIBILITY_REVIEW", "fs_INELIGIBLE", "fs_ELIGIBLE_SELF_DECLARED", "fs_READY_FOR_GOVERNMENT_SMS", "fs_INITIATION_SENT_USER_REPORTED", "fs_AWAITING_GOVERNMENT_CONFIRMATION", "fs_ARN_RECORDED_UNVERIFIED", "fs_FILED_VERIFIED", "fs_REJECTED", "fs_NEEDS_MANUAL_REVIEW"];
  const labels = Object.fromEntries(keys.map((k) => [k, t(k)])) as Record<MessageKey, string>;
  const questions = questionsFor(returnType, b.filingFrequency as "MONTHLY" | "QUARTERLY").map((q) => ({ id: q.id, text: q.text[lang], textEn: q.text.en, checkWhere: q.checkWhere, conservative: !!q.conservative }));
  return (
    <NilWizard
      labels={labels}
      initial={JSON.parse(JSON.stringify(view))}
      questions={questions}
      declaration={DECLARATION_TEXT[returnType][lang]}
      maskedGstin={maskGstin(view.filing.gstin)}
      maskedPhone={b.phone.replace(/^(\d{2})\d{5}(\d{3})$/, "$1•••••$2")}
      gstn={{ portalUrl: GSTN.portalUrl, faq: returnType === "GSTR1" ? GSTN.nilSmsFaqGstr1 : GSTN.nilSmsFaqGstr3b, troubleshooting: GSTN.smsTroubleshooting, validity: GSTN.verificationCodeValidityMinutes, resendWait: GSTN.resendWaitMinutes, maxWrong: GSTN.maxWrongCodesPerDay }}
    />
  );
}

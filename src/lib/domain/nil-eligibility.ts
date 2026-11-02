import { validateGstin } from "./gstin";
import { isPeriodEnded, type ReturnPeriod } from "./periods";
import type { NilReturnType } from "./gstn-sms";

/**
 * Nil-return eligibility engine (pure, deterministic).
 *
 * Sources (GSTN FAQs, tutorial.gst.gov.in, verified Nov 2026):
 *  GSTR-1 nil: no outward supplies, no amendments, no credit/debit notes, no advances;
 *    SMS route needs Normal/Casual/SEZ registration, monthly/quarterly frequency, a registered
 *    (unique) authorised-signatory mobile, and NO saved/submitted GSTR-1 data on the portal.
 *  GSTR-3B nil: no outward supplies, no reverse-charge liability, no ITC to claim/reverse,
 *    no liability for this or earlier periods incl. interest/late fee, all earlier GSTR-3B filed,
 *    no saved data in the online GSTR-3B.
 *  Conservative additions by Compte (flagged as such): nil-rated/exempt/non-GST supplies,
 *  IFF uploads in the quarter, GSTR-2B / auto-populated values.
 *
 * Rules:
 *  - Local ledger evidence (issued invoices, purchases) ALWAYS beats a user declaration.
 *  - Anything unknown => INCOMPLETE (blocked). Absence of data in Compte is never proof of nil.
 */

export type Tri = "YES" | "NO" | "UNKNOWN";
export type CheckSource = "COMPTE_LEDGER" | "USER_DECLARATION" | "SYSTEM_RULE" | "NOT_VERIFIABLE_BY_COMPTE";
export type CheckResult = "PASS" | "FAIL" | "UNKNOWN" | "REVIEW";
export type Outcome = "ELIGIBLE_SELF_DECLARED" | "INELIGIBLE" | "INCOMPLETE" | "NEEDS_MANUAL_REVIEW";
type L10n = { en: string; hi: string; mr: string };

export interface NilQuestion {
  id: string;
  returnTypes: NilReturnType[];
  /** answer that makes nil filing unavailable */
  disqualifyOn: "YES" | "NO";
  onDisqualify: "INELIGIBLE" | "NEEDS_MANUAL_REVIEW";
  /** where the user must look to answer */
  checkWhere: "YOUR_RECORDS" | "GST_PORTAL" | "YOUR_PHONE";
  quarterlyOnly?: boolean;
  conservative?: boolean;
  text: L10n;
}

export const NIL_QUESTIONS: NilQuestion[] = [
  {
    id: "outside_outward_supplies", returnTypes: ["GSTR1", "GSTR3B"], disqualifyOn: "YES", onDisqualify: "INELIGIBLE", checkWhere: "YOUR_RECORDS",
    text: {
      en: "Did you make ANY sale or supply in this period that is not recorded in Compte (other software, handwritten bills, cash sales, job work)?",
      hi: "क्या इस अवधि में आपने कोई ऐसी बिक्री या सप्लाई की जो Compte में दर्ज नहीं है (दूसरा सॉफ़्टवेयर, हाथ से लिखे बिल, नकद बिक्री, जॉब वर्क)?",
      mr: "या कालावधीत Compte मध्ये नोंद नसलेली कोणतीही विक्री किंवा पुरवठा केला का (दुसरे सॉफ्टवेअर, हाताने लिहिलेली बिले, रोख विक्री, जॉब वर्क)?",
    },
  },
  {
    id: "exempt_nil_nongst_supplies", returnTypes: ["GSTR1", "GSTR3B"], disqualifyOn: "YES", onDisqualify: "INELIGIBLE", checkWhere: "YOUR_RECORDS", conservative: true,
    text: {
      en: "Any nil-rated, exempt, zero-rated (export/SEZ) or non-GST supplies in this period?",
      hi: "क्या इस अवधि में कोई nil-rated, exempt, zero-rated (export/SEZ) या non-GST सप्लाई हुई?",
      mr: "या कालावधीत कोणताही nil-rated, exempt, zero-rated (export/SEZ) किंवा non-GST पुरवठा झाला का?",
    },
  },
  {
    id: "credit_debit_notes", returnTypes: ["GSTR1"], disqualifyOn: "YES", onDisqualify: "INELIGIBLE", checkWhere: "YOUR_RECORDS",
    text: {
      en: "Any credit notes or debit notes to declare or amend for this period?",
      hi: "क्या इस अवधि के लिए कोई credit note या debit note घोषित या संशोधित करना है?",
      mr: "या कालावधीसाठी कोणतीही credit note किंवा debit note जाहीर किंवा दुरुस्त करायची आहे का?",
    },
  },
  {
    id: "amendments", returnTypes: ["GSTR1"], disqualifyOn: "YES", onDisqualify: "INELIGIBLE", checkWhere: "YOUR_RECORDS",
    text: {
      en: "Do you need to amend any supply declared in an earlier return?",
      hi: "क्या पिछले किसी रिटर्न में घोषित सप्लाई में संशोधन करना है?",
      mr: "आधीच्या रिटर्नमध्ये जाहीर केलेल्या पुरवठ्यात दुरुस्ती करायची आहे का?",
    },
  },
  {
    id: "advances", returnTypes: ["GSTR1"], disqualifyOn: "YES", onDisqualify: "INELIGIBLE", checkWhere: "YOUR_RECORDS",
    text: {
      en: "Did you receive or adjust any advance payment for services in this period?",
      hi: "क्या इस अवधि में सेवाओं के लिए कोई advance मिला या adjust किया गया?",
      mr: "या कालावधीत सेवांसाठी कोणताही advance मिळाला किंवा adjust केला का?",
    },
  },
  {
    id: "iff_uploaded", returnTypes: ["GSTR1"], disqualifyOn: "YES", onDisqualify: "INELIGIBLE", checkWhere: "GST_PORTAL", quarterlyOnly: true, conservative: true,
    text: {
      en: "Did you upload any invoices through IFF in the first or second month of this quarter?",
      hi: "क्या इस तिमाही के पहले या दूसरे महीने में IFF के ज़रिए कोई invoice अपलोड किया?",
      mr: "या तिमाहीच्या पहिल्या किंवा दुसऱ्या महिन्यात IFF द्वारे कोणतेही invoice अपलोड केले का?",
    },
  },
  {
    id: "inward_reverse_charge", returnTypes: ["GSTR3B"], disqualifyOn: "YES", onDisqualify: "INELIGIBLE", checkWhere: "YOUR_RECORDS",
    text: {
      en: "Any purchases or services received on which YOU must pay GST under reverse charge?",
      hi: "क्या कोई खरीद या सेवा ली जिस पर reverse charge के तहत GST आपको भरना है?",
      mr: "अशी कोणतीही खरेदी किंवा सेवा घेतली का ज्यावर reverse charge अंतर्गत GST तुम्हाला भरायचा आहे?",
    },
  },
  {
    id: "itc_claim", returnTypes: ["GSTR3B"], disqualifyOn: "YES", onDisqualify: "INELIGIBLE", checkWhere: "YOUR_RECORDS",
    text: {
      en: "Do you want to claim any input tax credit (ITC) for this period?",
      hi: "क्या आप इस अवधि के लिए कोई input tax credit (ITC) लेना चाहते हैं?",
      mr: "तुम्हाला या कालावधीसाठी कोणतेही input tax credit (ITC) घ्यायचे आहे का?",
    },
  },
  {
    id: "itc_reversal", returnTypes: ["GSTR3B"], disqualifyOn: "YES", onDisqualify: "INELIGIBLE", checkWhere: "YOUR_RECORDS",
    text: {
      en: "Any ITC reversal or other ITC adjustment for this period?",
      hi: "क्या इस अवधि में कोई ITC reversal या दूसरा ITC adjustment है?",
      mr: "या कालावधीत कोणतेही ITC reversal किंवा इतर ITC adjustment आहे का?",
    },
  },
  {
    id: "gstr2b_entries", returnTypes: ["GSTR3B"], disqualifyOn: "YES", onDisqualify: "NEEDS_MANUAL_REVIEW", checkWhere: "GST_PORTAL", conservative: true,
    text: {
      en: "Does your GSTR-2B for this period show any purchase or ITC entries?",
      hi: "क्या इस अवधि के आपके GSTR-2B में कोई खरीद या ITC entry दिख रही है?",
      mr: "या कालावधीच्या तुमच्या GSTR-2B मध्ये कोणतीही खरेदी किंवा ITC entry दिसते का?",
    },
  },
  {
    id: "auto_populated_values", returnTypes: ["GSTR3B"], disqualifyOn: "YES", onDisqualify: "NEEDS_MANUAL_REVIEW", checkWhere: "GST_PORTAL", conservative: true,
    text: {
      en: "Does the portal show any auto-populated (non-zero) values in GSTR-3B for this period?",
      hi: "क्या पोर्टल पर इस अवधि के GSTR-3B में कोई auto-populated (शून्य से अलग) राशि दिख रही है?",
      mr: "पोर्टलवर या कालावधीच्या GSTR-3B मध्ये कोणतीही auto-populated (शून्य नसलेली) रक्कम दिसते का?",
    },
  },
  {
    id: "other_liability", returnTypes: ["GSTR3B"], disqualifyOn: "YES", onDisqualify: "INELIGIBLE", checkWhere: "YOUR_RECORDS",
    text: {
      en: "Do you have any other GST liability for this period?",
      hi: "क्या इस अवधि के लिए कोई और GST देनदारी है?",
      mr: "या कालावधीसाठी इतर कोणतीही GST देय रक्कम आहे का?",
    },
  },
  {
    id: "interest_late_fee", returnTypes: ["GSTR3B"], disqualifyOn: "YES", onDisqualify: "INELIGIBLE", checkWhere: "GST_PORTAL",
    text: {
      en: "Is any interest or late fee (including carried-forward late fee) payable?",
      hi: "क्या कोई ब्याज या लेट फीस (आगे ले जाई गई लेट फीस सहित) बकाया है?",
      mr: "कोणतेही व्याज किंवा लेट फी (पुढे नेलेल्या लेट फीसह) भरायची बाकी आहे का?",
    },
  },
  {
    id: "prior_period_liability", returnTypes: ["GSTR3B"], disqualifyOn: "YES", onDisqualify: "INELIGIBLE", checkWhere: "GST_PORTAL",
    text: {
      en: "Is any tax from an earlier period still unpaid?",
      hi: "क्या पिछली किसी अवधि का टैक्स अभी भी बकाया है?",
      mr: "आधीच्या कोणत्याही कालावधीचा कर अजून भरायचा बाकी आहे का?",
    },
  },
  {
    id: "previous_returns_filed", returnTypes: ["GSTR3B"], disqualifyOn: "NO", onDisqualify: "INELIGIBLE", checkWhere: "GST_PORTAL",
    text: {
      en: "Have ALL GSTR-3B returns for earlier periods been filed?",
      hi: "क्या पिछली सभी अवधियों के GSTR-3B फ़ाइल हो चुके हैं?",
      mr: "आधीच्या सर्व कालावधींचे GSTR-3B फाइल झाले आहेत का?",
    },
  },
  {
    id: "portal_saved_data", returnTypes: ["GSTR1", "GSTR3B"], disqualifyOn: "YES", onDisqualify: "INELIGIBLE", checkWhere: "GST_PORTAL",
    text: {
      en: "Is any data saved or submitted for this return and period on the GST portal?",
      hi: "क्या GST पोर्टल पर इस रिटर्न और अवधि का कोई डेटा save या submit किया हुआ है?",
      mr: "GST पोर्टलवर या रिटर्न आणि कालावधीचा कोणताही डेटा save किंवा submit केलेला आहे का?",
    },
  },
  {
    id: "already_filed", returnTypes: ["GSTR1", "GSTR3B"], disqualifyOn: "YES", onDisqualify: "INELIGIBLE", checkWhere: "GST_PORTAL",
    text: {
      en: "Has this return for this period already been filed?",
      hi: "क्या इस अवधि का यह रिटर्न पहले ही फ़ाइल हो चुका है?",
      mr: "या कालावधीचे हे रिटर्न आधीच फाइल झाले आहे का?",
    },
  },
  {
    id: "registered_mobile_access", returnTypes: ["GSTR1", "GSTR3B"], disqualifyOn: "NO", onDisqualify: "INELIGIBLE", checkWhere: "YOUR_PHONE",
    text: {
      en: "Do you have the authorised signatory's mobile phone that is registered on the GST portal (not shared with another signatory)?",
      hi: "क्या आपके पास अधिकृत हस्ताक्षरकर्ता का वह मोबाइल है जो GST पोर्टल पर रजिस्टर्ड है (किसी दूसरे हस्ताक्षरकर्ता के साथ साझा नहीं)?",
      mr: "GST पोर्टलवर नोंदणीकृत असलेला अधिकृत स्वाक्षरीकर्त्याचा मोबाइल (दुसऱ्या स्वाक्षरीकर्त्यासोबत शेअर नसलेला) तुमच्याकडे आहे का?",
    },
  },
  {
    id: "portal_reviewed", returnTypes: ["GSTR1", "GSTR3B"], disqualifyOn: "NO", onDisqualify: "INELIGIBLE", checkWhere: "GST_PORTAL",
    text: {
      en: "Have you checked the GST portal for this period yourself? (Compte cannot see portal data.)",
      hi: "क्या आपने इस अवधि के लिए GST पोर्टल खुद जाँच लिया है? (Compte पोर्टल का डेटा नहीं देख सकता।)",
      mr: "तुम्ही या कालावधीसाठी GST पोर्टल स्वतः तपासले आहे का? (Compte पोर्टलचा डेटा पाहू शकत नाही.)",
    },
  },
];

export const DECLARATION_TEXT: Record<NilReturnType, L10n> = {
  GSTR1: {
    en: "I confirm that there are no reportable outward-supply details or other entries for this period and that I have checked records outside Compte.",
    hi: "मैं पुष्टि करता/करती हूँ कि इस अवधि के लिए कोई रिपोर्ट करने योग्य outward supply या अन्य entry नहीं है और मैंने Compte के बाहर के रिकॉर्ड भी जाँच लिए हैं।",
    mr: "मी पुष्टी करतो/करते की या कालावधीसाठी कोणताही नोंदवण्यायोग्य outward supply तपशील किंवा इतर नोंद नाही आणि मी Compte बाहेरील नोंदीही तपासल्या आहेत.",
  },
  GSTR3B: {
    en: "I confirm that for this period there are no outward or reverse-charge supplies, no ITC to claim or reverse, and no tax, interest or late-fee liability for this or any earlier period, and that I have checked the GST portal and records outside Compte. I understand Compte cannot verify portal data.",
    hi: "मैं पुष्टि करता/करती हूँ कि इस अवधि में कोई outward या reverse-charge सप्लाई नहीं है, कोई ITC लेना या reverse करना नहीं है, और इस या किसी पिछली अवधि की कोई टैक्स, ब्याज या लेट-फीस देनदारी नहीं है, तथा मैंने GST पोर्टल और Compte के बाहर के रिकॉर्ड जाँच लिए हैं। मैं समझता/समझती हूँ कि Compte पोर्टल डेटा सत्यापित नहीं कर सकता।",
    mr: "मी पुष्टी करतो/करते की या कालावधीत कोणताही outward किंवा reverse-charge पुरवठा नाही, कोणतेही ITC घ्यायचे किंवा reverse करायचे नाही, आणि या किंवा आधीच्या कोणत्याही कालावधीची कर, व्याज किंवा लेट-फी देय रक्कम नाही, तसेच मी GST पोर्टल आणि Compte बाहेरील नोंदी तपासल्या आहेत. Compte पोर्टल डेटा पडताळू शकत नाही हे मला समजते.",
  },
};

export function questionsFor(returnType: NilReturnType, frequency: "MONTHLY" | "QUARTERLY"): NilQuestion[] {
  return NIL_QUESTIONS.filter((q) => q.returnTypes.includes(returnType) && (!q.quarterlyOnly || frequency === "QUARTERLY"));
}

export interface LocalEvidence {
  issuedInvoiceCount: number;
  historicalImportCount?: number;
  draftInvoiceCount: number;
  inwardSupplyCount: number;
  reverseChargeInwardCount: number;
  /** a non-demo filing for the same return/period already reached ARN/verified state */
  alreadyRecordedInCompte: boolean;
}

export interface EligibilityInput {
  returnType: NilReturnType;
  period: ReturnPeriod;
  today: string;
  business: { gstin: string; registrationType: string; filingFrequency: "MONTHLY" | "QUARTERLY" };
  local: LocalEvidence;
  answers: Record<string, Tri | undefined>;
  declarationAccepted: boolean;
}

export interface EligibilityCheck {
  id: string;
  label: string;
  source: CheckSource;
  result: CheckResult;
  detail?: string;
  conservative?: boolean;
}

export interface EligibilityResult {
  outcome: Outcome;
  checks: EligibilityCheck[];
  blockers: EligibilityCheck[];
  unknowns: EligibilityCheck[];
  reviews: EligibilityCheck[];
}

const SMS_ELIGIBLE_REG_TYPES = ["REGULAR", "CASUAL", "SEZ_UNIT", "SEZ_DEVELOPER"];

export function assessNilEligibility(input: EligibilityInput): EligibilityResult {
  const checks: EligibilityCheck[] = [];
  const { returnType, period, business, local } = input;

  // --- System rules ---
  checks.push({
    id: "gstin_valid", label: "GSTIN format and check digit", source: "SYSTEM_RULE",
    result: validateGstin(business.gstin).valid ? "PASS" : "FAIL",
    detail: "Structural check only — live registration status is not verified by Compte.",
  });
  const regOk = SMS_ELIGIBLE_REG_TYPES.includes(business.registrationType);
  checks.push({
    id: "taxpayer_type", label: "Taxpayer type allows GSTR-1/3B nil filing by SMS", source: "SYSTEM_RULE",
    result: regOk ? "PASS" : business.registrationType === "COMPOSITION" ? "FAIL" : "REVIEW",
    detail: regOk ? `Registered as ${business.registrationType}` : business.registrationType === "COMPOSITION" ? "Composition taxpayers file CMP-08 / GSTR-4, not GSTR-1/3B." : "Unsupported registration type in Compte.",
  });
  checks.push({
    id: "frequency_match", label: "Return period matches filing frequency", source: "SYSTEM_RULE",
    result: period.frequency === business.filingFrequency ? "PASS" : "FAIL",
    detail: `Business files ${business.filingFrequency.toLowerCase()}; period is ${period.frequency.toLowerCase()}.`,
  });
  checks.push({
    id: "period_ended", label: "Return period has ended", source: "SYSTEM_RULE",
    result: isPeriodEnded(period, input.today) ? "PASS" : "FAIL",
    detail: isPeriodEnded(period, input.today) ? `${period.label} ended.` : `Nil filing opens on ${period.endExclusive}.`,
  });

  // --- Local ledger evidence (cannot be overridden by a declaration) ---
  checks.push({
    id: "local_imported_outward_supplies", label: "Historical GST data imported for this period", source: "COMPTE_LEDGER",
    result: (local.historicalImportCount ?? 0) > 0 ? "FAIL" : "PASS",
    detail: (local.historicalImportCount ?? 0) > 0 ? "An imported GSTR-1 record indicates outward activity; review it before considering a nil return." : "No historical return data imported for this period (not proof of nil activity).",
  });

  checks.push({
    id: "local_issued_invoices", label: "Invoices issued in Compte for this period", source: "COMPTE_LEDGER",
    result: local.issuedInvoiceCount > 0 ? "FAIL" : "PASS",
    detail: local.issuedInvoiceCount > 0 ? `${local.issuedInvoiceCount} issued invoice(s) found — these are outward supplies, so the return is not nil.` : "No issued invoices recorded in Compte (this does not prove there were none elsewhere).",
  });
  checks.push({
    id: "local_draft_invoices", label: "Draft invoices dated in this period", source: "COMPTE_LEDGER",
    result: local.draftInvoiceCount > 0 ? "REVIEW" : "PASS",
    detail: local.draftInvoiceCount > 0 ? `${local.draftInvoiceCount} draft(s) dated in this period — issue or discard them first.` : "No drafts in this period.",
  });
  if (returnType === "GSTR3B") {
    checks.push({
      id: "local_inward_supplies", label: "Purchases recorded in Compte for this period", source: "COMPTE_LEDGER",
      result: local.inwardSupplyCount > 0 ? "FAIL" : "PASS",
      detail: local.inwardSupplyCount > 0 ? `${local.inwardSupplyCount} purchase record(s) found — GSTR-3B is not nil.` : "No purchases recorded in Compte (this does not prove there were none).",
    });
    checks.push({
      id: "local_reverse_charge", label: "Reverse-charge purchases recorded in Compte", source: "COMPTE_LEDGER",
      result: local.reverseChargeInwardCount > 0 ? "FAIL" : "PASS",
      detail: local.reverseChargeInwardCount > 0 ? "Reverse-charge liability exists." : undefined,
    });
  }
  checks.push({
    id: "local_already_recorded", label: "Not already recorded as filed in Compte", source: "COMPTE_LEDGER",
    result: local.alreadyRecordedInCompte ? "FAIL" : "PASS",
    detail: local.alreadyRecordedInCompte ? "An ARN is already recorded for this return and period." : undefined,
  });

  // --- User declarations ---
  for (const q of questionsFor(returnType, business.filingFrequency)) {
    const a = input.answers[q.id];
    let result: CheckResult;
    if (!a || a === "UNKNOWN") result = "UNKNOWN";
    else if (a === q.disqualifyOn) result = q.onDisqualify === "INELIGIBLE" ? "FAIL" : "REVIEW";
    else result = "PASS";
    checks.push({
      id: `q_${q.id}`, label: q.text.en,
      source: q.checkWhere === "GST_PORTAL" ? "NOT_VERIFIABLE_BY_COMPTE" : "USER_DECLARATION",
      result, conservative: q.conservative,
      detail: result === "UNKNOWN" ? "Not answered — nil filing stays blocked until you check." : `Your answer: ${a}`,
    });
  }
  checks.push({
    id: "declaration", label: "Declaration accepted", source: "USER_DECLARATION",
    result: input.declarationAccepted ? "PASS" : "UNKNOWN",
  });

  const blockers = checks.filter((c) => c.result === "FAIL");
  const reviews = checks.filter((c) => c.result === "REVIEW");
  const unknowns = checks.filter((c) => c.result === "UNKNOWN");
  const outcome: Outcome = blockers.length ? "INELIGIBLE" : reviews.length ? "NEEDS_MANUAL_REVIEW" : unknowns.length ? "INCOMPLETE" : "ELIGIBLE_SELF_DECLARED";
  return { outcome, checks, blockers, unknowns, reviews };
}

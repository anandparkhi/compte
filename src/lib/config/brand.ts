/**
 * All product branding lives here. Renaming the product = editing this file
 * (plus NEXT_PUBLIC_BRAND_NAME if you want to override at deploy time).
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Compte",
  tagline: "Every transaction, accounted for.",
  shortDescription: "Conversational bookkeeping and GST compliance for Indian small businesses.",
  supportEmail: "support@example.invalid",
  // Colours are expressed as Tailwind theme tokens in globals.css (--color-brand-*)
} as const;

export const GSTN = {
  smsShortCode: "14409",
  portalUrl: "https://www.gst.gov.in/",
  trackReturnUrl: "https://services.gst.gov.in/services/login",
  nilSmsFaqGstr1: "https://tutorial.gst.gov.in/userguide/returns/faq_nilreturngstr1.htm",
  nilSmsFaqGstr3b: "https://tutorial.gst.gov.in/userguide/returns/faq_nilreturngstr3b.htm",
  smsTroubleshooting: "https://tutorial.gst.gov.in/userguide/returns/Troubleshooting_Errors.htm",
  verificationCodeValidityMinutes: 30,
  resendWaitMinutes: 5,
  maxWrongCodesPerDay: 3,
} as const;

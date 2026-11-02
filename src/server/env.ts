import "server-only";

/** Server-side configuration. Secrets never leave the server. */
export const env = {
  get databaseUrl() { return process.env.DATABASE_URL ?? "file:./prisma/dev.db"; },
  get demoMode() { return (process.env.DEMO_MODE ?? "true").toLowerCase() === "true"; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get allowDemoInProduction() { return process.env.ALLOW_DEMO_IN_PRODUCTION === "true"; },
  get appBaseUrl() { return process.env.APP_BASE_URL ?? "http://localhost:3000"; },
  get anthropicApiKey() { return process.env.ANTHROPIC_API_KEY || null; },
  get anthropicModel() { return process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"; },
  get sarvamApiKey() { return process.env.SARVAM_API_KEY || null; },
  get sarvamModel() { return process.env.SARVAM_STT_MODEL || "saaras:v3"; },
  get resendApiKey() { return process.env.RESEND_API_KEY || null; },
  get emailFrom() { return process.env.EMAIL_FROM || null; },
  get smsWebhookSecret() { return process.env.SMS_WEBHOOK_SECRET || null; },
};

export type IntegrationState = "LIVE_CREDENTIALS_PRESENT" | "NOT_CONFIGURED";

export function integrationStatus() {
  return {
    claude: env.anthropicApiKey ? "LIVE_CREDENTIALS_PRESENT" : "NOT_CONFIGURED",
    speech: env.sarvamApiKey ? "LIVE_CREDENTIALS_PRESENT" : "NOT_CONFIGURED",
    email: env.resendApiKey && env.emailFrom ? "LIVE_CREDENTIALS_PRESENT" : "NOT_CONFIGURED",
    smsWebhook: env.smsWebhookSecret ? "LIVE_CREDENTIALS_PRESENT" : "NOT_CONFIGURED",
    gstnPortalVerification: "NOT_CONFIGURED",
  } as Record<string, IntegrationState>;
}

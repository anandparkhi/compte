import "server-only";
import { z } from "zod";
import { prisma } from "../db";
import { AppError, notFound } from "../errors";
import { audit } from "../audit";
import { env } from "../env";
import { assertCanWrite, type Ctx } from "../auth/ctx";
import { today } from "./invoices";
import { readHistorical, inReturnPeriod } from "./historical-records";
import { assessNilEligibility, DECLARATION_TEXT, type LocalEvidence, type Tri } from "@/lib/domain/nil-eligibility";
import { assertTransition, COMMITTED_STATUSES, FilingTransitionError, isFiledLike, type FilingStatus } from "@/lib/domain/filing-state";
import { buildNilInitiationSms, confirmationTemplate, helpSms, type NilReturnType } from "@/lib/domain/gstn-sms";
import { dateOnly, parsePeriodKey, PeriodError, type FilingFrequency, type ReturnPeriod } from "@/lib/domain/periods";

const ReturnTypeSchema = z.enum(["GSTR1", "GSTR3B"]);
const TriSchema = z.enum(["YES", "NO", "UNKNOWN"]);
export const AssessmentInput = z.object({ answers: z.record(z.string(), TriSchema), declarationAccepted: z.boolean() });
export const ArnInput = z.object({ arn: z.string().trim().toUpperCase() });

function periodOrThrow(periodKey: string, frequency: FilingFrequency): ReturnPeriod {
  try {
    return parsePeriodKey(periodKey, frequency);
  } catch (e) {
    if (e instanceof PeriodError) throw new AppError(422, "INVALID_PERIOD", e.message);
    throw e;
  }
}

async function loadFiling(ctx: Ctx, filingId: string) {
  const f = await prisma.nilReturnFiling.findFirst({ where: { id: filingId, businessId: ctx.businessId } });
  if (!f) throw notFound("Nil filing");
  return f;
}

/** Locally recorded activity for the period — evidence that cannot be overridden by declarations. */
export async function localEvidence(businessId: string, returnType: NilReturnType, period: ReturnPeriod, isDemo: boolean): Promise<LocalEvidence> {
  const range = { gte: dateOnly(period.start), lt: dateOnly(period.endExclusive) };
  const [issued, drafts, inward, rcm, done, history] = await Promise.all([
    prisma.invoice.count({ where: { businessId, status: "ISSUED", invoiceDate: range } }),
    prisma.invoice.count({ where: { businessId, status: "DRAFT", invoiceDate: range } }),
    prisma.inwardSupply.count({ where: { businessId, documentDate: range } }),
    prisma.inwardSupply.count({ where: { businessId, documentDate: range, reverseCharge: true } }),
    prisma.nilReturnFiling.count({ where: { businessId, returnType, periodKey: period.key, isDemo, status: { in: ["ARN_RECORDED_UNVERIFIED", "FILED_VERIFIED"] } } }),
    readHistorical(businessId),
  ]);
  const historicalInvoices = inReturnPeriod(history.invoices, period).length;
  const hasImport = period.months.some(m => history.periods.includes(String(m.month).padStart(2,"0")+m.year));
  return { issuedInvoiceCount: issued, historicalImportCount: Math.max(historicalInvoices, hasImport ? 1 : 0), draftInvoiceCount: drafts, inwardSupplyCount: inward, reverseChargeInwardCount: rcm, alreadyRecordedInCompte: done > 0 };
}

export async function getOrCreateFiling(ctx: Ctx, raw: { returnType: string; periodKey: string; demo?: boolean }) {
  const returnType = ReturnTypeSchema.parse(raw.returnType);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const period = periodOrThrow(raw.periodKey, business.filingFrequency as FilingFrequency);
  const isDemo = !!raw.demo;
  if (isDemo && !env.demoMode) throw new AppError(403, "DEMO_DISABLED", "Demo simulation is only available when DEMO_MODE is enabled");
  const existing = await prisma.nilReturnFiling.findUnique({ where: { businessId_returnType_periodKey_isDemo: { businessId: ctx.businessId, returnType, periodKey: period.key, isDemo } } });
  if (existing) return existing;
  assertCanWrite(ctx);
  const f = await prisma.nilReturnFiling.create({
    data: { businessId: ctx.businessId, gstin: business.gstin, returnType, financialYear: period.financialYear, periodKey: period.key, filingFrequency: business.filingFrequency, status: "NOT_STARTED", isDemo },
  });
  await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "NIL_FILING_CREATED", entityType: "NilReturnFiling", entityId: f.id, metadata: { returnType, periodKey: period.key, isDemo } });
  return f;
}

async function transition(ctx: Ctx, filing: { id: string; status: string; isDemo: boolean }, to: FilingStatus, data: Record<string, unknown> = {}, extra: { irreversibleAcknowledged?: boolean; evidenceSource?: "USER" | "COMPTE_LEDGER" | "GSTN_OFFICIAL" | "DEMO_SIMULATOR" } = {}) {
  try {
    assertTransition(filing.status as FilingStatus, to, { isDemo: filing.isDemo, ...extra });
  } catch (e) {
    if (e instanceof FilingTransitionError) throw new AppError(409, "INVALID_TRANSITION", e.message);
    throw e;
  }
  const updated = await prisma.nilReturnFiling.updateMany({ where: { id: filing.id, status: filing.status }, data: { status: to, ...data } });
  if (updated.count !== 1) throw new AppError(409, "CONCURRENT_UPDATE", "This filing was updated elsewhere — reload the page");
  await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "NIL_FILING_STATUS", entityType: "NilReturnFiling", entityId: filing.id, metadata: { from: filing.status, to } });
  return prisma.nilReturnFiling.findUniqueOrThrow({ where: { id: filing.id } });
}

async function evidence(ctx: Ctx, filingId: string, kind: string, source: string, summary: string, payload: Record<string, unknown> = {}) {
  await prisma.filingEvidence.create({ data: { filingId, businessId: ctx.businessId, kind, source, summary, payload: JSON.stringify(payload), createdByUserId: ctx.userId } });
}

const REVIEWABLE: FilingStatus[] = ["NOT_STARTED", "ELIGIBILITY_REVIEW", "INELIGIBLE", "NEEDS_MANUAL_REVIEW", "ELIGIBLE_SELF_DECLARED", "REJECTED"];

export async function submitAssessment(ctx: Ctx, filingId: string, raw: unknown) {
  assertCanWrite(ctx);
  const input = AssessmentInput.parse(raw);
  let filing = await loadFiling(ctx, filingId);
  if (!REVIEWABLE.includes(filing.status as FilingStatus)) throw new AppError(409, "FILING_IN_PROGRESS", "Eligibility can't be changed after the government SMS step has started");
  const business = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const period = periodOrThrow(filing.periodKey, filing.filingFrequency as FilingFrequency);
  const returnType = filing.returnType as NilReturnType;
  const local = await localEvidence(ctx.businessId, returnType, period, filing.isDemo);
  const result = assessNilEligibility({
    returnType, period, today: today(),
    business: { gstin: business.gstin, registrationType: business.registrationType, filingFrequency: business.filingFrequency as FilingFrequency },
    local, answers: input.answers as Record<string, Tri>, declarationAccepted: input.declarationAccepted,
  });

  if (filing.status !== "ELIGIBILITY_REVIEW") filing = await transition(ctx, filing, "ELIGIBILITY_REVIEW");
  const target: FilingStatus = result.outcome === "ELIGIBLE_SELF_DECLARED" ? "ELIGIBLE_SELF_DECLARED" : result.outcome === "INELIGIBLE" ? "INELIGIBLE" : result.outcome === "NEEDS_MANUAL_REVIEW" ? "NEEDS_MANUAL_REVIEW" : "ELIGIBILITY_REVIEW";
  const lang = (business.preferredLanguage as "en" | "hi" | "mr") ?? "en";
  await prisma.nilEligibilityAssessment.create({
    data: {
      filingId, businessId: ctx.businessId, returnType, periodKey: filing.periodKey, outcome: result.outcome,
      answers: JSON.stringify(input.answers), checks: JSON.stringify(result.checks),
      declarationAccepted: input.declarationAccepted, declarationText: DECLARATION_TEXT[returnType][lang], createdByUserId: ctx.userId,
    },
  });
  await evidence(ctx, filingId, "LOCAL_LEDGER_CHECK", "COMPTE_LEDGER", `Ledger check: ${local.issuedInvoiceCount} issued invoice(s), ${local.draftInvoiceCount} draft(s), ${local.inwardSupplyCount} purchase(s) in period`, { ...local });
  await evidence(ctx, filingId, "USER_DECLARATION", "USER", `Eligibility answers submitted (outcome: ${result.outcome})`, { answers: input.answers, declarationAccepted: input.declarationAccepted });
  filing = await transition(ctx, filing, target, {
    eligibilityChecklist: JSON.stringify({ outcome: result.outcome, answers: input.answers, checks: result.checks }),
    declarationAt: input.declarationAccepted ? new Date() : null,
  });
  return { filing, result };
}

export async function prepareSms(ctx: Ctx, filingId: string, raw: unknown) {
  assertCanWrite(ctx);
  const { irreversibleAck } = z.object({ irreversibleAck: z.literal(true, { message: "Confirm that a government filing cannot be undone" }) }).parse(raw);
  let filing = await loadFiling(ctx, filingId);
  if (filing.status !== "ELIGIBLE_SELF_DECLARED") throw new AppError(409, "NOT_ELIGIBLE", "Complete the eligibility review first");
  const period = periodOrThrow(filing.periodKey, filing.filingFrequency as FilingFrequency);
  const returnType = filing.returnType as NilReturnType;

  // Re-check the ledger right now: books may have changed since the assessment.
  const local = await localEvidence(ctx.businessId, returnType, period, filing.isDemo);
  if (local.issuedInvoiceCount > 0 || local.draftInvoiceCount > 0 || (returnType === "GSTR3B" && local.inwardSupplyCount > 0)) {
    filing = await transition(ctx, filing, "ELIGIBILITY_REVIEW");
    throw new AppError(409, "LEDGER_CHANGED", "New activity was recorded for this period since your review. Please review eligibility again.");
  }
  // Duplicate prevention across real filings for the same return/period.
  const other = await prisma.nilReturnFiling.findFirst({ where: { businessId: ctx.businessId, returnType, periodKey: filing.periodKey, isDemo: filing.isDemo, id: { not: filing.id }, status: { in: COMMITTED_STATUSES } } });
  if (other) throw new AppError(409, "DUPLICATE_FILING", "A nil filing for this return and period is already in progress");

  const sms = buildNilInitiationSms({ returnType, gstin: filing.gstin, periodKey: filing.periodKey, frequency: filing.filingFrequency as FilingFrequency, today: today() });
  filing = await transition(ctx, filing, "READY_FOR_GOVERNMENT_SMS", { irreversibleAckAt: new Date(), filingChannel: "GOVERNMENT_SMS" }, { irreversibleAcknowledged: irreversibleAck });
  await evidence(ctx, filingId, "USER_DECLARATION", "USER", "User acknowledged the filing is irreversible and must be sent by them from the registered mobile");
  return { filing, sms };
}

export async function cancelBeforeSending(ctx: Ctx, filingId: string) {
  assertCanWrite(ctx);
  const filing = await loadFiling(ctx, filingId);
  if (filing.status !== "READY_FOR_GOVERNMENT_SMS") throw new AppError(409, "CANNOT_CANCEL", "Only a filing that has not been sent can be cancelled here");
  return transition(ctx, filing, "ELIGIBILITY_REVIEW", { irreversibleAckAt: null });
}

export async function reportInitiationSent(ctx: Ctx, filingId: string) {
  assertCanWrite(ctx);
  const filing = await loadFiling(ctx, filingId);
  const f = await transition(ctx, filing, "INITIATION_SENT_USER_REPORTED", { initiationReportedAt: new Date() });
  await evidence(ctx, filingId, filing.isDemo ? "DEMO_SIMULATION" : "USER_REPORTED_EVENT", filing.isDemo ? "DEMO_SIMULATOR" : "USER", filing.isDemo ? "DEMO: simulated initiation SMS" : "User reported sending the NIL initiation SMS to 14409");
  return f;
}

export async function reportConfirmationSent(ctx: Ctx, filingId: string) {
  assertCanWrite(ctx);
  const filing = await loadFiling(ctx, filingId);
  const f = await transition(ctx, filing, "AWAITING_GOVERNMENT_CONFIRMATION", { confirmationReportedAt: new Date() });
  // NB: the verification code itself is never collected or stored.
  await evidence(ctx, filingId, filing.isDemo ? "DEMO_SIMULATION" : "USER_REPORTED_EVENT", filing.isDemo ? "DEMO_SIMULATOR" : "USER", filing.isDemo ? "DEMO: simulated CNF SMS" : "User reported sending the CNF confirmation SMS to 14409");
  return f;
}

export function validateArn(arn: string, isDemo: boolean): string {
  const v = arn.trim().toUpperCase();
  if (isDemo) {
    if (!/^DEMO-[A-Z0-9]{6,20}$/.test(v)) throw new AppError(422, "INVALID_ARN", "Demo ARNs start with DEMO-");
    return v;
  }
  if (v.startsWith("DEMO")) throw new AppError(422, "INVALID_ARN", "A demo ARN cannot be recorded on a real filing");
  if (!/^[A-Z0-9]{10,20}$/.test(v)) throw new AppError(422, "INVALID_ARN", "Enter the ARN exactly as received from GSTN (letters and digits only)");
  return v;
}

export async function recordArn(ctx: Ctx, filingId: string, raw: unknown) {
  assertCanWrite(ctx);
  const { arn } = ArnInput.parse(raw);
  const filing = await loadFiling(ctx, filingId);
  const clean = validateArn(arn, filing.isDemo);
  const f = await transition(ctx, filing, "ARN_RECORDED_UNVERIFIED", { arn: clean, arnVerificationStatus: "UNVERIFIED", arnRecordedAt: new Date() });
  await evidence(ctx, filingId, filing.isDemo ? "DEMO_SIMULATION" : "USER_ENTERED_ARN", filing.isDemo ? "DEMO_SIMULATOR" : "USER", filing.isDemo ? `DEMO ARN recorded: ${clean}` : `User entered ARN ${clean} (not verified by Compte)`, { arn: clean });
  return f;
}

export async function reportRejection(ctx: Ctx, filingId: string, raw: unknown) {
  assertCanWrite(ctx);
  const { reason } = z.object({ reason: z.string().trim().min(3).max(300) }).parse(raw);
  if (/\b\d{6}\b/.test(reason)) throw new AppError(422, "NO_CODES", "Please don't paste verification codes into Compte — describe the error instead");
  const filing = await loadFiling(ctx, filingId);
  const f = await transition(ctx, filing, "REJECTED", { rejectionReason: reason });
  await evidence(ctx, filingId, filing.isDemo ? "DEMO_SIMULATION" : "USER_REPORTED_EVENT", filing.isDemo ? "DEMO_SIMULATOR" : "USER", `GSTN error reported: ${reason}`);
  return f;
}

/**
 * Only an authorised GSTN/GSP integration may call this. No such integration exists in the MVP,
 * so FILED_VERIFIED is unreachable from the UI. Kept to make the rule explicit and testable.
 */
export async function recordOfficialVerification(ctx: Ctx, filingId: string, ev: { source: "GSTN_OFFICIAL" | "USER" | "DEMO_SIMULATOR"; reference: string }) {
  const filing = await loadFiling(ctx, filingId);
  const f = await transition(ctx, filing, "FILED_VERIFIED", { arnVerificationStatus: "VERIFIED" }, { evidenceSource: ev.source });
  await evidence(ctx, filingId, "OFFICIAL_RETRIEVED", "GSTN_OFFICIAL", `Filing verified from official source (${ev.reference})`);
  return f;
}

export async function getFilingView(ctx: Ctx, filingId: string) {
  const filing = await loadFiling(ctx, filingId);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const period = periodOrThrow(filing.periodKey, filing.filingFrequency as FilingFrequency);
  const returnType = filing.returnType as NilReturnType;
  const [evidenceRows, assessments, local] = await Promise.all([
    prisma.filingEvidence.findMany({ where: { filingId }, orderBy: { createdAt: "asc" } }),
    prisma.nilEligibilityAssessment.findMany({ where: { filingId }, orderBy: { createdAt: "desc" }, take: 1 }),
    localEvidence(ctx.businessId, returnType, period, filing.isDemo),
  ]);
  let sms: { to: string; body: string } | null = null;
  if (["READY_FOR_GOVERNMENT_SMS", "INITIATION_SENT_USER_REPORTED", "AWAITING_GOVERNMENT_CONFIRMATION", "REJECTED"].includes(filing.status)) {
    try { sms = buildNilInitiationSms({ returnType, gstin: filing.gstin, periodKey: filing.periodKey, frequency: filing.filingFrequency as FilingFrequency, today: today() }); } catch { sms = null; }
  }
  const latest = assessments[0];
  return {
    filing,
    period,
    business: { legalName: business.legalName, gstin: business.gstin, filingFrequency: business.filingFrequency, registrationType: business.registrationType, phone: business.phone, phoneIsGstnRegistered: business.phoneIsGstnRegistered, preferredLanguage: business.preferredLanguage },
    local,
    latestAssessment: latest ? { outcome: latest.outcome, answers: JSON.parse(latest.answers) as Record<string, Tri>, checks: JSON.parse(latest.checks), declarationAccepted: latest.declarationAccepted, createdAt: latest.createdAt } : null,
    evidence: evidenceRows,
    sms,
    confirmationTemplate: confirmationTemplate(returnType),
    helpSms: helpSms(returnType),
    filedLike: isFiledLike(filing.status as FilingStatus),
  };
}

export async function filingsForPeriod(businessId: string, periodKey: string) {
  return prisma.nilReturnFiling.findMany({ where: { businessId, periodKey }, orderBy: { updatedAt: "desc" } });
}

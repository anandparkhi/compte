import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getOrCreateFiling, prepareSms, recordArn, recordOfficialVerification, reportConfirmationSent, reportInitiationSent, reportRejection, submitAssessment, getFilingView, cancelBeforeSending } from "@/server/services/nil-filing";
import { createDraftFromText, issueInvoice, getInvoiceView, updateDraft } from "@/server/services/invoices";
import { handleInboundSms } from "@/server/services/sms-inbound";
import { assessNilEligibility, questionsFor, type Tri } from "@/lib/domain/nil-eligibility";
import { parsePeriodKey } from "@/lib/domain/periods";
import { dateOnly } from "@/lib/domain/periods";
import { issueFor, makeBusiness, setTodayForTests } from "../helpers";

beforeEach(() => setTodayForTests(() => "2026-11-01"));
afterEach(() => setTodayForTests(null));

/** All answers that make a return nil (YES for "positive" questions, NO for disqualifiers). */
function cleanAnswers(rt: "GSTR1" | "GSTR3B", freq: "MONTHLY" | "QUARTERLY" = "MONTHLY"): Record<string, Tri> {
  return Object.fromEntries(questionsFor(rt, freq).map((q) => [q.id, q.disqualifyOn === "YES" ? "NO" : "YES"]));
}
const noLocal = { issuedInvoiceCount: 0, draftInvoiceCount: 0, inwardSupplyCount: 0, reverseChargeInwardCount: 0, alreadyRecordedInCompte: false };
const biz = { gstin: "27ZZZFZ0001Z1ZU", registrationType: "REGULAR", filingFrequency: "MONTHLY" as const };
const sep = parsePeriodKey("092026", "MONTHLY");

describe("Eligibility engine (pure)", () => {
  it("16. GSTR-1 eligible with no reportable entries and full declaration", () => {
    const r = assessNilEligibility({ returnType: "GSTR1", period: sep, today: "2026-11-01", business: biz, local: noLocal, answers: cleanAnswers("GSTR1"), declarationAccepted: true });
    expect(r.outcome).toBe("ELIGIBLE_SELF_DECLARED");
    expect(r.blockers).toHaveLength(0);
  });
  it("17. GSTR-1 blocked by a recorded invoice even if the user declares no sales", () => {
    const r = assessNilEligibility({ returnType: "GSTR1", period: sep, today: "2026-11-01", business: biz, local: { ...noLocal, issuedInvoiceCount: 1 }, answers: cleanAnswers("GSTR1"), declarationAccepted: true });
    expect(r.outcome).toBe("INELIGIBLE");
    expect(r.blockers.map((b) => b.id)).toContain("local_issued_invoices");
  });
  it("18. GSTR-1 blocked while external activity is unconfirmed", () => {
    const r = assessNilEligibility({ returnType: "GSTR1", period: sep, today: "2026-11-01", business: biz, local: noLocal, answers: { ...cleanAnswers("GSTR1"), outside_outward_supplies: "UNKNOWN" }, declarationAccepted: true });
    expect(r.outcome).toBe("INCOMPLETE");
    expect(r.unknowns.map((u) => u.id)).toContain("q_outside_outward_supplies");
    const noDecl = assessNilEligibility({ returnType: "GSTR1", period: sep, today: "2026-11-01", business: biz, local: noLocal, answers: cleanAnswers("GSTR1"), declarationAccepted: false });
    expect(noDecl.outcome).toBe("INCOMPLETE");
  });
  it("19. GSTR-3B blocked when purchases are recorded", () => {
    const r = assessNilEligibility({ returnType: "GSTR3B", period: sep, today: "2026-11-01", business: biz, local: { ...noLocal, inwardSupplyCount: 2 }, answers: cleanAnswers("GSTR3B"), declarationAccepted: true });
    expect(r.outcome).toBe("INELIGIBLE");
    expect(r.blockers.map((b) => b.id)).toContain("local_inward_supplies");
  });
  it("20. GSTR-3B blocked by a tax liability (declared or reverse-charge records)", () => {
    const declared = assessNilEligibility({ returnType: "GSTR3B", period: sep, today: "2026-11-01", business: biz, local: noLocal, answers: { ...cleanAnswers("GSTR3B"), other_liability: "YES" }, declarationAccepted: true });
    expect(declared.outcome).toBe("INELIGIBLE");
    const rcm = assessNilEligibility({ returnType: "GSTR3B", period: sep, today: "2026-11-01", business: biz, local: { ...noLocal, inwardSupplyCount: 1, reverseChargeInwardCount: 1 }, answers: cleanAnswers("GSTR3B"), declarationAccepted: true });
    expect(rcm.blockers.map((b) => b.id)).toContain("local_reverse_charge");
    const prior = assessNilEligibility({ returnType: "GSTR3B", period: sep, today: "2026-11-01", business: biz, local: noLocal, answers: { ...cleanAnswers("GSTR3B"), prior_period_liability: "YES" }, declarationAccepted: true });
    expect(prior.outcome).toBe("INELIGIBLE");
  });
  it("21. GSTR-3B blocked when portal-derived data is not cleared or reviewed", () => {
    const unknown2b = assessNilEligibility({ returnType: "GSTR3B", period: sep, today: "2026-11-01", business: biz, local: noLocal, answers: { ...cleanAnswers("GSTR3B"), gstr2b_entries: "UNKNOWN" }, declarationAccepted: true });
    expect(unknown2b.outcome).toBe("INCOMPLETE");
    const autoPop = assessNilEligibility({ returnType: "GSTR3B", period: sep, today: "2026-11-01", business: biz, local: noLocal, answers: { ...cleanAnswers("GSTR3B"), auto_populated_values: "YES" }, declarationAccepted: true });
    expect(autoPop.outcome).toBe("NEEDS_MANUAL_REVIEW");
    const notReviewed = assessNilEligibility({ returnType: "GSTR3B", period: sep, today: "2026-11-01", business: biz, local: noLocal, answers: { ...cleanAnswers("GSTR3B"), portal_reviewed: "NO" }, declarationAccepted: true });
    expect(notReviewed.outcome).toBe("INELIGIBLE");
    expect(notReviewed.checks.find((c) => c.id === "q_portal_reviewed")?.source).toBe("NOT_VERIFIABLE_BY_COMPTE");
  });
  it("22. GSTR-3B blocked by interest / late fee", () => {
    const r = assessNilEligibility({ returnType: "GSTR3B", period: sep, today: "2026-11-01", business: biz, local: noLocal, answers: { ...cleanAnswers("GSTR3B"), interest_late_fee: "YES" }, declarationAccepted: true });
    expect(r.outcome).toBe("INELIGIBLE");
    const prev = assessNilEligibility({ returnType: "GSTR3B", period: sep, today: "2026-11-01", business: biz, local: noLocal, answers: { ...cleanAnswers("GSTR3B"), previous_returns_filed: "NO" }, declarationAccepted: true });
    expect(prev.outcome).toBe("INELIGIBLE");
  });
  it("zero sales never implies nil GSTR-3B: the two returns are assessed independently", () => {
    const local = { ...noLocal, inwardSupplyCount: 1 };
    const r1 = assessNilEligibility({ returnType: "GSTR1", period: sep, today: "2026-11-01", business: biz, local, answers: cleanAnswers("GSTR1"), declarationAccepted: true });
    const r3 = assessNilEligibility({ returnType: "GSTR3B", period: sep, today: "2026-11-01", business: biz, local, answers: cleanAnswers("GSTR3B"), declarationAccepted: true });
    expect(r1.outcome).toBe("ELIGIBLE_SELF_DECLARED");
    expect(r3.outcome).toBe("INELIGIBLE");
  });
  it("26. future period, composition taxpayer and frequency mismatch are blocked", () => {
    const nov = parsePeriodKey("112026", "MONTHLY");
    expect(assessNilEligibility({ returnType: "GSTR1", period: nov, today: "2026-11-01", business: biz, local: noLocal, answers: cleanAnswers("GSTR1"), declarationAccepted: true }).outcome).toBe("INELIGIBLE");
    expect(assessNilEligibility({ returnType: "GSTR1", period: sep, today: "2026-11-01", business: { ...biz, registrationType: "COMPOSITION" }, local: noLocal, answers: cleanAnswers("GSTR1"), declarationAccepted: true }).outcome).toBe("INELIGIBLE");
    expect(assessNilEligibility({ returnType: "GSTR1", period: parsePeriodKey("092026", "QUARTERLY"), today: "2026-11-01", business: biz, local: noLocal, answers: cleanAnswers("GSTR1"), declarationAccepted: true }).outcome).toBe("INELIGIBLE");
  });
  it("quarterly filers get the IFF question", () => {
    expect(questionsFor("GSTR1", "QUARTERLY").map((q) => q.id)).toContain("iff_uploaded");
    expect(questionsFor("GSTR1", "MONTHLY").map((q) => q.id)).not.toContain("iff_uploaded");
  });
});

async function eligibleFiling(t: Awaited<ReturnType<typeof makeBusiness>>, rt: "GSTR1" | "GSTR3B" = "GSTR1", demo = false) {
  const f = await getOrCreateFiling(t.ctx, { returnType: rt, periodKey: "092026", demo });
  const { filing } = await submitAssessment(t.ctx, f.id, { answers: cleanAnswers(rt), declarationAccepted: true });
  expect(filing.status).toBe("ELIGIBLE_SELF_DECLARED");
  return filing;
}

describe("Nil filing workflow (services)", () => {
  it("ledger evidence is checked server-side and wins over declarations", async () => {
    const t = await makeBusiness();
    await issueFor(t, "2026-09-15", t.ramesh, [{ productId: t.box.id, quantity: "1", unitPrice: "100" }]);
    const f = await getOrCreateFiling(t.ctx, { returnType: "GSTR1", periodKey: "092026" });
    const { filing, result } = await submitAssessment(t.ctx, f.id, { answers: cleanAnswers("GSTR1"), declarationAccepted: true });
    expect(result.outcome).toBe("INELIGIBLE");
    expect(filing.status).toBe("INELIGIBLE");
    await expect(prepareSms(t.ctx, f.id, { irreversibleAck: true })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });
  it("3B blocked by purchases recorded in the period", async () => {
    const t = await makeBusiness();
    await prisma.inwardSupply.create({ data: { businessId: t.business.id, supplierName: "S", documentNumber: "1", documentDate: dateOnly("2026-09-10"), taxableValue: "100.00", taxAmount: "18.00" } });
    const f = await getOrCreateFiling(t.ctx, { returnType: "GSTR3B", periodKey: "092026" });
    const { filing } = await submitAssessment(t.ctx, f.id, { answers: cleanAnswers("GSTR3B"), declarationAccepted: true });
    expect(filing.status).toBe("INELIGIBLE");
  });
  it("requires the irreversible acknowledgement and produces the exact SMS", async () => {
    const t = await makeBusiness();
    const f = await eligibleFiling(t);
    await expect(prepareSms(t.ctx, f.id, {})).rejects.toThrow();
    const { filing, sms } = await prepareSms(t.ctx, f.id, { irreversibleAck: true });
    expect(filing.status).toBe("READY_FOR_GOVERNMENT_SMS");
    expect(sms).toEqual({ to: "14409", body: `NIL R1 ${t.business.gstin} 092026` });
  });
  it("re-checks the ledger at the SMS step (books changed after the review)", async () => {
    const t = await makeBusiness();
    const f = await eligibleFiling(t);
    await issueFor(t, "2026-09-20", t.ramesh, [{ productId: t.box.id, quantity: "1", unitPrice: "100" }]);
    await expect(prepareSms(t.ctx, f.id, { irreversibleAck: true })).rejects.toMatchObject({ code: "LEDGER_CHANGED" });
    expect((await prisma.nilReturnFiling.findUnique({ where: { id: f.id } }))!.status).toBe("ELIGIBILITY_REVIEW");
  });
  it("30. sending (copying) the initiation SMS never marks the return filed", async () => {
    const t = await makeBusiness();
    const f = await eligibleFiling(t);
    await prepareSms(t.ctx, f.id, { irreversibleAck: true });
    const a = await reportInitiationSent(t.ctx, f.id);
    expect(a.status).toBe("INITIATION_SENT_USER_REPORTED");
    expect(a.arnVerificationStatus).toBe("NONE");
    const b = await reportConfirmationSent(t.ctx, f.id);
    expect(b.status).toBe("AWAITING_GOVERNMENT_CONFIRMATION");
    expect(b.arn).toBeNull();
  });
  it("31. ARN is recorded as unverified and cannot be self-verified", async () => {
    const t = await makeBusiness();
    const f = await eligibleFiling(t);
    await prepareSms(t.ctx, f.id, { irreversibleAck: true });
    await reportInitiationSent(t.ctx, f.id);
    await expect(recordArn(t.ctx, f.id, { arn: "AA2709260012345" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" }); // must report confirmation first
    await reportConfirmationSent(t.ctx, f.id);
    await expect(recordArn(t.ctx, f.id, { arn: "DEMO-AA123456" })).rejects.toMatchObject({ code: "INVALID_ARN" });
    const r = await recordArn(t.ctx, f.id, { arn: "aa2709260012345" });
    expect(r).toMatchObject({ status: "ARN_RECORDED_UNVERIFIED", arn: "AA2709260012345", arnVerificationStatus: "UNVERIFIED" });
    await expect(recordOfficialVerification(t.ctx, f.id, { source: "USER", reference: "I checked" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    const view = await getFilingView(t.ctx, f.id);
    expect(view.filing.status).toBe("ARN_RECORDED_UNVERIFIED");
    expect(view.evidence.map((e) => e.kind)).toEqual(expect.arrayContaining(["LOCAL_LEDGER_CHECK", "USER_DECLARATION", "USER_REPORTED_EVENT", "USER_ENTERED_ARN"]));
  });
  it("demo simulations are labelled and can never be verified", async () => {
    const t = await makeBusiness();
    const f = await eligibleFiling(t, "GSTR1", true);
    expect(f.isDemo).toBe(true);
    await prepareSms(t.ctx, f.id, { irreversibleAck: true });
    await reportInitiationSent(t.ctx, f.id);
    await reportConfirmationSent(t.ctx, f.id);
    await expect(recordArn(t.ctx, f.id, { arn: "AA2709260012345" })).rejects.toMatchObject({ code: "INVALID_ARN" });
    await recordArn(t.ctx, f.id, { arn: "DEMO-AA27092600001" });
    await expect(recordOfficialVerification(t.ctx, f.id, { source: "GSTN_OFFICIAL", reference: "x" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    const ev = await prisma.filingEvidence.findMany({ where: { filingId: f.id, source: "DEMO_SIMULATOR" } });
    expect(ev.length).toBeGreaterThanOrEqual(3);
  });
  it("32. failed government attempts are recorded and can be retried after re-review", async () => {
    const t = await makeBusiness();
    const f = await eligibleFiling(t, "GSTR3B");
    await prepareSms(t.ctx, f.id, { irreversibleAck: true });
    await reportInitiationSent(t.ctx, f.id);
    await expect(reportRejection(t.ctx, f.id, { reason: "code 123456 expired" })).rejects.toMatchObject({ code: "NO_CODES" });
    const rej = await reportRejection(t.ctx, f.id, { reason: "Invalid or expired code" });
    expect(rej.status).toBe("REJECTED");
    expect(rej.arn).toBeNull();
    const { filing } = await submitAssessment(t.ctx, f.id, { answers: cleanAnswers("GSTR3B"), declarationAccepted: true });
    expect(filing.status).toBe("ELIGIBLE_SELF_DECLARED");
  });
  it("28. duplicate filing attempts are prevented", async () => {
    const t = await makeBusiness();
    const a = await getOrCreateFiling(t.ctx, { returnType: "GSTR1", periodKey: "092026" });
    const b = await getOrCreateFiling(t.ctx, { returnType: "GSTR1", periodKey: "092026" });
    expect(b.id).toBe(a.id);
    await expect(prisma.nilReturnFiling.create({ data: { businessId: t.business.id, gstin: t.business.gstin, returnType: "GSTR1", financialYear: "2026-27", periodKey: "092026", filingFrequency: "MONTHLY" } })).rejects.toThrow();
    await submitAssessment(t.ctx, a.id, { answers: cleanAnswers("GSTR1"), declarationAccepted: true });
    await prepareSms(t.ctx, a.id, { irreversibleAck: true });
    await reportInitiationSent(t.ctx, a.id);
    await reportConfirmationSent(t.ctx, a.id);
    await recordArn(t.ctx, a.id, { arn: "AA2709260012345" });
    await expect(submitAssessment(t.ctx, a.id, { answers: cleanAnswers("GSTR1"), declarationAccepted: true })).rejects.toMatchObject({ code: "FILING_IN_PROGRESS" });
    await expect(prepareSms(t.ctx, a.id, { irreversibleAck: true })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });
  it("a committed nil GSTR-1 blocks new invoices dated in that period", async () => {
    const t = await makeBusiness();
    const f = await eligibleFiling(t);
    await prepareSms(t.ctx, f.id, { irreversibleAck: true });
    await expect(issueFor(t, "2026-09-25", t.ramesh, [{ productId: t.box.id, quantity: "1", unitPrice: "100" }])).rejects.toMatchObject({ code: "INVOICE_NOT_READY" });
    await cancelBeforeSending(t.ctx, f.id);
    await expect(issueFor(t, "2026-09-25", t.ramesh, [{ productId: t.box.id, quantity: "1", unitPrice: "100" }])).resolves.toMatchObject({ status: "ISSUED" });
  });
  it("26. invalid / future periods are rejected by the service", async () => {
    const t = await makeBusiness();
    await expect(getOrCreateFiling(t.ctx, { returnType: "GSTR1", periodKey: "132026" })).rejects.toMatchObject({ code: "INVALID_PERIOD" });
    const nov = await getOrCreateFiling(t.ctx, { returnType: "GSTR1", periodKey: "112026" });
    const { filing } = await submitAssessment(t.ctx, nov.id, { answers: cleanAnswers("GSTR1"), declarationAccepted: true });
    expect(filing.status).toBe("INELIGIBLE");
  });
  it("34. filings are isolated per business", async () => {
    const a = await makeBusiness();
    const b = await makeBusiness();
    const f = await getOrCreateFiling(a.ctx, { returnType: "GSTR1", periodKey: "092026" });
    await expect(submitAssessment(b.ctx, f.id, { answers: cleanAnswers("GSTR1"), declarationAccepted: true })).rejects.toMatchObject({ status: 404 });
    await expect(getFilingView(b.ctx, f.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("33. Merchant SMS simulator is separate from the GSTN 14409 channel", () => {
  it("rejects GSTN commands and never stores verification codes", async () => {
    const t = await makeBusiness();
    const r = await handleInboundSms({ channel: "SMS_SIMULATOR", providerMessageId: "m-gstn-1", from: t.business.phone, body: "CNF R1 482913" }, t.ctx);
    expect(r.classification).toBe("GSTN_COMMAND_REJECTED");
    const row = await prisma.inboundMessage.findFirstOrThrow({ where: { providerMessageId: "m-gstn-1" } });
    expect(row.bodyRedacted).toBe(true);
    expect(row.body).not.toContain("482913");
    const everywhere = JSON.stringify([await prisma.inboundMessage.findMany(), await prisma.auditLog.findMany(), await prisma.filingEvidence.findMany()]);
    expect(everywhere).not.toContain("482913");
    const nil = await handleInboundSms({ channel: "SMS_SIMULATOR", providerMessageId: "m-gstn-2", from: t.business.phone, body: `NIL 3B ${t.business.gstin} 092026` }, t.ctx);
    expect(nil.classification).toBe("GSTN_COMMAND_REJECTED");
    expect(await prisma.nilReturnFiling.count({ where: { businessId: t.business.id } })).toBe(0);
  });
  it("BILL → CONFIRM issues an invoice, idempotently per message id", async () => {
    const t = await makeBusiness();
    const r1 = await handleInboundSms({ channel: "SMS_SIMULATOR", providerMessageId: "m-bill-1", from: t.business.phone, body: "BILL RAMESH 20 BOX 500 GST18" }, t.ctx);
    expect(r1.classification).toBe("INVOICE_COMMAND");
    expect(r1.reply).toMatch(/Total ₹11,800\.00/);
    const ref = /CONFIRM (D[A-Z0-9]{5})/.exec(r1.reply)![1];
    const again = await handleInboundSms({ channel: "SMS_SIMULATOR", providerMessageId: "m-bill-1", from: t.business.phone, body: "BILL RAMESH 20 BOX 500 GST18" }, t.ctx);
    expect(again.replayed).toBe(true);
    expect(await prisma.invoice.count({ where: { businessId: t.business.id } })).toBe(1);
    const c = await handleInboundSms({ channel: "SMS_SIMULATOR", providerMessageId: "m-conf-1", from: t.business.phone, body: `CONFIRM ${ref}` }, t.ctx);
    expect(c.reply).toMatch(/TB\/26-27\/0001 issued/);
    const c2 = await handleInboundSms({ channel: "SMS_SIMULATOR", providerMessageId: "m-conf-1", from: t.business.phone, body: `CONFIRM ${ref}` }, t.ctx);
    expect(c2.replayed).toBe(true);
    expect(await prisma.invoice.count({ where: { businessId: t.business.id, status: "ISSUED" } })).toBe(1);
  });
  it("webhook path resolves the business only from a known sender", async () => {
    await makeBusiness();
    const r = await handleInboundSms({ channel: "SMS_WEBHOOK", providerMessageId: "w-1", from: "+919999999999", body: "BILL RAMESH 1 BOX 500" });
    expect(r.classification).toBe("UNKNOWN_SENDER");
  });
});

describe("Draft created from text stays out of returns until issued", () => {
  it("drafts don't count for nil eligibility as issued supplies but do require review", async () => {
    const t = await makeBusiness();
    const d = await createDraftFromText(t.ctx, { text: "BILL RAMESH 1 BOX 500 GST18", source: "TEXT" });
    const v = await getInvoiceView(t.ctx, d.id);
    await updateDraft(t.ctx, d.id, { customerId: v.invoice.customerId, invoiceDate: "2026-09-10", placeOfSupplyStateCode: "27", placeOfSupplyConfirmed: false, lines: v.invoice.lineItems.map((l) => ({ ...l })) });
    const f = await getOrCreateFiling(t.ctx, { returnType: "GSTR1", periodKey: "092026" });
    const { result } = await submitAssessment(t.ctx, f.id, { answers: cleanAnswers("GSTR1"), declarationAccepted: true });
    expect(result.outcome).toBe("NEEDS_MANUAL_REVIEW");
    void issueInvoice;
  });
});

import { describe, expect, it } from "vitest";
import { computeGstinCheckChar, validateGstin } from "@/lib/domain/gstin";
import { computeInvoice, computeLine, determineSupplyType, GstInputError } from "@/lib/domain/gst";
import { formatInvoiceNumber } from "@/lib/domain/invoice-number";
import { financialYearOf, isDateInPeriod, isPeriodEnded, listPeriodsForFY, parsePeriodKey, periodForDate } from "@/lib/domain/periods";
import { amountInWords, formatIndianNumber } from "@/lib/domain/money";
import { buildNilInitiationSms, confirmationTemplate, looksLikeGstnCommand, smsComposerUri, SmsCommandError } from "@/lib/domain/gstn-sms";
import { assertTransition, canTransition, FilingTransitionError } from "@/lib/domain/filing-state";

const g = (s: string) => s + computeGstinCheckChar(s);

describe("1. GSTIN structural validation", () => {
  it("accepts a GSTIN with a correct check character", () => {
    const v = validateGstin(g("27ZZZFZ0001Z1Z"));
    expect(v.valid).toBe(true);
    if (v.valid) expect(v.stateCode).toBe("27");
  });
  it("normalises case and spaces", () => {
    expect(validateGstin(` ${g("27ZZZFZ0001Z1Z").toLowerCase()} `).valid).toBe(true);
  });
  it("rejects wrong length, format, state code and checksum", () => {
    const good = g("27ZZZFZ0001Z1Z");
    expect(validateGstin("27ZZZFZ0001Z1")).toMatchObject({ valid: false, reason: "LENGTH" });
    expect(validateGstin("2AZZZFZ0001Z1ZX")).toMatchObject({ valid: false, reason: "FORMAT" });
    expect(validateGstin(g("99ZZZFZ0001Z1Z"))).toMatchObject({ valid: false, reason: "STATE_CODE" });
    const bad = good.slice(0, 14) + (good[14] === "A" ? "B" : "A");
    expect(validateGstin(bad)).toMatchObject({ valid: false, reason: "CHECKSUM" });
    expect(validateGstin("")).toMatchObject({ valid: false, reason: "EMPTY" });
  });
  it("matches a published sample GSTIN checksum", () => {
    // GSTN's own documentation example GSTIN
    expect(computeGstinCheckChar("07AQDPP8277H8Z")).toBe("6");
  });
});

describe("8–10. Deterministic GST engine", () => {
  it("8. intra-state: ₹10,000 @18% → CGST 900 + SGST 900 = 11,800", () => {
    const r = computeInvoice([{ quantity: "20", unitPrice: "500", gstRate: "18", priceIncludesTax: false }], "INTRA");
    expect(r.totals).toEqual({ taxableTotal: "10000.00", cgstTotal: "900.00", sgstTotal: "900.00", igstTotal: "0.00", grandTotal: "11800.00" });
  });
  it("9. inter-state: ₹10,000 @18% → IGST 1,800 = 11,800", () => {
    const r = computeInvoice([{ quantity: "20", unitPrice: "500", gstRate: "18", priceIncludesTax: false }], "INTER");
    expect(r.totals).toEqual({ taxableTotal: "10000.00", cgstTotal: "0.00", sgstTotal: "0.00", igstTotal: "1800.00", grandTotal: "11800.00" });
  });
  it("supply type follows place of supply, not billing address", () => {
    expect(determineSupplyType("27", "27")).toBe("INTRA");
    expect(determineSupplyType("27", "30")).toBe("INTER");
    expect(determineSupplyType("27", "97")).toBe("INTER");
  });
  it("10. exact decimal arithmetic with half-up rounding to paise", () => {
    // 3 × 33.33 = 99.99; 9% of 99.99 = 8.9991 → 9.00 each
    expect(computeLine({ quantity: "3", unitPrice: "33.33", gstRate: "18", priceIncludesTax: false }, "INTRA")).toEqual({ taxableValue: "99.99", cgst: "9.00", sgst: "9.00", igst: "0.00", lineTotal: "117.99" });
    // 0.1 + 0.2 style float traps: 0.1 kg × 0.3 = 0.03; 5% IGST = 0.0015 → 0.00
    expect(computeLine({ quantity: "0.1", unitPrice: "0.30", gstRate: "5", priceIncludesTax: false }, "INTER").igst).toBe("0.00");
    // half-up exactly at .005: 2.5% of 10.10 = 0.2525 → 0.25 ; 9% of 10.50 = 0.945 → 0.95
    expect(computeLine({ quantity: "1", unitPrice: "10.50", gstRate: "18", priceIncludesTax: false }, "INTRA").cgst).toBe("0.95");
    // inclusive pricing: 590 incl 18% → taxable 500, tax 45+45
    expect(computeLine({ quantity: "1", unitPrice: "590", gstRate: "18", priceIncludesTax: true }, "INTRA")).toEqual({ taxableValue: "500.00", cgst: "45.00", sgst: "45.00", igst: "0.00", lineTotal: "590.00" });
    // large values stay exact
    expect(computeLine({ quantity: "1000", unitPrice: "99999.99", gstRate: "28", priceIncludesTax: false }, "INTER").lineTotal).toBe("127999987.20");
  });
  it("rejects non-positive quantities/prices and unknown rates", () => {
    expect(() => computeLine({ quantity: "0", unitPrice: "1", gstRate: "18", priceIncludesTax: false }, "INTRA")).toThrow(GstInputError);
    expect(() => computeLine({ quantity: "1", unitPrice: "-5", gstRate: "18", priceIncludesTax: false }, "INTRA")).toThrow(GstInputError);
    expect(() => computeLine({ quantity: "1", unitPrice: "5", gstRate: "17", priceIncludesTax: false }, "INTRA")).toThrow(/not a recognised/);
    expect(() => computeLine({ quantity: "1", unitPrice: "5.555", gstRate: "18", priceIncludesTax: false }, "INTRA")).toThrow(/decimal/);
  });
  it("Indian formatting and amount in words", () => {
    expect(formatIndianNumber("1234567.5")).toBe("12,34,567.50");
    expect(amountInWords("11800.00")).toBe("Indian Rupees Eleven Thousand Eight Hundred Only");
    expect(amountInWords("123456.78")).toBe("Indian Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only");
  });
});

describe("11. Financial-year invoice numbering", () => {
  it("formats per FY and resets the FY segment", () => {
    expect(formatInvoiceNumber("DMT", "2026-27", 1)).toBe("DMT/26-27/0001");
    expect(formatInvoiceNumber("DMT", "2027-28", 1)).toBe("DMT/27-28/0001");
    expect(financialYearOf("2027-03-31")).toBe("2026-27");
    expect(financialYearOf("2027-04-01")).toBe("2027-28");
  });
  it("enforces the 16-character limit of Rule 46(b)", () => {
    expect(formatInvoiceNumber("ABCDE", "2026-27", 9999)).toHaveLength(16);
    expect(() => formatInvoiceNumber("ABCDE", "2026-27", 10000)).toThrow(/16-character/);
  });
});

describe("15/25/26. Return periods", () => {
  it("15. includes dates inside the period and excludes the next day", () => {
    const sep = parsePeriodKey("092026", "MONTHLY");
    expect(isDateInPeriod("2026-09-30", sep)).toBe(true);
    expect(isDateInPeriod("2026-10-01", sep)).toBe(false);
    expect(isDateInPeriod("2026-09-01", sep)).toBe(true);
  });
  it("25. quarterly filers use the last month of the quarter", () => {
    expect(periodForDate("2026-08-14", "QUARTERLY").key).toBe("092026");
    expect(periodForDate("2027-02-01", "QUARTERLY").key).toBe("032027");
    expect(parsePeriodKey("062026", "QUARTERLY").months.map((m) => m.month)).toEqual([4, 5, 6]);
    expect(() => parsePeriodKey("052026", "QUARTERLY")).toThrow(/last month of the quarter/);
    expect(listPeriodsForFY("2026-27", "QUARTERLY").map((p) => p.key)).toEqual(["062026", "092026", "122026", "032027"]);
    expect(listPeriodsForFY("2026-27", "MONTHLY")).toHaveLength(12);
  });
  it("26. rejects invalid and not-yet-ended periods", () => {
    expect(() => parsePeriodKey("132026", "MONTHLY")).toThrow();
    expect(() => parsePeriodKey("062017", "MONTHLY")).toThrow(/July 2017/);
    expect(() => parsePeriodKey("9-2026", "MONTHLY")).toThrow(/MMYYYY/);
    expect(isPeriodEnded(parsePeriodKey("102026", "MONTHLY"), "2026-10-31")).toBe(false);
    expect(isPeriodEnded(parsePeriodKey("102026", "MONTHLY"), "2026-11-01")).toBe(true);
  });
});

describe("23–27. Official GSTN SMS commands", () => {
  const gstin = g("27ZZZFZ0001Z1Z");
  it("23. nil GSTR-1 initiation format", () => {
    expect(buildNilInitiationSms({ returnType: "GSTR1", gstin, periodKey: "092026", frequency: "MONTHLY", today: "2026-11-01" })).toEqual({ to: "14409", body: `NIL R1 ${gstin} 092026` });
    expect(confirmationTemplate("GSTR1")).toBe("CNF R1 <6-digit code>");
  });
  it("24. nil GSTR-3B initiation format", () => {
    expect(buildNilInitiationSms({ returnType: "GSTR3B", gstin, periodKey: "092026", frequency: "MONTHLY", today: "2026-11-01" }).body).toBe(`NIL 3B ${gstin} 092026`);
    expect(confirmationTemplate("GSTR3B")).toBe("CNF 3B <6-digit code>");
  });
  it("25. quarterly SMS uses quarter-end month", () => {
    expect(buildNilInitiationSms({ returnType: "GSTR1", gstin, periodKey: "062026", frequency: "QUARTERLY", today: "2026-07-01" }).body).toBe(`NIL R1 ${gstin} 062026`);
    expect(() => buildNilInitiationSms({ returnType: "GSTR1", gstin, periodKey: "052026", frequency: "QUARTERLY", today: "2026-07-01" })).toThrow(SmsCommandError);
  });
  it("26. refuses future / current periods", () => {
    expect(() => buildNilInitiationSms({ returnType: "GSTR1", gstin, periodKey: "112026", frequency: "MONTHLY", today: "2026-11-01" })).toThrow(/not ended/);
    expect(() => buildNilInitiationSms({ returnType: "GSTR1", gstin, periodKey: "012030", frequency: "MONTHLY", today: "2026-11-01" })).toThrow(/not ended/);
  });
  it("27. refuses invalid GSTINs", () => {
    expect(() => buildNilInitiationSms({ returnType: "GSTR1", gstin: "27ZZZFZ0001Z1ZA", periodKey: "092026", frequency: "MONTHLY", today: "2026-11-01" })).toThrow(/GSTIN/);
  });
  it("builds platform-specific sms: URIs and detects GSTN commands", () => {
    expect(smsComposerUri("14409", "NIL R1 X 092026", "android")).toBe("sms:14409?body=NIL%20R1%20X%20092026");
    expect(smsComposerUri("14409", "NIL R1 X 092026", "ios")).toBe("sms:14409&body=NIL%20R1%20X%20092026");
    expect(looksLikeGstnCommand("cnf r1 123456")).toBe(true);
    expect(looksLikeGstnCommand("BILL RAMESH 20 BOX 500")).toBe(false);
  });
});

describe("29. Filing state machine", () => {
  it("allows only evidence-backed transitions", () => {
    expect(canTransition("NOT_STARTED", "ELIGIBILITY_REVIEW")).toBe(true);
    expect(canTransition("ELIGIBILITY_REVIEW", "READY_FOR_GOVERNMENT_SMS")).toBe(false);
    expect(canTransition("READY_FOR_GOVERNMENT_SMS", "ARN_RECORDED_UNVERIFIED")).toBe(false);
    expect(canTransition("INITIATION_SENT_USER_REPORTED", "FILED_VERIFIED")).toBe(false);
    expect(canTransition("FILED_VERIFIED", "ELIGIBILITY_REVIEW")).toBe(false);
  });
  it("requires irreversible acknowledgement before the SMS step", () => {
    expect(() => assertTransition("ELIGIBLE_SELF_DECLARED", "READY_FOR_GOVERNMENT_SMS", { isDemo: false })).toThrow(FilingTransitionError);
    expect(() => assertTransition("ELIGIBLE_SELF_DECLARED", "READY_FOR_GOVERNMENT_SMS", { isDemo: false, irreversibleAcknowledged: true })).not.toThrow();
  });
  it("FILED_VERIFIED needs official evidence and is impossible for demos", () => {
    expect(() => assertTransition("ARN_RECORDED_UNVERIFIED", "FILED_VERIFIED", { isDemo: false, evidenceSource: "USER" })).toThrow(/official/);
    expect(() => assertTransition("ARN_RECORDED_UNVERIFIED", "FILED_VERIFIED", { isDemo: true, evidenceSource: "GSTN_OFFICIAL" })).toThrow(/demo/);
    expect(() => assertTransition("ARN_RECORDED_UNVERIFIED", "FILED_VERIFIED", { isDemo: false, evidenceSource: "GSTN_OFFICIAL" })).not.toThrow();
  });
});

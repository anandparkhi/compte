/**
 * Nil filing status model. Statuses reflect EVIDENCE, not intentions:
 *  - a user saying they sent an SMS is only ever "USER_REPORTED"
 *  - a user-typed ARN is "ARN_RECORDED_UNVERIFIED"
 *  - FILED_VERIFIED requires evidence from an official source (GSTN/GSP), which this MVP
 *    does not have — so it is unreachable until such an integration exists.
 */
export const FILING_STATUSES = [
  "NOT_STARTED",
  "ELIGIBILITY_REVIEW",
  "INELIGIBLE",
  "ELIGIBLE_SELF_DECLARED",
  "READY_FOR_GOVERNMENT_SMS",
  "INITIATION_SENT_USER_REPORTED",
  "AWAITING_GOVERNMENT_CONFIRMATION",
  "ARN_RECORDED_UNVERIFIED",
  "FILED_VERIFIED",
  "REJECTED",
  "NEEDS_MANUAL_REVIEW",
] as const;
export type FilingStatus = (typeof FILING_STATUSES)[number];

const TRANSITIONS: Record<FilingStatus, FilingStatus[]> = {
  NOT_STARTED: ["ELIGIBILITY_REVIEW"],
  ELIGIBILITY_REVIEW: ["ELIGIBILITY_REVIEW", "INELIGIBLE", "ELIGIBLE_SELF_DECLARED", "NEEDS_MANUAL_REVIEW"],
  INELIGIBLE: ["ELIGIBILITY_REVIEW"],
  NEEDS_MANUAL_REVIEW: ["ELIGIBILITY_REVIEW"],
  ELIGIBLE_SELF_DECLARED: ["READY_FOR_GOVERNMENT_SMS", "ELIGIBILITY_REVIEW"],
  READY_FOR_GOVERNMENT_SMS: ["INITIATION_SENT_USER_REPORTED", "ELIGIBILITY_REVIEW"],
  INITIATION_SENT_USER_REPORTED: ["AWAITING_GOVERNMENT_CONFIRMATION", "REJECTED"],
  AWAITING_GOVERNMENT_CONFIRMATION: ["ARN_RECORDED_UNVERIFIED", "REJECTED"],
  ARN_RECORDED_UNVERIFIED: ["FILED_VERIFIED", "NEEDS_MANUAL_REVIEW"],
  FILED_VERIFIED: [],
  REJECTED: ["ELIGIBILITY_REVIEW"],
};

export class FilingTransitionError extends Error {}

export interface TransitionContext {
  isDemo: boolean;
  /** source of the evidence supporting this transition */
  evidenceSource?: "USER" | "COMPTE_LEDGER" | "GSTN_OFFICIAL" | "DEMO_SIMULATOR";
  irreversibleAcknowledged?: boolean;
}

export function canTransition(from: FilingStatus, to: FilingStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: FilingStatus, to: FilingStatus, ctx: TransitionContext): void {
  if (!canTransition(from, to)) throw new FilingTransitionError(`Cannot move a nil filing from ${from} to ${to}`);
  if (to === "READY_FOR_GOVERNMENT_SMS" && !ctx.irreversibleAcknowledged) {
    throw new FilingTransitionError("You must confirm that a government filing cannot be undone before the SMS step is shown");
  }
  if (to === "FILED_VERIFIED") {
    if (ctx.isDemo) throw new FilingTransitionError("A demo simulation can never be marked as government-verified");
    if (ctx.evidenceSource !== "GSTN_OFFICIAL") throw new FilingTransitionError("FILED_VERIFIED requires evidence retrieved from an official GSTN/GSP source");
  }
}

/** Statuses after which the period must be treated as (being) filed nil — invoices for it are blocked */
export const COMMITTED_STATUSES: FilingStatus[] = ["READY_FOR_GOVERNMENT_SMS", "INITIATION_SENT_USER_REPORTED", "AWAITING_GOVERNMENT_CONFIRMATION", "ARN_RECORDED_UNVERIFIED", "FILED_VERIFIED"];

/** Statuses that hold the slot for a period (a new filing attempt for the same return/period is a duplicate) */
export const ACTIVE_OR_DONE_STATUSES: FilingStatus[] = [...COMMITTED_STATUSES];

export function isFiledLike(s: FilingStatus) {
  return s === "ARN_RECORDED_UNVERIFIED" || s === "FILED_VERIFIED";
}

/** Plain-language status labels (English; translations in i18n) */
export const STATUS_LABEL: Record<FilingStatus, string> = {
  NOT_STARTED: "Not started",
  ELIGIBILITY_REVIEW: "Eligibility review required",
  INELIGIBLE: "Not eligible for nil filing",
  ELIGIBLE_SELF_DECLARED: "Eligible (self-declared)",
  READY_FOR_GOVERNMENT_SMS: "Ready — send SMS to GSTN",
  INITIATION_SENT_USER_REPORTED: "You reported sending the SMS",
  AWAITING_GOVERNMENT_CONFIRMATION: "Waiting for GSTN acknowledgement",
  ARN_RECORDED_UNVERIFIED: "ARN recorded — not verified by Compte",
  FILED_VERIFIED: "Filed (verified)",
  REJECTED: "GSTN rejected / failed",
  NEEDS_MANUAL_REVIEW: "Needs manual review",
};

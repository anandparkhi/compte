import { Badge } from "@/components/ui";
import type { FilingStatus } from "@/lib/domain/filing-state";

const tone: Record<FilingStatus, "neutral" | "brand" | "warn" | "danger" | "info"> = {
  NOT_STARTED: "neutral",
  ELIGIBILITY_REVIEW: "warn",
  INELIGIBLE: "danger",
  ELIGIBLE_SELF_DECLARED: "info",
  READY_FOR_GOVERNMENT_SMS: "info",
  INITIATION_SENT_USER_REPORTED: "info",
  AWAITING_GOVERNMENT_CONFIRMATION: "info",
  ARN_RECORDED_UNVERIFIED: "warn",
  FILED_VERIFIED: "brand",
  REJECTED: "danger",
  NEEDS_MANUAL_REVIEW: "warn",
};

export function FilingStatusBadge({ status, label, demo }: { status: FilingStatus; label: string; demo?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={tone[status]}>{label}</Badge>
      {demo && <Badge tone="demo">DEMO</Badge>}
    </span>
  );
}

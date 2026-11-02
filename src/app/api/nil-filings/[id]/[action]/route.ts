import { AppError, handle } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { cancelBeforeSending, getFilingView, prepareSms, recordArn, reportConfirmationSent, reportInitiationSent, reportRejection, submitAssessment } from "@/server/services/nil-filing";

type P = { params: Promise<{ id: string; action: string }> };

export async function GET(_: Request, { params }: P) {
  return handle(async () => {
    const { id, action } = await params;
    if (action !== "view") throw new AppError(404, "NOT_FOUND", "Unknown action");
    return getFilingView(await requireApiContext(), id);
  });
}

export async function POST(req: Request, { params }: P) {
  return handle(async () => {
    const ctx = await requireApiContext();
    const { id, action } = await params;
    const body = await req.json().catch(() => ({}));
    switch (action) {
      case "assess": return submitAssessment(ctx, id, body);
      case "prepare": return prepareSms(ctx, id, body);
      case "cancel": return cancelBeforeSending(ctx, id);
      case "initiation-sent": return reportInitiationSent(ctx, id);
      case "confirmation-sent": return reportConfirmationSent(ctx, id);
      case "arn": return recordArn(ctx, id, body);
      case "rejected": return reportRejection(ctx, id, body);
      default: throw new AppError(404, "NOT_FOUND", "Unknown action");
    }
  });
}

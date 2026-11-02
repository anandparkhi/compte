import { handle } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { getBusiness, updateBusiness } from "@/server/services/business";

export async function GET() {
  return handle(async () => getBusiness(await requireApiContext()));
}
export async function PUT(req: Request) {
  return handle(async () => updateBusiness(await requireApiContext(), await req.json()));
}

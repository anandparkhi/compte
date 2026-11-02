import { handle } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { createCustomer, listCustomers } from "@/server/services/catalog";

export async function GET() {
  return handle(async () => listCustomers(await requireApiContext()));
}
export async function POST(req: Request) {
  return handle(async () => createCustomer(await requireApiContext(), await req.json()), 201);
}

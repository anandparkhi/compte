import { handle } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { createProduct, listProducts } from "@/server/services/catalog";

export async function GET() {
  return handle(async () => listProducts(await requireApiContext()));
}
export async function POST(req: Request) {
  return handle(async () => createProduct(await requireApiContext(), await req.json()), 201);
}

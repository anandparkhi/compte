import { handle, AppError } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { previewImport,saveImport,listImports } from "@/server/services/gst-import";
export const runtime = "nodejs";
export async function GET() { return handle(async () => listImports(await requireApiContext())); }
export async function POST(req:Request) {
  return handle(async () => {
    const ctx = await requireApiContext();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError(400,"FILE_REQUIRED","Select a GST return file");
    const mode = form.get("mode");
    if (mode === "preview") return previewImport(ctx,file);
    if (mode === "commit" && form.get("confirm") === "IMPORT") return saveImport(ctx,file,form.get("customers")==="true");
    throw new AppError(400,"INVALID_MODE","Preview the file before confirming import");
  });
}

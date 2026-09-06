import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { updateLabBill } from "@/lib/pay-service";
import { errorResponse } from "@/lib/api-error";

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Lab bill file upload — writes under public/lab-bills for clickable /pay/… URLs (Step 15). */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("pay:edit-bills");
    const form = await req.formData();
    const file = form.get("file");
    const labBillId = form.get("labBillId");
    const entityName = form.get("entity_name");

    if (!(file instanceof File) || typeof labBillId !== "string") {
      return NextResponse.json({ error: "file and labBillId are required" }, { status: 400 });
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ error: "Invalid file type. Only PDF and images allowed." }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum 5MB allowed." }, { status: 400 });
    }

    const safeName = String(entityName ?? "lab")
      .replace(/[^a-zA-Z0-9]/g, "_")
      .slice(0, 30);
    const filename = `${safeName}.${ext}`;
    const relDir = path.join("lab-bills", session.practiceId, labBillId);
    const publicDir = path.join(process.cwd(), "public", relDir);
    await mkdir(publicDir, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(publicDir, filename), buf);

    // App basePath is /pay — store absolute URL so PDF links are clickable.
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3001";
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const fileUrl = `${proto}://${host}/pay/${relDir.replace(/\\/g, "/")}/${filename}`;

    const labBill = await updateLabBill(session.practiceId, labBillId, { fileUrl });
    return NextResponse.json({ ok: true, fileUrl, labBill });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof Error && err.message === "Lab bill not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return errorResponse(err);
  }
}

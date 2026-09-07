import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { storeUploadedFile } from "@/lib/blob-upload";

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Upload a lab bill file for a payslip JSON lab row (returns URL only —
 * client stores it on labBillsJson.file_url). AuraPay parity for in-payslip upload.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:edit-bills");
    const { id: payPeriodId } = await params;
    const form = await req.formData();
    const file = form.get("file");
    const entityName = form.get("entity_name");
    const payslipEntryId = form.get("payslipEntryId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
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
    const entryKey =
      typeof payslipEntryId === "string" && payslipEntryId.trim()
        ? payslipEntryId.slice(0, 24)
        : "entry";
    const filename = `${safeName}-${Date.now()}.${ext}`;
    const pathname = `lab-bills/${session.practiceId}/${payPeriodId}/${entryKey}/${filename}`;
    const fileUrl = await storeUploadedFile({
      pathname,
      data: file,
      contentType: file.type,
      req,
    });

    return NextResponse.json({ ok: true, fileUrl });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return errorResponse(err);
  }
}

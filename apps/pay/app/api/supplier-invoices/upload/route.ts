import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { updateSupplierInvoice } from "@/lib/pay-service";
import { errorResponse } from "@/lib/api-error";
import { storeUploadedFile } from "@/lib/blob-upload";

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Supplier invoice file upload — Vercel Blob when token present, else public/supplier-invoices. */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("pay:edit-bills");
    const form = await req.formData();
    const file = form.get("file");
    const supplierInvoiceId = form.get("supplierInvoiceId");
    const entityName = form.get("entity_name");

    if (!(file instanceof File) || typeof supplierInvoiceId !== "string") {
      return NextResponse.json({ error: "file and supplierInvoiceId are required" }, { status: 400 });
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ error: "Invalid file type. Only PDF and images allowed." }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum 5MB allowed." }, { status: 400 });
    }

    const safeName = String(entityName ?? "supplier")
      .replace(/[^a-zA-Z0-9]/g, "_")
      .slice(0, 30);
    const filename = `${safeName}.${ext}`;
    const pathname = `supplier-invoices/${session.practiceId}/${supplierInvoiceId}/${filename}`;
    const fileUrl = await storeUploadedFile({
      pathname,
      data: file,
      contentType: file.type,
      req,
    });

    const supplierInvoice = await updateSupplierInvoice(session.practiceId, supplierInvoiceId, {
      fileUrl,
    });
    return NextResponse.json({ ok: true, fileUrl, supplierInvoice });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof Error && err.message === "Supplier invoice not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return errorResponse(err);
  }
}

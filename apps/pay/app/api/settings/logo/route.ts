import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { savePaySettings } from "@/lib/pay-settings-service";
import { errorResponse } from "@/lib/api-error";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"]);
const MAX_SIZE = 2 * 1024 * 1024;

/** Clinic logo upload — local placeholder URL (legacy Vercel Blob deferred). */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("practice:manage");
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Use PNG, JPG, SVG, or WebP" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 2MB" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "png";
    const url = `local://settings/logo/${session.practiceId}/${Date.now()}.${ext}`;
    await savePaySettings(session.practiceId, { clinic_logo_url: url });

    return NextResponse.json({ ok: true, url });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return errorResponse(err);
  }
}

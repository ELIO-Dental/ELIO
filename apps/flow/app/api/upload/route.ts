import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

const MAX_FILE_SIZE = 1024 * 1024;
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/webp",
];

/** F3.3 — upload logo as base64 data URL (legacy ElioFlow settings, max 1MB). */
export async function POST(req: Request) {
  try {
    await requirePermission("practice:manage");
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 1MB." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: PNG, JPEG, SVG, ICO, WebP." },
        { status: 400 },
      );
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const url = `data:${file.type};base64,${base64}`;

    return NextResponse.json({ url, filename: file.name, size: file.size });
  } catch (e) {
    return errorResponse(e);
  }
}

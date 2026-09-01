import { NextResponse } from "next/server";
import { encryptSecret } from "@elio/auth";
import { scopedDb } from "@elio/db";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** Rotate per-practice Dentally API key (legacy admin clinics token, Y3.7). */
export async function PUT(req: Request) {
  try {
    const session = await requirePermission("practice:manage");
    const body = (await req.json()) as { apiKey?: string };
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey) {
      return NextResponse.json({ error: "Dentally API key is required" }, { status: 400 });
    }

    const db = scopedDb(session.practiceId);
    await db.practice.update({
      where: { id: session.practiceId },
      data: {
        dentallyApiKey: encryptSecret(apiKey),
        dentallyConnectionStatus: "NOT_CONNECTED",
      },
    });

    return NextResponse.json({ ok: true, configured: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return errorResponse(err);
  }
}

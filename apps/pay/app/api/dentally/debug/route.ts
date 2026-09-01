import { NextResponse } from "next/server";
import { runDentallyConnectionDebug } from "@/lib/dentally-debug";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { auth, can } from "@elio/auth";
import type { Role } from "@elio/db";

/** Debug Dentally users vs stored dentist practitioner IDs (legacy Y3.6). */
export async function GET() {
  try {
    const session = await requirePermission("pay:view");

    if (process.env.NODE_ENV === "production") {
      const fullSession = await auth();
      if (!fullSession || !can({ role: fullSession.role as Role }, "practice:manage")) {
        return NextResponse.json(
          { error: "Debug endpoints are restricted to practice owners in production" },
          { status: 403 }
        );
      }
    }

    const data = await runDentallyConnectionDebug(session.practiceId);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof Error && err.message.includes("Site ID")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err);
  }
}

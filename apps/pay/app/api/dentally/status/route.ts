import { NextResponse } from "next/server";
import { getPayDentallyIntegrationStatus } from "@/lib/dentally-integration";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("pay:view");
    const testConnection = new URL(req.url).searchParams.get("test") === "1";
    if (testConnection) {
      await requirePermission("practice:manage");
    }
    const status = await getPayDentallyIntegrationStatus(session.practiceId, { testConnection });
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return errorResponse(err);
  }
}

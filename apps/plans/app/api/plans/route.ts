import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { listPlans, createPlan } from "@/lib/plans-service";

export async function GET() {
  try {
    const session = await requirePermission("plans:view-payments");
    const plans = await listPlans(session.practiceId);
    return NextResponse.json({ plans });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("plans:edit");
    const body = await req.json();
    if (typeof body?.name !== "string" || typeof body?.monthlyPricePence !== "number") {
      return NextResponse.json({ error: "name and monthlyPricePence are required" }, { status: 400 });
    }
    const plan = await createPlan(session.practiceId, body);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

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
    if (typeof body?.name !== "string" || body.name.trim() === "") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const monthlyPricePence =
      typeof body?.monthlyPricePence === "number"
        ? body.monthlyPricePence
        : Math.round(Number(body?.monthlyPrice) * 100);
    if (!Number.isFinite(monthlyPricePence) || monthlyPricePence < 0) {
      return NextResponse.json({ error: "monthlyPricePence must be a non-negative number" }, { status: 400 });
    }
    const plan = await createPlan(session.practiceId, {
      name: body.name.trim(),
      monthlyPricePence,
      description: typeof body.description === "string" ? body.description : null,
      publicDescription: typeof body.publicDescription === "string" ? body.publicDescription : null,
      gocardlessLink: typeof body.gocardlessLink === "string" ? body.gocardlessLink.trim() || null : null,
      active: body.active !== false,
      eligibilityDentalFit: body.eligibilityDentalFit === true,
      requiresAdultMembership: body.requiresAdultMembership === true,
      inclusions: Array.isArray(body.inclusions) ? body.inclusions : [],
      discounts: Array.isArray(body.discounts) ? body.discounts : [],
      eligibilityRules: Array.isArray(body.eligibilityRules) ? body.eligibilityRules : [],
    });
    return NextResponse.json({ plan }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

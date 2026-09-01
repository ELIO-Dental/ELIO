import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { deletePlan, getPlan, updatePlan, type PlanWriteInput } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

function parsePlanBody(body: unknown): PlanWriteInput {
  const b = body as Record<string, unknown>;
  if (typeof b?.name !== "string" || b.name.trim() === "") {
    throw new Error("name is required");
  }
  const monthlyPricePence =
    typeof b.monthlyPricePence === "number"
      ? b.monthlyPricePence
      : Math.round(Number(b.monthlyPrice) * 100);
  if (!Number.isFinite(monthlyPricePence) || monthlyPricePence < 0) {
    throw new Error("monthlyPricePence must be a non-negative number");
  }

  return {
    name: b.name.trim(),
    monthlyPricePence,
    description: typeof b.description === "string" ? b.description : null,
    publicDescription: typeof b.publicDescription === "string" ? b.publicDescription : null,
    gocardlessLink: typeof b.gocardlessLink === "string" ? b.gocardlessLink.trim() || null : null,
    active: b.active !== false,
    eligibilityDentalFit: b.eligibilityDentalFit === true,
    requiresAdultMembership: b.requiresAdultMembership === true,
    dentistPayoutPerExamPence:
      typeof b.dentistPayoutPerExamPence === "number" ? b.dentistPayoutPerExamPence : null,
    sortOrder: typeof b.sortOrder === "number" ? b.sortOrder : 0,
    inclusions: Array.isArray(b.inclusions)
      ? b.inclusions.map((inc: Record<string, unknown>, idx: number) => ({
          name: String(inc.name ?? ""),
          itemType: typeof inc.itemType === "string" ? inc.itemType : "OTHER",
          quantity: typeof inc.quantity === "number" ? inc.quantity : null,
          period: typeof inc.period === "string" ? inc.period : null,
          description: typeof inc.description === "string" ? inc.description : null,
          sortOrder: typeof inc.sortOrder === "number" ? inc.sortOrder : idx,
        }))
      : [],
    discounts: Array.isArray(b.discounts)
      ? b.discounts.map((disc: Record<string, unknown>, idx: number) => ({
          name: String(disc.name ?? ""),
          percentage: Number(disc.percentage) || 0,
          applicableTo: typeof disc.applicableTo === "string" ? disc.applicableTo : null,
          excludes: typeof disc.excludes === "string" ? disc.excludes : null,
          description: typeof disc.description === "string" ? disc.description : null,
          sortOrder: typeof disc.sortOrder === "number" ? disc.sortOrder : idx,
        }))
      : [],
    eligibilityRules: Array.isArray(b.eligibilityRules)
      ? b.eligibilityRules.map((rule: Record<string, unknown>, idx: number) => ({
          ruleType: String(rule.ruleType ?? ""),
          ruleValue: typeof rule.ruleValue === "string" ? rule.ruleValue : null,
          description: typeof rule.description === "string" ? rule.description : null,
          active: rule.active !== false,
          sortOrder: typeof rule.sortOrder === "number" ? rule.sortOrder : idx,
        }))
      : [],
  };
}

/** Get a single plan (P4.1). */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:view-payments");
    const { id } = await params;
    const plan = await getPlan(session.practiceId, id);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    return NextResponse.json({ plan });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Update plan with inclusions, discounts, eligibility rules (P4.1). */
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:edit");
    const { id } = await params;
    const input = parsePlanBody(await req.json());
    const plan = await updatePlan(session.practiceId, id, input);
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.plan.updated",
      targetType: "PlanModel",
      targetId: id,
      metadata: { name: input.name },
    });
    return NextResponse.json({ plan });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Delete plan when no enrolled patients (P4.1). */
export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:edit");
    const { id } = await params;
    await deletePlan(session.practiceId, id);
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.plan.deleted",
      targetType: "PlanModel",
      targetId: id,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return errorResponse(e);
  }
}

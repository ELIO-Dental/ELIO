import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-error";
import { getSignupByToken } from "@/lib/plans-service";
import { getBrandingSettings } from "@/lib/plans-settings";

/**
 * PUBLIC, UNAUTHENTICATED route — the patient signup flow's data fetch.
 * Deliberately does NOT call requirePermission()/auth(): the caller has no
 * staff session, only the invite token in the URL. Excluded from
 * middleware.ts's session gate (see that file's PUBLIC_PATHS/matcher).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const result = await getSignupByToken(token);
    if (!result) {
      return NextResponse.json({ error: "This signup link is invalid." }, { status: 404 });
    }
    if (result.expired) {
      return NextResponse.json({ error: "This signup link has expired. Please contact your practice for a new invite." }, { status: 410 });
    }

    const { signingRequest } = result;
    const { planPatient, document } = signingRequest;
    const { patient, planModel, patientPlans, mandates } = planPatient;
    const branding = await getBrandingSettings(signingRequest.practiceId);

    return NextResponse.json({
      patient: {
        firstName: patient.firstName ?? "",
        lastName: patient.lastName ?? "",
        email: patient.email ?? "",
        dateOfBirth: patient.dateOfBirth,
      },
      plan: planModel
        ? {
            id: planModel.id,
            name: planModel.name,
            monthlyPricePence: planModel.monthlyPricePence,
            publicDescription: planModel.publicDescription,
            inclusions: planModel.inclusions.map((i) => ({ name: i.name, quantity: i.quantity, period: i.period })),
            discounts: planModel.discounts.map((d) => ({ name: d.name, percentage: Number(d.percentage) })),
          }
        : null,
      document: document
        ? { id: document.id, title: document.title, content: document.content, version: document.version }
        : null,
      alreadySigned: !!signingRequest.signedAt,
      hasMandate: mandates.length > 0,
      enrolmentStatus: patientPlans[0]?.status ?? null,
      branding,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-error";
import { publicCreateMandateFlow, publicRecordMandate } from "@/lib/plans-service";

/**
 * PUBLIC, UNAUTHENTICATED — signup step 3, GoCardless Direct Debit mandate.
 * POST starts a Billing Request Flow (redirect the browser to flow.authorisation_url).
 * PATCH is the flow's callback confirming a mandate id (THEME_GUIDELINE §6.6:
 * this is a real-money step, so both the client and this route must behave
 * predictably under retry — recordMandate/publicRecordMandate are idempotent).
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await req.json().catch(() => ({}));
    if (typeof body?.redirectUri !== "string" || typeof body?.exitUri !== "string") {
      return NextResponse.json({ error: "redirectUri and exitUri are required" }, { status: 400 });
    }
    const result = await publicCreateMandateFlow(token, { redirectUri: body.redirectUri, exitUri: body.exitUri });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await req.json();
    if (typeof body?.gocardlessMandateId !== "string") {
      return NextResponse.json({ error: "gocardlessMandateId is required" }, { status: 400 });
    }
    const result = await publicRecordMandate(token, body.gocardlessMandateId);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

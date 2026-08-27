import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-error";
import { publicResolveMandateFromBillingRequest } from "@/lib/plans-service";

/**
 * PUBLIC, UNAUTHENTICATED — GoCardless redirects the patient's browser back
 * here (redirectUri) after the Billing Request Flow completes. GoCardless
 * appends the billing request id as a query param; the page calls this route
 * (not GoCardless directly) so the mandate gets recorded server-side before
 * the UI advances to the completion step.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const url = new URL(req.url);
    const billingRequestId = url.searchParams.get("billing_request_id") ?? url.searchParams.get("billing_request");
    if (!billingRequestId) {
      return NextResponse.json({ error: "Missing billing_request_id from GoCardless redirect" }, { status: 400 });
    }
    const result = await publicResolveMandateFromBillingRequest(token, billingRequestId);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

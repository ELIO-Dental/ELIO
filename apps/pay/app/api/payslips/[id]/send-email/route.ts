import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { getPaySettings } from "@/lib/pay-settings-service";
import { loadPayslipPdfInput } from "@/lib/payslip-load";
import { PayslipEmailConfigError, sendPayslipEmail } from "@/lib/payslip-email";
import { resolvePayPractitionerScope } from "@/lib/pay-scope";

/** Email a single payslip PDF to the dentist (legacy send-email, Y3.8 / Step 30). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAnyPermission(
      "pay:download-payslip",
      "pay:download-payslip:own"
    );
    const { id } = await params;
    const scope = await resolvePayPractitionerScope(session.practiceId, session);

    const payslip = await loadPayslipPdfInput(session.practiceId, id, { scope });
    if (!payslip) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const settings = await getPaySettings(session.practiceId);
    const { to } = await sendPayslipEmail({ payslip, settings });

    return NextResponse.json({ ok: true, message: `Email sent to ${to}` });
  } catch (err) {
    if (err instanceof PayslipEmailConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err);
  }
}

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { getPaySettings } from "@/lib/pay-settings-service";
import { loadPayslipPdfInput } from "@/lib/payslip-load";
import { PayslipEmailConfigError, sendPayslipEmail } from "@/lib/payslip-email";

/** Email a single payslip PDF to the dentist (legacy send-email, Y3.8). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:download-payslip");
    const { id } = await params;

    const payslip = await loadPayslipPdfInput(session.practiceId, id);
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

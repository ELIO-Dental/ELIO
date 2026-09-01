import { NextResponse } from "next/server";
import {
  generateStarlingCsv,
  listUnpaidBillsForBulkPayment,
  markBillsPaid,
} from "@/lib/bulk-payment";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** Unpaid bills + bulk mark paid + Starling CSV (legacy /api/bills/bulk-payment, Y3.4). */
export async function GET() {
  try {
    const session = await requirePermission("pay:view");
    const data = await listUnpaidBillsForBulkPayment(session.practiceId);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("pay:edit-bills");
    const body = (await req.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "mark_paid") {
      const type = body.type === "supplier" ? "supplier" : body.type === "lab" ? "lab" : null;
      const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];
      if (!type || ids.length === 0) {
        return NextResponse.json({ error: "type and ids are required" }, { status: 400 });
      }
      const count = await markBillsPaid(session.practiceId, type, ids);
      return NextResponse.json({ ok: true, count });
    }

    if (action === "generate_csv") {
      const payments = Array.isArray(body.payments) ? body.payments : null;
      if (!payments) {
        return NextResponse.json({ error: "payments array is required" }, { status: 400 });
      }
      const csv = generateStarlingCsv(
        payments.map((p) => ({
          account_name: typeof p.account_name === "string" ? p.account_name : undefined,
          entity_name: typeof p.entity_name === "string" ? p.entity_name : "",
          sort_code: typeof p.sort_code === "string" ? p.sort_code : undefined,
          account_number: typeof p.account_number === "string" ? p.account_number : undefined,
          amount: typeof p.amount === "number" ? p.amount : 0,
          reference: typeof p.reference === "string" ? p.reference : undefined,
        }))
      );
      return NextResponse.json({ ok: true, csv });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return errorResponse(err);
  }
}

import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { requireViewPayments } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { listPlanEmailLogs } from "@/lib/patient-correspondence";

type RouteParams = { params: Promise<{ id: string }> };

/** Email history + signed documents for the Correspondence tab (legacy EmailLog). */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const session = await requireViewPayments();
    const { id } = await params;
    const db = scopedDb(session.practiceId);

    const planPatient = await db.planPatient.findFirst({ where: { id } });
    if (!planPatient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

    const [emails, documentAcceptances] = await Promise.all([
      listPlanEmailLogs(session.practiceId, id),
      db.planDocumentAcceptance.findMany({
        where: { planPatientId: id },
        include: { document: { select: { id: true, title: true, type: true, version: true } } },
        orderBy: { acceptedAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      emails: (emails ?? []).map((email) => ({
        id: email.id,
        to: email.to,
        subject: email.subject,
        type: email.type,
        status: email.status,
        messageId: email.messageId,
        error: email.error,
        createdAt: email.createdAt.toISOString(),
        sentByEmail: email.sentBy?.email ?? null,
      })),
      documentAcceptances: documentAcceptances.map((a) => ({
        id: a.id,
        acceptedAt: a.acceptedAt.toISOString(),
        document: a.document,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

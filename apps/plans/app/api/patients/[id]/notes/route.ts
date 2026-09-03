import { NextResponse } from "next/server";
import { requirePermission, requireViewPayments } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { addPlanPatientNote, listPlanPatientNotes } from "@/lib/patient-correspondence";

type RouteParams = { params: Promise<{ id: string }> };

/** List staff notes for a plan patient (legacy PatientNote). */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const session = await requireViewPayments();
    const { id } = await params;
    const notes = await listPlanPatientNotes(session.practiceId, id);
    if (!notes) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    return NextResponse.json({
      notes: notes.map((note) => ({
        id: note.id,
        content: note.content,
        createdAt: note.createdAt.toISOString(),
        authorEmail: note.author?.email ?? null,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Add a staff note to a plan patient. */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:invite-patients");
    const { id } = await params;
    const body = await req.json();
    const content = typeof body?.content === "string" ? body.content : "";
    const note = await addPlanPatientNote(session.practiceId, id, session.userId, content);
    return NextResponse.json(
      {
        note: {
          id: note.id,
          content: note.content,
          createdAt: note.createdAt.toISOString(),
          authorEmail: note.author?.email ?? null,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

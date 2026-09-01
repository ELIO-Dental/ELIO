import { NextResponse } from "next/server";
import { requirePermission, resolveFlowScope } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { moveStage, type PipelineColumn } from "@/lib/flow-service";
import { assertConsultInScope } from "@/lib/flow-scope";
import { resolveAuditActor } from "@elio/auth";

const VALID_COLUMNS: PipelineColumn[] = ["capture", "consult_quote", "thinking", "reminders", "closed"];

/** Kanban drag-drop endpoint — called optimistically from pipeline-board.tsx
 * (THEME_GUIDELINE.md §6.6: UI moves the card first, this call happens in
 * the background, and the caller rolls back on failure). */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("flow:capture-enquiry");
    const scope = await resolveFlowScope(session);
    const body = await req.json().catch(() => ({}));
    const { cardId, toColumn } = body ?? {};
    if (typeof cardId !== "string" || !VALID_COLUMNS.includes(toColumn)) {
      return NextResponse.json({ error: "cardId and a valid toColumn are required" }, { status: 400 });
    }
    await assertConsultInScope(session.practiceId, cardId, scope);
    const result = await moveStage(session.practiceId, resolveAuditActor(session), cardId, toColumn);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

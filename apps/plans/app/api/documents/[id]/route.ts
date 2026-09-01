import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import type { PlanDocumentType } from "@elio/db";
import { requireLicensedSession, requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { getDocument, updateDocument } from "@/lib/documents-service";

type RouteParams = { params: Promise<{ id: string }> };

const DOCUMENT_TYPES: PlanDocumentType[] = ["TERMS_AND_CONDITIONS", "PRIVACY_POLICY", "PLAN_AGREEMENT"];

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const session = await requireLicensedSession();
    const { id } = await params;
    const document = await getDocument(session.practiceId, id);
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    return NextResponse.json({ document });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:edit-settings");
    const { id } = await params;
    const body = await req.json();
    const b = body as Record<string, unknown>;

    const input: Parameters<typeof updateDocument>[2] = {};
    if (typeof b.type === "string" && DOCUMENT_TYPES.includes(b.type as PlanDocumentType)) {
      input.type = b.type as PlanDocumentType;
    }
    if (typeof b.title === "string") input.title = b.title;
    if (typeof b.content === "string") input.content = b.content;
    if (typeof b.version === "string") input.version = b.version;
    if (typeof b.effectiveDate === "string") input.effectiveDate = b.effectiveDate;
    if (typeof b.isActive === "boolean") input.isActive = b.isActive;

    const document = await updateDocument(session.practiceId, id, input);
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.document.updated",
      targetType: "PlanDocument",
      targetId: id,
      metadata: { type: document.type, version: document.version },
    });
    return NextResponse.json({ document });
  } catch (e) {
    return errorResponse(e);
  }
}

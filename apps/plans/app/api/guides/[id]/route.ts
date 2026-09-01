import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requireLicensedSession, requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { deleteGuideArticle, getGuideArticle, updateGuideArticle } from "@/lib/guides-service";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const session = await requireLicensedSession();
    const { id } = await params;
    const article = await getGuideArticle(session.practiceId, id);
    if (!article) return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    return NextResponse.json({ article });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:edit-settings");
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const article = await updateGuideArticle(session.practiceId, id, {
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      ...(typeof body.slug === "string" ? { slug: body.slug } : {}),
      ...(typeof body.content === "string" ? { content: body.content } : {}),
      ...(typeof body.category === "string" ? { category: body.category } : {}),
      ...(typeof body.sortOrder === "number" ? { sortOrder: body.sortOrder } : {}),
      ...(typeof body.published === "boolean" ? { published: body.published } : {}),
    });

    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.guide.updated",
      targetType: "PlanGuideArticle",
      targetId: id,
      metadata: { title: article.title },
    });

    return NextResponse.json({ article });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:edit-settings");
    const { id } = await params;
    await deleteGuideArticle(session.practiceId, id);

    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.guide.deleted",
      targetType: "PlanGuideArticle",
      targetId: id,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return errorResponse(e);
  }
}

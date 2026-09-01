import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requireLicensedSession, requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { createGuideArticle, listGuideArticles } from "@/lib/guides-service";

export async function GET(req: Request) {
  try {
    const session = await requireLicensedSession();
    const category = new URL(req.url).searchParams.get("category") ?? undefined;
    const articles = await listGuideArticles(session.practiceId, { category, publishedOnly: true });
    return NextResponse.json({ articles });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("plans:edit-settings");
    const body = await req.json().catch(() => ({}));
    const { title, slug, content, category, sortOrder, published } = body ?? {};
    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (typeof slug !== "string" || !slug.trim()) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }
    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const article = await createGuideArticle(session.practiceId, {
      title,
      slug,
      content,
      category,
      sortOrder,
      published,
    });

    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.guide.created",
      targetType: "PlanGuideArticle",
      targetId: article.id,
      metadata: { title: article.title, category: article.category },
    });

    return NextResponse.json({ article }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
